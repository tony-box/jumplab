import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  hashScenario,
  normalizeJump,
  scenarioSchema,
  spikeControlContracts,
  type BaselineSelection,
  type RunArtifact,
  type Scenario,
  type SolverCapabilityManifest,
  type TerrainProfile
} from "../../../../../packages/schema/src/index";
import { useAppServices } from "../../app/AppProviders";
import {
  selectSessionState,
  selectRunState,
  selectScenarioState,
  selectSolverState,
  selectStoreActions,
  useAppStore
} from "../../state/store";
import { createFrameBufferView, type FrameBufferView } from "../../solver/frame-buffer";
import { versionManifest } from "../../app/version-manifest";
import { incrementSolveDispatchCount } from "../../test-hooks";
import {
  clampZoomFactor,
  type CameraMode,
  type ManualCameraState
} from "../../rendering/canvas/camera";
import { defaultWorkbenchScenario } from "./default-template";
import { ensureCurrentRunArtifact, type RunRegenerationState } from "./legacy-regeneration";

const contractsById = new Map(spikeControlContracts.map((contract) => [contract.id, contract]));

const DEFAULT_TERRAIN_SAMPLE_STEP = 0.05;

export const findTouchdownFrame = (frameView: FrameBufferView | null): number | null => {
  if (!frameView || !frameView.hasField("groundedRear") || !frameView.hasField("groundedFront")) {
    return null;
  }

  let sawAirborne = false;
  for (let frameIndex = 0; frameIndex < frameView.frameCount; frameIndex += 1) {
    const contact = frameView.readContactState(frameIndex);
    const supported = contact.groundedRear || contact.groundedFront;
    if (!supported) sawAirborne = true;
    else if (sawAirborne) return frameIndex;
  }
  return null;
};

const updateControlValue = (scenario: Scenario, controlId: string, value: number): Scenario => {
  const next = structuredClone(scenario) as Scenario;
  switch (controlId) {
    case "lip-height":
      next.jump.lipHeight = value;
      break;
    case "lip-angle":
      next.jump.lipAngle = value;
      break;
    case "transition-length":
      next.jump.transitionLength = value;
      break;
    case "gap":
      next.jump.gap = value;
      break;
    case "step-delta":
      next.jump.stepDelta = value;
      break;
    case "landing-angle":
      next.jump.landingAngle = value;
      break;
    case "landing-length":
      next.jump.landingLength = value;
      break;
    case "entry-speed":
      next.entry.speed = value;
      break;
    case "rider-height":
      next.rider.height = value;
      break;
    case "rider-mass":
      next.rider.mass = value;
      break;
    case "rider-strength":
      next.rider.strengthScale = value;
      break;
    case "instinct-angle":
      next.solver.riderInstinct.maxAngle = value;
      next.solver.riderInstinct.enabled = value > 0 || next.solver.riderInstinct.maxOffset > 0;
      break;
    case "instinct-offset":
      next.solver.riderInstinct.maxOffset = value;
      next.solver.riderInstinct.enabled = value > 0 || next.solver.riderInstinct.maxAngle > 0;
      break;
    case "wheelbase":
      next.bike.wheelbase = value;
      break;
    case "bike-mass":
      next.bike.mass = value;
      break;
    case "fork-travel":
      next.bike.fork.travel = value;
      break;
    case "fork-sag":
      next.bike.fork.sag = value;
      break;
    default:
      throw new Error(`Unknown control ${controlId}`);
  }
  // A kicker is a circular arc: editing its length sets the lip angle that produces it, and
  // editing height or angle re-derives the length.
  if (controlId === "transition-length" && next.jump.kind !== "drop") {
    next.jump.lipAngle = 2 * Math.atan(next.jump.lipHeight / value);
  }
  next.jump = normalizeJump(next.jump);
  return scenarioSchema.parse(next);
};

export const useWorkbench = () => {
  const services = useAppServices();
  const scenarioState = useAppStore(selectScenarioState);
  const runState = useAppStore(selectRunState);
  const solverState = useAppStore(selectSolverState);
  const sessionState = useAppStore(selectSessionState);
  const actions = useAppStore(selectStoreActions);

  const [capabilities, setCapabilities] = useState<SolverCapabilityManifest | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [surfaceError, setSurfaceError] = useState<string | null>(null);
  const [overlays, setOverlays] = useState<string[]>([
    "trajectory",
    "rider",
    "velocity",
    "baseline"
  ]);
  const [baselineSelection, setBaselineSelection] = useState<BaselineSelection>({
    runId: null,
    compatibility: "none",
    reasons: []
  });
  const [currentArtifact, setCurrentArtifact] = useState<RunArtifact | null>(null);
  const [baselineArtifact, setBaselineArtifact] = useState<RunArtifact | null>(null);
  const [terrain, setTerrain] = useState<{
    state: "idle" | "loading" | "ready" | "error";
    profile: TerrainProfile | null;
    reason: string | null;
  }>({ state: "idle", profile: null, reason: null });
  const [statusLabel, setStatusLabel] = useState("loading core");
  const [regeneration, setRegeneration] = useState<{
    state: RunRegenerationState | "idle" | "inspecting" | "regenerating";
    reason: string | null;
  }>({ state: "idle", reason: null });
  const artifactCacheRef = useRef(new Map<string, RunArtifact>());

  useEffect(() => {
    let active = true;

    const prepare = async () => {
      try {
        const hash = await hashScenario(defaultWorkbenchScenario);
        if (!useAppStore.getState().scenario.scenario && active) {
          actions.setScenario(defaultWorkbenchScenario, hash);
        }

        const manifest = await services.solverGateway.initialize(
          versionManifest.app,
          versionManifest.solver
        );
        if (active) {
          setCapabilities(manifest);
          setStatusLabel("ready");
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setInitError(error instanceof Error ? error.message : "Core initialization failed");
        setStatusLabel("error");
      }
    };

    void prepare();

    return () => {
      active = false;
    };
  }, [actions, services.solverGateway]);

  useEffect(() => {
    let active = true;

    const refreshArtifacts = async () => {
      const activeRunId = runState.active?.runId;
      if (!activeRunId) {
        if (active) {
          setCurrentArtifact(null);
          setBaselineArtifact(null);
          setBaselineSelection({ runId: null, compatibility: "none", reasons: [] });
          setRegeneration({ state: "idle", reason: null });
        }
        return;
      }

      setCurrentArtifact(null);
      setRegeneration({ state: "inspecting", reason: null });

      try {
        const cachedCurrent =
          artifactCacheRef.current.get(activeRunId) ??
          (await services.runArtifactRepository.getStored(activeRunId));
        if (!cachedCurrent) {
          const listed = await services.runArtifactRepository.list();
          const legacy = listed.find((entry) => entry.runId === activeRunId)?.legacySnapshotMissing;
          if (active) {
            setRegeneration({
              state: "unavailable",
              reason: legacy
                ? "Legacy run did not capture a scenario snapshot"
                : "Stored run is unavailable"
            });
            setStatusLabel("run unavailable");
          }
          return;
        }

        const outcome = await ensureCurrentRunArtifact({
          artifact: cachedCurrent,
          activeSolverVersion: capabilities?.solverVersion ?? versionManifest.solver,
          activeModelVersion: capabilities?.modelVersion ?? versionManifest.model,
          activeSchemaVersion: versionManifest.schema,
          repository: services.runArtifactRepository,
          solve: services.solverGateway.solve,
          onRegenerating: () => {
            if (active) {
              setRegeneration({ state: "regenerating", reason: null });
              setStatusLabel("regenerating run");
            }
          }
        });
        if (!active) {
          return;
        }

        setRegeneration({ state: outcome.state, reason: outcome.reason });
        if (!outcome.artifact) {
          setStatusLabel(outcome.state === "failed" ? "regeneration failed" : "run unavailable");
          return;
        }
        artifactCacheRef.current.set(activeRunId, outcome.artifact);

        const baselineRunId = runState.baselineRunId;
        const baseline = baselineRunId
          ? (artifactCacheRef.current.get(baselineRunId) ??
            (await services.runArtifactRepository.get(baselineRunId)))
          : null;

        if (!active) {
          return;
        }

        setCurrentArtifact(outcome.artifact);
        setBaselineArtifact(baseline);
        setBaselineSelection(services.baselineComparator.compare(outcome.artifact, baseline));
        setStatusLabel(outcome.state === "regenerated" ? "run regenerated" : "ready");
      } catch (error) {
        if (active) {
          setRegeneration({
            state: "unavailable",
            reason: error instanceof Error ? error.message : "Stored run is invalid"
          });
          setStatusLabel("run unavailable");
        }
      }
    };

    void refreshArtifacts();

    return () => {
      active = false;
    };
  }, [
    runState.active?.runId,
    runState.baselineRunId,
    capabilities?.solverVersion,
    services.baselineComparator,
    services.runArtifactRepository,
    services.solverGateway.solve
  ]);

  const supportedPaths = useMemo(
    () => new Set(capabilities?.supportedScenarioPaths ?? []),
    [capabilities?.supportedScenarioPaths]
  );

  const scenario = scenarioState.scenario;
  const frameView = useMemo(
    () =>
      currentArtifact
        ? createFrameBufferView(currentArtifact.manifest.frameLayout, currentArtifact.frameBuffer)
        : null,
    [currentArtifact]
  );
  const trajectory = useMemo(() => {
    if (!frameView?.hasField("x") || !frameView.hasField("y")) return [];
    const points: Array<{ x: number; y: number }> = [];
    for (let index = 0; index < frameView.frameCount; index += 1) {
      points.push({
        x: frameView.readField(index, "x")[0] ?? 0,
        y: frameView.readField(index, "y")[0] ?? 0
      });
    }
    return points;
  }, [frameView]);

  const baselineFrameView = useMemo(
    () =>
      baselineArtifact
        ? createFrameBufferView(baselineArtifact.manifest.frameLayout, baselineArtifact.frameBuffer)
        : null,
    [baselineArtifact]
  );
  const touchdownFrame = useMemo(() => findTouchdownFrame(frameView), [frameView]);

  const terrainSampleStep = currentArtifact?.model.terrainSampleStep ?? DEFAULT_TERRAIN_SAMPLE_STEP;
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;

  // Terrain geometry depends only on these inputs, so rider/suspension edits must not refetch it.
  const terrainKey = scenario
    ? JSON.stringify({
        jump: scenario.jump,
        startX: scenario.entry.startX,
        wheelbase: scenario.bike.wheelbase,
        wheelSize: scenario.bike.wheelSize,
        step: terrainSampleStep
      })
    : null;

  useEffect(() => {
    if (!terrainKey) {
      setTerrain({ state: "idle", profile: null, reason: null });
      return;
    }

    let active = true;
    // Retain the previous profile so the stage does not blank out mid-edit.
    setTerrain((previous) => ({ state: "loading", profile: previous.profile, reason: null }));

    const currentScenario = scenarioRef.current;
    if (currentScenario) {
      void services.solverGateway
        .terrain(currentScenario, terrainSampleStep)
        .then((profile) => {
          if (active) setTerrain({ state: "ready", profile, reason: null });
        })
        .catch((error) => {
          if (active) {
            setTerrain({
              state: "error",
              profile: null,
              reason: error instanceof Error ? error.message : "Terrain profile unavailable"
            });
          }
        });
    }

    return () => {
      active = false;
    };
  }, [services.solverGateway, terrainKey, terrainSampleStep]);

  const updateControl = useCallback(
    (controlId: string, value: number) => {
      const contract = contractsById.get(controlId);
      if (!contract || !supportedPaths.has(contract.scenarioPath)) {
        return;
      }

      actions.updateScenario((current) => updateControlValue(current, controlId, value));
      setStatusLabel("stale result");
    },
    [actions, supportedPaths]
  );

  const setJumpKind = useCallback(
    (kind: Scenario["jump"]["kind"]) => {
      if (!supportedPaths.has("scenario.jump.kind")) return;
      actions.updateScenario((current) => {
        const next = structuredClone(current) as Scenario;
        next.jump.kind = kind;
        next.jump.stepDelta =
          kind === "stepup" ? 0.5 : kind === "stepdown" || kind === "drop" ? -0.5 : 0;
        // A drop has no kicker, so seed a level edge instead of carrying the previous ramp angle.
        if (kind === "drop") next.jump.lipAngle = 0;
        next.jump = normalizeJump(next.jump);
        return scenarioSchema.parse(next);
      });
    },
    [actions, supportedPaths]
  );

  const solve = async () => {
    if (!scenario) {
      return;
    }

    if (solverState.lifecycle === "solving" && solverState.activeRunId) {
      await services.solverGateway.cancel(solverState.activeRunId);
      actions.cancelSolve();
      setStatusLabel("cancelled");
      return;
    }

    const runId = crypto.randomUUID();
    actions.beginSolve(runId);
    actions.reportProgress(runId, 0.2, "Preparing solve");
    incrementSolveDispatchCount();
    setSurfaceError(null);
    setStatusLabel("solving");

    const solvedScenario = scenario;
    try {
      const artifact = await services.solverGateway.solve(runId, solvedScenario);
      if (useAppStore.getState().solver.activeRunId !== runId) {
        return;
      }

      actions.reportProgress(runId, 1, "Solve complete");
      artifactCacheRef.current.set(runId, artifact);
      // Edits made while the core was working leave this result describing an older scenario.
      const editedDuringSolve = useAppStore.getState().scenario.scenario !== solvedScenario;
      actions.commitRunResult(artifact.manifest, { stale: editedDuringSolve });
      setCurrentArtifact(artifact);
      setStatusLabel(editedDuringSolve ? "stale result" : "solved");
      try {
        await services.runArtifactRepository.save(artifact);
      } catch (error) {
        setSurfaceError(
          `The run solved but could not be saved: ${error instanceof Error ? error.message : "storage error"}`
        );
      }
    } catch (error) {
      actions.failSolve(error instanceof Error ? error.message : "Solve failed");
      setSurfaceError(error instanceof Error ? error.message : "Solve failed");
      setStatusLabel("error");
    }
  };

  const toggleBaseline = () => {
    const runId = runState.active?.runId ?? null;
    if (!runId) {
      return;
    }
    actions.setBaselineRun(runState.baselineRunId === runId ? null : runId);
  };

  const setCameraMode = (value: string) => {
    const mode: CameraMode =
      value === "pan-zoom" ? "pan-zoom" : value === "jump" ? "jump" : "follow";
    actions.setCamera(mode, mode === "pan-zoom" ? sessionState.view.manualCamera : null);
  };

  const setManualCamera = (manual: ManualCameraState) => {
    actions.setCamera("pan-zoom", manual, manual.zoomFactor);
  };

  const setCameraZoom = (zoomFactor: number) => {
    const clamped = clampZoomFactor(zoomFactor);
    const manual = sessionState.view.manualCamera;
    actions.setCamera(
      sessionState.view.cameraMode,
      manual ? { ...manual, zoomFactor: clamped } : null,
      clamped
    );
  };

  const resetCamera = () => actions.setCamera("follow", null, 1);

  return {
    scenario,
    updateControl,
    setJumpKind,
    solve,
    overlays,
    setOverlays,
    cameraMode: sessionState.view.cameraMode,
    cameraZoomFactor: sessionState.view.cameraZoomFactor,
    manualCamera: sessionState.view.manualCamera,
    setCameraMode,
    setCameraZoom,
    setManualCamera,
    resetCamera,
    supportedPaths,
    statusLabel,
    resultState: scenarioState.resultState,
    initError,
    surfaceError,
    run: runState.active,
    solver: solverState,
    frameView,
    trajectory,
    baselineFrameView,
    baselineSelection,
    toggleBaseline,
    baselinePinned: Boolean(runState.baselineRunId),
    playbackRate: sessionState.view.playbackRate,
    setPlaybackRate: (rate: number) => actions.setViewPreference("playbackRate", rate),
    baselineArtifact,
    currentArtifact,
    regeneration,
    terrain,
    touchdownFrame
  };
};
