import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import {
  type DesignConflict,
  type DesignValidation,
  hashScenario,
  scenarioSchema,
  type AchievedPoseLandmarks,
  type PoseClip,
  type PoseSample,
  type Scenario
} from "../../../../../packages/schema/src/index";
import standardScenarioJson from "../../../../../tests/fixtures/scenarios/standard-v1.json";

import { useAppServices } from "../../app/AppProviders";
import { registerPoseTestControls, type PoseCheckpoint } from "../../test-hooks";
import { selectScenarioState, selectStoreActions, useAppStore } from "../../state/store";
import { feasiblePoseLimits, poseEnvelopeLimits, type PoseFeasibleLimits } from "./pose-limits";
import {
  normalizePoseTargets,
  poseAuthoringRange,
  poseSampleHasReachableLegs,
  sanitizePoseSample,
  type PoseSamplingState
} from "./pose-sampling";

type JointName = "knee" | "hip" | "spine";

type EditableKey = {
  id: string;
  s: number;
  label: string;
  targets: Record<JointName, number>;
};

const minimumGap = 0.001;
const defaultScenario = scenarioSchema.parse(standardScenarioJson);
const zeroPoint = { x: 0, y: 0 };
const zeroLandmarks: AchievedPoseLandmarks = {
  pedalContact: zeroPoint,
  ankle: zeroPoint,
  knee: zeroPoint,
  hip: zeroPoint,
  shoulder: zeroPoint,
  elbow: zeroPoint,
  hand: zeroPoint,
  handlebarContact: zeroPoint,
  head: zeroPoint
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const toEditableKeys = (clip: PoseClip, scenario?: Scenario): EditableKey[] =>
  clip.keys.map((key) => ({
    id: crypto.randomUUID(),
    s: key.s,
    label: key.label,
    targets: scenario
      ? normalizePoseTargets(scenario, key.targets).targets
      : { knee: key.targets.knee, hip: key.targets.hip, spine: key.targets.spine }
  }));

const toPoseClip = (
  base: PoseClip,
  keys: EditableKey[],
  interpolation: PoseClip["interpolation"]
): PoseClip => ({
  id: base.id,
  name: base.name,
  interpolation,
  keys: keys.map((key) => ({
    s: key.s,
    label: key.label,
    targets: { ...key.targets }
  }))
});

const sortedKeys = (keys: EditableKey[]): EditableKey[] =>
  [...keys].sort((left, right) => left.s - right.s);

const findIndexById = (keys: EditableKey[], id: string | null): number => {
  if (!id) {
    return 0;
  }
  const index = keys.findIndex((key) => key.id === id);
  return index >= 0 ? index : 0;
};

const asFinite = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export const useDesignerEditor = () => {
  const services = useAppServices();
  const navigate = useNavigate();
  const actions = useAppStore(selectStoreActions);
  const scenarioState = useAppStore(selectScenarioState);

  const [initialized, setInitialized] = useState(false);
  const [statusLabel, setStatusLabel] = useState("loading");
  const [source, setSource] = useState<"solver" | "representative-fixture">("solver");
  const [keyframes, setKeyframes] = useState<EditableKey[]>([]);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [playheadS, setPlayheadS] = useState(0);
  const [interpolation, setInterpolation] = useState<PoseClip["interpolation"]>("cubic");
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [sampling, setSampling] = useState<PoseSamplingState | null>(null);
  const [feasibleLimits, setFeasibleLimits] = useState<PoseFeasibleLimits | null>(null);
  const [envelopeLimits, setEnvelopeLimits] = useState<PoseFeasibleLimits | null>(null);
  const [saturationReason, setSaturationReason] = useState<string | null>(null);
  const [designValidation, setDesignValidation] = useState<DesignValidation | null>(null);
  const [limitingConflicts, setLimitingConflicts] = useState<DesignConflict[]>([]);
  const [validationPending, setValidationPending] = useState(true);

  const initializedScenarioIdRef = useRef<string | null>(null);
  const initialClipRef = useRef<PoseClip | null>(null);
  const sampleRequestRef = useRef(0);
  const editRequestRef = useRef(0);
  const validationRequestRef = useRef(0);
  const jointEditFrameRef = useRef<number | null>(null);
  const pendingJointEditRef = useRef<{ joint: JointName; value: number } | null>(null);
  const envelopeSignatureRef = useRef<string | null>(null);
  const limitsBusyRef = useRef(false);
  const limitsQueuedRef = useRef<(() => Promise<void>) | null>(null);
  const poseCheckpointRef = useRef<PoseCheckpoint>({
    selectedKeyId: null,
    selectedIndex: -1,
    saturated: false,
    reason: null,
    minimumSeparation: null,
    contacts: [],
    inferredSaddleContact: false,
    acceptedTargets: null,
    conflictCodes: [],
    affectedKeyIndices: [],
    canSolve: null,
    targets: null,
    derivedArm: null,
    landmarks: null
  });

  const scenario = scenarioState.scenario;

  useEffect(() => {
    actions.setRoute("/designer");
  }, [actions]);

  useEffect(() => {
    let active = true;

    const prepare = async () => {
      try {
        if (!useAppStore.getState().scenario.scenario) {
          const hash = await hashScenario(defaultScenario);
          actions.setScenario(defaultScenario, hash);
        }

        const manifest = await services.solverGateway.initialize(
          "0.4.0",
          defaultScenario.solver.solverVersion
        );
        if (!active) {
          return;
        }
        setSource(manifest.modelVersion.includes("fixture") ? "representative-fixture" : "solver");
        setStatusLabel("ready");
      } catch (error) {
        if (!active) {
          return;
        }
        setStatusLabel("error");
        setSurfaceError(error instanceof Error ? error.message : "Pose core unavailable");
      } finally {
        if (active) {
          setInitialized(true);
        }
      }
    };

    void prepare();
    return () => {
      active = false;
    };
  }, [actions, services.solverGateway]);

  useEffect(() => {
    if (!scenario) {
      return;
    }

    if (initializedScenarioIdRef.current === scenario.id) {
      return;
    }

    const editable = toEditableKeys(scenario.poseClip, scenario);
    const normalizedClip = toPoseClip(scenario.poseClip, editable, scenario.poseClip.interpolation);
    const selected = editable[0]?.id ?? null;
    initializedScenarioIdRef.current = scenario.id;
    initialClipRef.current = structuredClone(normalizedClip);

    // Opening the editor never rewrites the scenario; the normalized clip is only written
    // back by the first real edit, so merely viewing a run does not mark it changed.
    setKeyframes(editable);
    setSelectedKeyId(selected);
    setPlayheadS(editable[0]?.s ?? 0);
    setInterpolation(scenario.poseClip.interpolation);
  }, [actions, scenario]);

  const selectedIndex = useMemo(
    () => findIndexById(keyframes, selectedKeyId),
    [keyframes, selectedKeyId]
  );
  const selectedKey = keyframes[selectedIndex] ?? null;

  const commitScenario = useCallback(
    (
      nextKeys: EditableKey[],
      nextInterpolation: PoseClip["interpolation"],
      nextSelectionId?: string | null
    ) => {
      if (!scenario) {
        return;
      }

      const sorted = sortedKeys(nextKeys);
      const clip = toPoseClip(scenario.poseClip, sorted, nextInterpolation);

      actions.updateScenario((current) =>
        scenarioSchema.parse({
          ...current,
          poseClip: clip
        })
      );

      setKeyframes(sorted);
      if (nextSelectionId !== undefined) {
        setSelectedKeyId(nextSelectionId);
      }
    },
    [actions, scenario]
  );

  const validateCandidate = useCallback(
    async (
      nextKeys: EditableKey[],
      nextInterpolation: PoseClip["interpolation"],
      nextSelectionId?: string | null
    ): Promise<DesignValidation | null> => {
      if (!scenario) return null;
      const requestId = validationRequestRef.current + 1;
      validationRequestRef.current = requestId;
      setValidationPending(true);
      setSurfaceError(null);
      const candidate = scenarioSchema.parse({
        ...scenario,
        poseClip: toPoseClip(scenario.poseClip, sortedKeys(nextKeys), nextInterpolation)
      });

      try {
        const validation = await services.solverGateway.validateDesign(candidate);
        if (requestId !== validationRequestRef.current) return null;
        setDesignValidation(validation);
        if (validation.canSolve) {
          commitScenario(nextKeys, nextInterpolation, nextSelectionId);
        }
        return validation;
      } catch (error) {
        if (requestId !== validationRequestRef.current) return null;
        setSurfaceError(error instanceof Error ? error.message : "Design validation unavailable");
        return null;
      } finally {
        if (requestId === validationRequestRef.current) setValidationPending(false);
      }
    },
    [commitScenario, scenario, services.solverGateway]
  );

  useEffect(() => {
    if (!scenario || keyframes.length === 0) return;
    const requestId = validationRequestRef.current + 1;
    validationRequestRef.current = requestId;
    setValidationPending(true);
    void services.solverGateway
      .validateDesign(scenario)
      .then((validation) => {
        if (requestId !== validationRequestRef.current) return;
        setDesignValidation(validation);
        setSurfaceError(null);
      })
      .catch((error) => {
        if (requestId !== validationRequestRef.current) return;
        setSurfaceError(error instanceof Error ? error.message : "Design validation unavailable");
      })
      .finally(() => {
        if (requestId === validationRequestRef.current) setValidationPending(false);
      });
  }, [keyframes.length, scenario, services.solverGateway]);

  const addKeyframe = useCallback(() => {
    if (!selectedKey || !scenario) {
      return;
    }

    const current = sortedKeys(keyframes);
    const selected = current.findIndex((key) => key.id === selectedKey.id);
    const previous = current[selected];
    const following = current[selected + 1];

    const fallbackS = previous ? previous.s + 1 : playheadS + 1;
    const middle = previous && following ? (previous.s + following.s) / 2 : fallbackS;

    const lower = previous ? previous.s + minimumGap : -50;
    const upper = following ? following.s - minimumGap : 50;
    const clamped = clamp(middle, lower, upper);

    if (!Number.isFinite(clamped) || lower >= upper) {
      return;
    }

    const nextKey: EditableKey = {
      id: crypto.randomUUID(),
      s: clamped,
      label: "New key",
      targets: { ...selectedKey.targets }
    };

    void validateCandidate([...current, nextKey], interpolation, nextKey.id).then((validation) => {
      if (!validation?.canSolve) return;
      setPlayheadS(clamped);
      setSaturationReason(null);
      setLimitingConflicts([]);
    });
  }, [interpolation, keyframes, playheadS, scenario, selectedKey, validateCandidate]);

  const deleteSelectedKey = useCallback(() => {
    if (keyframes.length <= 2 || !selectedKey) {
      return;
    }

    const next = keyframes.filter((key) => key.id !== selectedKey.id);
    const ordered = sortedKeys(next);
    const nextSelection =
      ordered[Math.min(selectedIndex, ordered.length - 1)]?.id ?? ordered[0]?.id ?? null;
    void validateCandidate(ordered, interpolation, nextSelection).then((validation) => {
      if (!validation?.canSolve) return;
      setPlayheadS(ordered[Math.min(selectedIndex, ordered.length - 1)]?.s ?? 0);
      setLimitingConflicts([]);
    });
  }, [interpolation, keyframes, selectedIndex, selectedKey, validateCandidate]);

  const selectByIndex = useCallback(
    (index: number) => {
      const next = sortedKeys(keyframes);
      if (next.length === 0) {
        return;
      }
      const bounded = clamp(index, 0, next.length - 1);
      const candidate = next[bounded];
      if (!candidate) {
        return;
      }
      setSelectedKeyId(candidate.id);
      setPlayheadS(candidate.s);
    },
    [keyframes]
  );

  const selectKey = useCallback(
    (keyId: string) => {
      const key = keyframes.find((item) => item.id === keyId);
      if (!key) {
        return;
      }
      setSelectedKeyId(key.id);
      setPlayheadS(key.s);
    },
    [keyframes]
  );

  const moveKey = useCallback(
    (keyId: string, nextS: number) => {
      const ordered = sortedKeys(keyframes);
      const index = ordered.findIndex((key) => key.id === keyId);
      if (index < 0) {
        return;
      }

      const previous = ordered[index - 1];
      const following = ordered[index + 1];

      const lower = previous ? previous.s + minimumGap : -50;
      const upper = following ? following.s - minimumGap : 50;
      const bounded = clamp(asFinite(nextS, ordered[index]?.s ?? 0), lower, upper);
      const saturated = bounded !== nextS || !Number.isFinite(nextS);

      const updated = ordered.map((key) =>
        key.id === keyId
          ? {
              ...key,
              s: bounded
            }
          : key
      );

      void validateCandidate(updated, interpolation, keyId).then((validation) => {
        if (!validation?.canSolve) return;
        setPlayheadS(bounded);
        setLimitingConflicts([]);
        setSaturationReason(saturated ? "Constrained to maintain strict key ordering" : null);
      });
    },
    [interpolation, keyframes, validateCandidate]
  );

  const applyJointTarget = useCallback(
    (joint: JointName, value: number) => {
      if (!selectedKey || !scenario) {
        return;
      }

      // Editing stops where the limits on screen stop, so a drag can never
      // commit a value the rail already reports as out of range.
      const limits =
        feasibleLimits?.[joint] ?? envelopeLimits?.[joint] ?? poseAuthoringRange(scenario, joint);
      const bounded = clamp(asFinite(value, selectedKey.targets[joint]), limits.min, limits.max);

      const requestedTargets = { ...selectedKey.targets, [joint]: bounded };
      const candidateScenario: Scenario = {
        ...scenario,
        poseClip: toPoseClip(
          scenario.poseClip,
          keyframes.map((key) =>
            key.id === selectedKey.id ? { ...key, targets: requestedTargets } : key
          ),
          interpolation
        )
      };
      const requestId = editRequestRef.current + 1;
      editRequestRef.current = requestId;
      validationRequestRef.current += 1;
      setValidationPending(true);
      setSurfaceError(null);
      void services.solverGateway
        .resolvePoseEdit(candidateScenario, selectedIndex, selectedKey.targets, requestedTargets)
        .then(async (resolution) => {
          if (requestId !== editRequestRef.current) return;
          const next = keyframes.map((key) =>
            key.id === selectedKey.id ? { ...key, targets: { ...resolution.acceptedTargets } } : key
          );
          const acceptedScenario = scenarioSchema.parse({
            ...scenario,
            poseClip: toPoseClip(scenario.poseClip, next, interpolation)
          });
          const validation = await services.solverGateway.validateDesign(acceptedScenario);
          if (requestId !== editRequestRef.current) return;
          setDesignValidation(validation);
          setLimitingConflicts(resolution.limitingConflicts);
          if (!validation.canSolve) return;
          commitScenario(next, interpolation, selectedKey.id);
          setSampling({
            sample: resolution.validation.sample,
            saturated: !resolution.requestedValid,
            reason: resolution.limitingConflicts[0]?.message ?? null
          });
          setSaturationReason(resolution.limitingConflicts[0]?.message ?? null);
        })
        .catch((error) => {
          if (requestId !== editRequestRef.current) return;
          setSurfaceError(
            error instanceof Error ? error.message : "Pose edit resolution unavailable"
          );
        })
        .finally(() => {
          if (requestId === editRequestRef.current) setValidationPending(false);
        });
    },
    [
      commitScenario,
      interpolation,
      keyframes,
      scenario,
      selectedIndex,
      selectedKey,
      services.solverGateway
    ]
  );

  const setJointTarget = useCallback(
    (joint: JointName, value: number) => {
      pendingJointEditRef.current = { joint, value };
      if (jointEditFrameRef.current !== null) return;

      jointEditFrameRef.current = requestAnimationFrame(() => {
        jointEditFrameRef.current = null;
        const pending = pendingJointEditRef.current;
        pendingJointEditRef.current = null;
        if (pending) applyJointTarget(pending.joint, pending.value);
      });
    },
    [applyJointTarget]
  );

  useEffect(
    () => () => {
      if (jointEditFrameRef.current !== null) cancelAnimationFrame(jointEditFrameRef.current);
    },
    []
  );

  const setInterpolationMode = useCallback(
    (value: PoseClip["interpolation"]) => {
      void validateCandidate(keyframes, value, selectedKeyId).then((validation) => {
        if (!validation?.canSolve) return;
        setInterpolation(value);
        setLimitingConflicts([]);
      });
    },
    [keyframes, selectedKeyId, validateCandidate]
  );

  const resetPose = useCallback(() => {
    if (!scenario || !initialClipRef.current) {
      return;
    }

    const editable = toEditableKeys(initialClipRef.current);
    const nextSelection = editable[0]?.id ?? null;

    void validateCandidate(editable, initialClipRef.current.interpolation, nextSelection).then(
      (validation) => {
        if (!validation?.canSolve || !initialClipRef.current) return;
        setInterpolation(initialClipRef.current.interpolation);
        setPlayheadS(editable[0]?.s ?? 0);
        setSaturationReason(null);
        setLimitingConflicts([]);
      }
    );
  }, [scenario, validateCandidate]);

  useEffect(() => {
    if (!scenario || !selectedKey) {
      return;
    }

    const requestId = sampleRequestRef.current + 1;
    sampleRequestRef.current = requestId;

    const scenarioForSample = scenarioSchema.parse({
      ...scenario,
      poseClip: toPoseClip(scenario.poseClip, keyframes, interpolation)
    });

    const sampleS = selectedKey.s;

    void services.solverGateway
      .samplePose(scenarioForSample, sampleS)
      .then((rawSample) => {
        if (requestId !== sampleRequestRef.current) {
          return;
        }

        const sanitized = sanitizePoseSample(
          scenarioForSample,
          sampleS,
          rawSample,
          selectedKey.targets
        );
        if (!poseSampleHasReachableLegs(scenarioForSample, rawSample)) {
          sanitized.saturated = true;
          sanitized.reason = "Both legs must reach their pedals within rider segment limits";
        }
        setSampling(sanitized);
        setSaturationReason((current) => current ?? sanitized.reason);
      })
      .catch((error) => {
        if (requestId !== sampleRequestRef.current) {
          return;
        }

        const fallback: PoseSample = {
          s: sampleS,
          targets: { ...selectedKey.targets },
          derivedArm: {
            shoulder: 0,
            elbow: 0,
            constrained: true
          },
          landmarks: zeroLandmarks,
          solverVersion: scenarioForSample.solver.solverVersion
        };
        const sanitized = sanitizePoseSample(
          scenarioForSample,
          sampleS,
          fallback,
          selectedKey.targets
        );
        setSampling(sanitized);
        setSurfaceError(error instanceof Error ? error.message : "pose_sample_unavailable");
      });
  }, [interpolation, keyframes, scenario, selectedKey, services.solverGateway]);

  const probeFor = useCallback(
    (key: EditableKey) => async (candidateTargets: Record<JointName, number>) => {
      if (!scenario) return false;
      const keyIndex = sortedKeys(keyframes).findIndex((item) => item.id === key.id);
      if (keyIndex < 0) return false;
      const candidateScenario = {
        ...scenario,
        poseClip: toPoseClip(
          scenario.poseClip,
          keyframes.map((item) =>
            item.id === key.id ? { ...item, targets: candidateTargets } : item
          ),
          interpolation
        )
      };
      const rawSample = await services.solverGateway.samplePose(candidateScenario, key.s);
      if (!poseSampleHasReachableLegs(candidateScenario, rawSample)) {
        return false;
      }
      const resolution = await services.solverGateway.resolvePoseEdit(
        scenario,
        keyIndex,
        key.targets,
        candidateTargets
      );
      return resolution.requestedValid;
    },
    [interpolation, keyframes, scenario, services.solverGateway]
  );

  const declaredRanges = useCallback(
    (): PoseFeasibleLimits | null =>
      scenario
        ? {
            knee: poseAuthoringRange(scenario, "knee"),
            hip: poseAuthoringRange(scenario, "hip"),
            spine: poseAuthoringRange(scenario, "spine")
          }
        : null,
    [scenario]
  );

  // Limits belong to one key; never show the previous key's limits on the next one.
  const selectedKeyIdForLimits = selectedKey?.id ?? null;
  useEffect(() => {
    setFeasibleLimits(null);
  }, [selectedKeyIdForLimits]);

  useEffect(() => {
    const declared = declaredRanges();
    // Limits describe the pose on screen, so they follow its sample rather
    // than competing with it.
    if (!scenario || !selectedKey || !declared || !sampling) {
      return;
    }

    let active = true;
    const key = selectedKey;
    const probe = probeFor(key);

    // Self-throttling instead of debounced: a drag keeps recomputing as fast as
    // the probes allow, and only the newest pose is ever queued behind one.
    const run = async () => {
      if (limitsBusyRef.current) {
        limitsQueuedRef.current = run;
        return;
      }
      limitsBusyRef.current = true;
      try {
        const limits = await feasiblePoseLimits(declared, key.targets, probe);
        if (active) setFeasibleLimits(limits);
      } catch {
        // A failed probe just leaves the previous limits in place.
      } finally {
        limitsBusyRef.current = false;
        const queued = limitsQueuedRef.current;
        limitsQueuedRef.current = null;
        if (queued) void queued();
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [declaredRanges, probeFor, sampling, scenario, selectedKey]);

  useEffect(() => {
    const declared = declaredRanges();
    if (!scenario || !selectedKey || !declared) {
      return;
    }

    // The envelope depends only on body and bike geometry, so it survives edits.
    const signature = JSON.stringify({ rider: scenario.rider, bike: scenario.bike });
    if (envelopeSignatureRef.current === signature) {
      return;
    }

    let active = true;
    const keyProbe = probeFor(selectedKey);
    // A superseded search stops instead of queueing hundreds of stale probes in the worker.
    const probe = (targets: Record<JointName, number>) => {
      if (!active) return Promise.reject(new Error("pose envelope superseded"));
      return keyProbe(targets);
    };
    // Deferred so the interactive per-edit limits resolve first. The signature is recorded
    // only once the envelope exists, so an edit that cancels this run does not skip it.
    const timer = setTimeout(() => {
      void poseEnvelopeLimits(declared, probe)
        .then((envelope) => {
          if (!active || !envelope) return;
          envelopeSignatureRef.current = signature;
          setEnvelopeLimits(envelope);
        })
        .catch(() => {
          // Leave the previous envelope; the next edit retries.
        });
    }, 400);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [declaredRanges, probeFor, scenario, selectedKey]);

  poseCheckpointRef.current = {
    selectedKeyId,
    selectedIndex,
    saturated: Boolean(saturationReason || sampling?.saturated),
    reason: saturationReason ?? sampling?.reason ?? null,
    minimumSeparation: designValidation?.poseKeys[selectedIndex]?.minimumSeparation ?? null,
    contacts: designValidation?.poseKeys[selectedIndex]?.contacts ?? [],
    inferredSaddleContact: Boolean(
      designValidation?.poseKeys[selectedIndex]?.contacts.some(
        (contact) => contact.kind === "saddle" && contact.active
      )
    ),
    acceptedTargets: selectedKey?.targets ?? null,
    conflictCodes: [
      ...(designValidation?.poseKeys.flatMap((key) =>
        key.conflicts.map((conflict) => conflict.code)
      ) ?? []),
      ...limitingConflicts.map((conflict) => conflict.code)
    ],
    affectedKeyIndices:
      designValidation?.poseKeys
        .filter((key) => key.conflicts.length > 0)
        .map((key) => key.keyIndex) ?? [],
    canSolve: designValidation?.canSolve ?? null,
    targets: selectedKey?.targets ?? null,
    derivedArm: sampling?.sample.derivedArm ?? null,
    landmarks: sampling?.sample.landmarks ?? null
  };

  useEffect(
    () =>
      registerPoseTestControls({
        selectKeyByIndex: (index) => selectByIndex(index),
        dragJointHandle: (joint, value) => setJointTarget(joint, value),
        getCheckpoint: () => poseCheckpointRef.current
      }),
    [selectByIndex, setJointTarget]
  );

  const applyDisabledReason = validationPending
    ? "Apply disabled while design validation is pending"
    : surfaceError
      ? `Apply disabled: ${surfaceError}`
      : !designValidation
        ? "Apply disabled until design validation completes"
        : !designValidation.canSolve
          ? `Apply disabled: ${designValidation.conflictCount} pose conflicts`
          : null;

  const applyToRun = useCallback(() => {
    if (!scenario || validationPending) return;
    const requestId = validationRequestRef.current + 1;
    validationRequestRef.current = requestId;
    setValidationPending(true);
    void services.solverGateway
      .validateDesign(scenario)
      .then((validation) => {
        if (requestId !== validationRequestRef.current) return;
        setDesignValidation(validation);
        if (!validation.canSolve) return;
        actions.setRoute("/workbench");
        navigate("/workbench");
      })
      .catch((error) => {
        if (requestId !== validationRequestRef.current) return;
        setSurfaceError(error instanceof Error ? error.message : "Design validation unavailable");
      })
      .finally(() => {
        if (requestId === validationRequestRef.current) setValidationPending(false);
      });
  }, [actions, navigate, scenario, services.solverGateway, validationPending]);

  return {
    initialized,
    statusLabel,
    source,
    scenario,
    surfaceError,
    keyframes,
    interpolation,
    selectedKeyId,
    selectedIndex,
    selectedKey,
    playheadS,
    sample: sampling?.sample ?? null,
    feasibleLimits,
    envelopeLimits,
    saturated: Boolean(saturationReason || sampling?.saturated),
    saturationReason: saturationReason ?? sampling?.reason ?? null,
    designValidation,
    limitingConflicts,
    selectedValidation: designValidation?.poseKeys[selectedIndex] ?? null,
    validationPending,
    checkpoint: poseCheckpointRef.current,
    applyDisabledReason,
    addKeyframe,
    deleteSelectedKey,
    selectByIndex,
    selectKey,
    moveKey,
    setPlayheadS,
    setJointTarget,
    setInterpolationMode,
    resetPose,
    applyToRun
  };
};
