import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type DesignConflict,
  type DesignValidation,
  hashScenario,
  type PoseEditResolution,
  type PoseKeyValidation,
  type PoseSample,
  type Scenario,
  type SolverCapabilityManifest
} from "../../../../packages/schema/src/index";
import type { SolverGateway } from "../../src/app/services";
import { createDemoFixtures } from "../../../../tests/fixtures/ui/demo-fixtures";
import { DesignerPage } from "../../src/features/designer/DesignerPage";
import { useAppStore } from "../../src/state/store";
import { renderWithProviders } from "../test-utils";

const fixtures = createDemoFixtures();

const createManifest = (): SolverCapabilityManifest => ({
  protocolVersion: 1,
  solverVersion: "rapier-0.35.2-enhanced-determinism",
  modelVersion: "physics-spike-v1",
  deterministic: true,
  supportedScenarioPaths: ["scenario.poseClip"],
  supportedOutputs: ["pose"],
  ccd: true,
  contactImpulse: true,
  motorWork: true,
  jointTorque: false
});

const createSample = (s: number): PoseSample => ({
  s,
  targets: {
    knee: 1,
    hip: 0.4,
    spine: 0.15
  },
  derivedArm: {
    shoulder: -0.2,
    elbow: 0,
    constrained: false
  },
  landmarks: {
    pedalContact: { x: -0.18, y: 0.33 },
    ankle: { x: -0.18, y: 0.33 },
    knee: { x: -0.15, y: 0.56 },
    hip: { x: 0.02, y: 0.82 },
    shoulder: { x: 0.07, y: 1.31 },
    elbow: { x: 0.25, y: 1.16 },
    hand: { x: 0.42, y: 1.02 },
    handlebarContact: { x: 0.42, y: 1.02 },
    head: { x: 0.08, y: 1.49 }
  },
  solverVersion: "rapier-0.35.2-enhanced-determinism"
});

const createKeyValidation = (
  scenario: Scenario,
  keyIndex: number,
  overrides: Partial<PoseKeyValidation> = {}
): PoseKeyValidation => ({
  keyIndex,
  s: scenario.poseClip.keys[keyIndex]?.s ?? 0,
  valid: true,
  sample: createSample(scenario.poseClip.keys[keyIndex]?.s ?? 0),
  minimumSeparation: 0.042,
  contacts: [
    {
      kind: "saddle",
      riderPart: "pelvis",
      bikePart: "saddle",
      active: true,
      separation: 0
    }
  ],
  conflicts: [],
  ...overrides
});

const createDesignValidation = (
  scenario: Scenario,
  overrides: Partial<DesignValidation> = {}
): DesignValidation => ({
  geometry: {} as DesignValidation["geometry"],
  poseKeys: scenario.poseClip.keys.map((_, keyIndex) => createKeyValidation(scenario, keyIndex)),
  canSolve: true,
  conflictCount: 0,
  scenarioHash: "a".repeat(64),
  modelVersion: "geometry-v1",
  solverVersion: scenario.solver.solverVersion,
  ...overrides
});

const createResolution = (
  scenario: Scenario,
  keyIndex: number,
  requestedTargets: Scenario["poseClip"]["keys"][number]["targets"],
  acceptedTargets = requestedTargets,
  limitingConflicts: DesignConflict[] = []
): PoseEditResolution => ({
  requestedTargets,
  acceptedTargets,
  requestedValid: limitingConflicts.length === 0,
  validation: createKeyValidation(scenario, keyIndex, {
    sample: { ...createSample(scenario.poseClip.keys[keyIndex]?.s ?? 0), targets: acceptedTargets }
  }),
  limitingConflicts
});

const createSolverGateway = (overrides: Partial<SolverGateway> = {}): SolverGateway => ({
  initialize: vi.fn().mockResolvedValue(createManifest()),
  solve: vi.fn(),
  cancel: vi.fn().mockResolvedValue(undefined),
  inspectBikeGeometry: vi.fn(),
  resolvePoseEdit: vi.fn(async (scenario, keyIndex, _baseline, requested) =>
    createResolution(scenario, keyIndex, requested)
  ),
  validateDesign: vi.fn(async (scenario) => createDesignValidation(scenario)),
  samplePose: vi.fn(async (_scenario, s) => createSample(s)),
  analyzeSpeedWindow: vi.fn(),
  terrain: vi.fn(),
  dispose: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

describe("pose editor", () => {
  beforeEach(async () => {
    useAppStore.getState().actions.clearScenario();
    const scenario = fixtures.createScenario();
    const hash = await hashScenario(scenario);
    useAppStore.getState().actions.setScenario(scenario, hash);
  });

  afterEach(() => {
    cleanup();
  });

  it("previews the interpolated pose along the clip and returns to key editing", async () => {
    const samplePose = vi.fn(async (_scenario: Scenario, s: number) => createSample(s));
    renderWithProviders(<DesignerPage />, {
      services: { solverGateway: createSolverGateway({ samplePose }) }
    });

    const scrubber = await screen.findByLabelText("Preview position along the run");
    const readout = () => document.querySelector('[data-od-id="preview-readout"]')?.textContent;
    expect(readout()).toBe("Editing keys");

    const keys = useAppStore.getState().scenario.scenario!.poseClip.keys;
    const middle = Number(((keys[0]!.s + keys[keys.length - 1]!.s) / 2).toFixed(2));
    fireEvent.change(scrubber, { target: { value: String(middle) } });
    await waitFor(() => expect(readout()).toContain(`s = ${middle.toFixed(2)} m`));
    await waitFor(() => expect(samplePose).toHaveBeenCalledWith(expect.anything(), middle));
    expect(screen.getByText("clip preview")).toBeVisible();
    expect(screen.getByText(/Previewing the pose between keys/)).toBeVisible();

    const firstKey = useAppStore.getState().scenario.scenario!.poseClip.keys[0]!;
    fireEvent.click(
      screen.getByRole("button", {
        name: `Select ${firstKey.label} at ${firstKey.s.toFixed(2)} metres`
      })
    );
    await waitFor(() => expect(readout()).toBe("Editing keys"));
    expect(screen.queryByText("clip preview")).toBeNull();
  });
  it("commits constrained core targets and preserves the last valid targets", async () => {
    const scenario = useAppStore.getState().scenario.scenario as Scenario;
    const original = scenario.poseClip.keys[0]!.targets;
    const conflict: DesignConflict = {
      code: "rider-bike-overlap",
      kind: "clearance",
      keyIndex: 0,
      riderPart: "leftThigh",
      bikePart: "topTube",
      separation: -0.02,
      message: "Left thigh overlaps top tube"
    };
    const acceptedTargets = { ...original, hip: original.hip + 0.05 };
    const resolvePoseEdit = vi.fn(
      async (
        candidate: Scenario,
        keyIndex: number,
        _baseline: typeof original,
        requested: typeof original
      ) => createResolution(candidate, keyIndex, requested, acceptedTargets, [conflict])
    );

    renderWithProviders(<DesignerPage />, {
      services: { solverGateway: createSolverGateway({ resolvePoseEdit }) }
    });

    const hip = await screen.findByLabelText("Hip");
    fireEvent.change(hip, { target: { value: String(original.hip + 0.4) } });

    await waitFor(() => {
      const current = useAppStore.getState().scenario.scenario as Scenario;
      expect(current.poseClip.keys[0]?.targets).toEqual(acceptedTargets);
    });
    expect(resolvePoseEdit).toHaveBeenCalledWith(
      expect.any(Object),
      0,
      original,
      expect.objectContaining({ hip: original.hip + 0.4 })
    );
    expect(screen.getAllByText(/left thigh overlaps top tube/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("heading", { name: "Pose conflicts" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ready" })).toBeVisible();
  });

  it("rejects stale pose resolutions", async () => {
    const scenario = useAppStore.getState().scenario.scenario as Scenario;
    const original = scenario.poseClip.keys[0]!.targets;
    let resolveFirst: ((value: PoseEditResolution) => void) | undefined;
    let resolveSecond: ((value: PoseEditResolution) => void) | undefined;
    const resolvePoseEdit = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<PoseEditResolution>((resolve) => (resolveFirst = resolve))
      )
      .mockImplementationOnce(
        () => new Promise<PoseEditResolution>((resolve) => (resolveSecond = resolve))
      );

    renderWithProviders(<DesignerPage />, {
      services: { solverGateway: createSolverGateway({ resolvePoseEdit }) }
    });

    const hip = await screen.findByLabelText("Hip");
    fireEvent.change(hip, { target: { value: String(original.hip + 0.1) } });
    await waitFor(() => expect(resolvePoseEdit).toHaveBeenCalledTimes(1));
    fireEvent.change(hip, { target: { value: String(original.hip + 0.2) } });
    await waitFor(() => expect(resolvePoseEdit).toHaveBeenCalledTimes(2));

    resolveSecond?.(createResolution(scenario, 0, { ...original, hip: original.hip + 0.2 }));
    resolveFirst?.(createResolution(scenario, 0, { ...original, hip: original.hip + 0.1 }));

    await waitFor(() => {
      expect(
        (useAppStore.getState().scenario.scenario as Scenario).poseClip.keys[0]?.targets.hip
      ).toBeCloseTo(original.hip + 0.2, 6);
    });
  });

  it("keeps settled status visible while a pose edit is validating", async () => {
    const scenario = useAppStore.getState().scenario.scenario as Scenario;
    const original = scenario.poseClip.keys[0]!.targets;
    const requestedHip = original.hip + 0.13;
    let finishEdit: ((value: PoseEditResolution) => void) | undefined;
    const resolvePoseEdit = vi.fn(async (candidate, keyIndex, _baseline, requested) => {
      if (Math.abs(requested.hip - requestedHip) < 1e-6) {
        return new Promise<PoseEditResolution>((resolve) => (finishEdit = resolve));
      }
      return createResolution(candidate, keyIndex, requested);
    });

    renderWithProviders(<DesignerPage />, {
      services: { solverGateway: createSolverGateway({ resolvePoseEdit }) }
    });

    const hip = await screen.findByLabelText("Hip");
    await screen.findByText("All poses fit the bike.");
    fireEvent.change(hip, { target: { value: String(requestedHip) } });
    await waitFor(() => expect(finishEdit).toBeDefined());

    expect(screen.getByText("All poses fit the bike.")).toBeVisible();
    expect(document.querySelector('[data-od-id="apply-disabled-reason"]')).toBeNull();
    expect(screen.getByRole("button", { name: /apply to run/i })).toBeDisabled();

    finishEdit?.(createResolution(scenario, 0, { ...original, hip: requestedHip }));
  });

  it("shows selected and all-key conflicts, contact state, and blocks Apply while invalid", async () => {
    const scenario = useAppStore.getState().scenario.scenario as Scenario;
    const conflicts: DesignConflict[] = [
      {
        code: "pelvis-below-top-tube",
        kind: "clearance",
        keyIndex: 0,
        riderPart: "pelvis",
        bikePart: "topTube",
        separation: -0.014,
        message: "Pelvis must remain above top tube"
      },
      {
        code: "rider-bike-overlap",
        kind: "clearance",
        keyIndex: 1,
        riderPart: "torso",
        bikePart: "handlebar",
        separation: -0.008,
        message: "Torso overlaps handlebar"
      }
    ];
    const invalid = createDesignValidation(scenario, {
      canSolve: false,
      conflictCount: 2,
      poseKeys: scenario.poseClip.keys.map((_, keyIndex) =>
        createKeyValidation(scenario, keyIndex, {
          valid: false,
          minimumSeparation: conflicts[keyIndex]?.separation ?? 0,
          conflicts: conflicts.filter((conflict) => conflict.keyIndex === keyIndex)
        })
      )
    });
    const validateDesign = vi.fn().mockResolvedValue(invalid);

    renderWithProviders(<DesignerPage />, {
      services: { solverGateway: createSolverGateway({ validateDesign }) }
    });

    expect(
      (await screen.findAllByText(/pelvis must remain above top tube/i)).length
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/torso overlaps handlebar/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/saddle contact/i)).toBeVisible();
    expect(screen.getByText(/2 poses need attention/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /apply to run/i })).toBeDisabled();
    expect(screen.getByText(/apply disabled.*2 pose conflicts/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /key 2.*torso.*handlebar/i }));
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: new RegExp(scenario.poseClip.keys[1]!.label, "i") })
      ).toHaveAttribute("aria-selected", "true")
    );
  });

  it("keeps stable key identities across sorted add/move/delete and enforces minimum keys", async () => {
    const samplePose = vi.fn(async (scenario: Scenario, s: number) => createSample(s));
    const dispose = vi.fn().mockResolvedValue(undefined);

    const { unmount } = renderWithProviders(<DesignerPage />, {
      services: {
        solverGateway: createSolverGateway({ samplePose, dispose })
      }
    });

    const listbox = await screen.findByRole("listbox", { name: /keyframe list/i });
    await waitFor(() => expect(listbox.querySelectorAll('[role="option"]').length).toBe(2));

    const firstId = listbox.querySelector('[role="option"]')?.getAttribute("id");
    expect(firstId).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /add keyframe/i }));
    await waitFor(() => expect(listbox.querySelectorAll('[role="option"]').length).toBe(3));

    fireEvent.click(screen.getByRole("button", { name: /delete key/i }));
    await waitFor(() => expect(listbox.querySelectorAll('[role="option"]').length).toBe(2));
    expect(screen.getByRole("button", { name: /delete key/i })).toBeDisabled();

    const currentFirstId = listbox.querySelector('[role="option"]')?.getAttribute("id");
    expect(currentFirstId).toBe(firstId);

    unmount();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("applies valid edits immediately, marks stale results, updates interpolation, and supports reset", async () => {
    const scenario = useAppStore.getState().scenario.scenario as Scenario;
    useAppStore.setState((state) => ({
      ...state,
      scenario: { ...state.scenario, resultState: "current" }
    }));

    renderWithProviders(<DesignerPage />, {
      services: {
        solverGateway: createSolverGateway()
      }
    });

    const hip = await screen.findByLabelText("Hip");
    fireEvent.change(hip, { target: { value: "0.85" } });

    await waitFor(() => {
      const current = useAppStore.getState().scenario.scenario as Scenario;
      expect(current.poseClip.keys[0]?.targets.hip).toBeCloseTo(0.85, 5);
    });
    expect(useAppStore.getState().scenario.resultState).toBe("stale");

    const hipCurve = () =>
      document.querySelector('[data-od-id="channel-curve-hip"]')?.getAttribute("d") ?? "";
    const cubicCurve = hipCurve();
    expect(cubicCurve.length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText(/interpolation mode/i), { target: { value: "step" } });
    await waitFor(() => {
      expect((useAppStore.getState().scenario.scenario as Scenario).poseClip.interpolation).toBe(
        "step"
      );
    });
    expect(hipCurve()).not.toBe(cubicCurve);

    fireEvent.click(screen.getByRole("button", { name: /reset pose/i }));
    await waitFor(() => {
      expect((useAppStore.getState().scenario.scenario as Scenario).poseClip.interpolation).toBe(
        scenario.poseClip.interpolation
      );
    });
  });

  it("coalesces rapid joint edits to the newest value in an animation frame", async () => {
    const samplePose = vi.fn(async (_nextScenario: Scenario, s: number) => createSample(s));
    renderWithProviders(<DesignerPage />, {
      services: {
        solverGateway: createSolverGateway({ samplePose })
      }
    });

    const hip = await screen.findByLabelText("Hip");
    let scheduled: FrameRequestCallback | null = null;
    const requestFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        scheduled = callback;
        return 1;
      });
    samplePose.mockClear();

    fireEvent.change(hip, { target: { value: "0.5" } });
    fireEvent.change(hip, { target: { value: "0.6" } });
    fireEvent.change(hip, { target: { value: "0.7" } });
    expect(scheduled).not.toBeNull();
    (scheduled as FrameRequestCallback)(performance.now());

    await waitFor(() => {
      const current = useAppStore.getState().scenario.scenario as Scenario;
      expect(current.poseClip.keys[0]?.targets.hip).toBe(0.7);
    });
    const sampledHips = samplePose.mock.calls.map(
      ([candidate]) => candidate.poseClip.keys[0]?.targets.hip
    );
    expect(sampledHips).not.toContain(0.5);
    expect(sampledHips).not.toContain(0.6);
    expect(sampledHips).toContain(0.7);
    requestFrame.mockRestore();
  });

  it("caps broad scenario limits to normal human authoring ranges", async () => {
    const scenario = structuredClone(useAppStore.getState().scenario.scenario as Scenario);
    for (const joint of ["knee", "hip", "spine"] as const) {
      scenario.rider.joints[joint].min = -Math.PI;
      scenario.rider.joints[joint].max = Math.PI;
    }
    const firstKey = scenario.poseClip.keys[0];
    if (firstKey) {
      firstKey.targets.knee = 2.5;
      firstKey.targets.hip = 2.5;
      firstKey.targets.spine = 2.5;
    }
    useAppStore.getState().actions.setScenario(scenario, await hashScenario(scenario));

    renderWithProviders(<DesignerPage />, {
      services: {
        solverGateway: createSolverGateway()
      }
    });

    const knee = await screen.findByLabelText("Knee");
    const hip = screen.getByLabelText("Hip");
    const spine = screen.getByLabelText("Spine");
    expect(knee).toHaveAttribute("min", "-0.6");
    expect(knee).toHaveAttribute("max", "2.2");
    expect(hip).toHaveAttribute("min", "-1.8");
    expect(hip).toHaveAttribute("max", "1.6");
    expect(spine).toHaveAttribute("min", "-1");
    expect(spine).toHaveAttribute("max", "2");
    // Opening the editor shows clamped values without rewriting the stored scenario.
    expect(
      (useAppStore.getState().scenario.scenario as Scenario).poseClip.keys[0]?.targets
    ).toEqual({ knee: 2.5, hip: 2.5, spine: 2.5 });
    expect(knee).toHaveValue("2.2");
    expect(hip).toHaveValue("1.6");
    expect(spine).toHaveValue("2");

    fireEvent.change(hip, { target: { value: "3" } });
    expect(hip).toHaveValue("1.6");
    // The first real edit writes the clamped clip back.
    fireEvent.change(hip, { target: { value: "1.2" } });
    await waitFor(() =>
      expect(
        (useAppStore.getState().scenario.scenario as Scenario).poseClip.keys[0]?.targets
      ).toEqual({ knee: 2.2, hip: 1.2, spine: 2 })
    );
  });

  it("keeps the last reachable joint value when a candidate pose saturates", async () => {
    const samplePose = vi.fn(async (nextScenario: Scenario, s: number) => ({
      ...createSample(s),
      derivedArm: {
        ...createSample(s).derivedArm,
        constrained: (nextScenario.poseClip.keys[0]?.targets.hip ?? 0) > 0.9
      }
    }));
    renderWithProviders(<DesignerPage />, {
      services: {
        solverGateway: createSolverGateway({ samplePose })
      }
    });

    const hip = await screen.findByLabelText("Hip");
    const original = (useAppStore.getState().scenario.scenario as Scenario).poseClip.keys[0]
      ?.targets.hip;
    fireEvent.change(hip, { target: { value: "1" } });

    await waitFor(() => expect(samplePose.mock.calls.length).toBeGreaterThan(1));
    expect(
      (useAppStore.getState().scenario.scenario as Scenario).poseClip.keys[0]?.targets.hip
    ).toBe(original);
    expect(hip).toHaveValue(String(original));
    expect(document.querySelector('[data-od-id="saturation-pill"]')).toHaveTextContent("reachable");
  });

  it("rejects a candidate when the left leg cannot reach its pedal", async () => {
    const samplePose = vi.fn(async (nextScenario: Scenario, s: number) => {
      const sample = createSample(s);
      if ((nextScenario.poseClip.keys[0]?.targets.hip ?? 0) <= 0.9) return sample;
      return {
        ...sample,
        landmarks: {
          ...sample.landmarks,
          pedalContact: { x: -0.015, y: 0.33 },
          ankle: { x: -0.015, y: 0.33 },
          knee: { x: -0.015, y: 0.43 },
          hip: { x: -0.015, y: 0.53 }
        }
      };
    });
    renderWithProviders(<DesignerPage />, {
      services: {
        solverGateway: createSolverGateway({ samplePose })
      }
    });

    const hip = await screen.findByLabelText("Hip");
    const original = hip.getAttribute("value");
    fireEvent.change(hip, { target: { value: "1" } });

    await waitFor(() => expect(samplePose.mock.calls.length).toBeGreaterThan(1));
    expect(hip).toHaveValue(original ?? "");
    expect(document.querySelector('[data-od-id="saturation-pill"]')).toHaveTextContent("reachable");
  });

  it("shows how far each joint can currently move before a coupled limit blocks it", async () => {
    const blockedAbove = 0.9;
    const conflict: DesignConflict = {
      code: "shoulder-joint-limit",
      kind: "joint-limit",
      keyIndex: 0,
      riderPart: null,
      bikePart: null,
      separation: null,
      message: "shoulder must leave its declared range to hold the handlebar"
    };
    const resolvePoseEdit = vi.fn(async (scenario, keyIndex, baseline, requested) =>
      requested.spine <= blockedAbove
        ? createResolution(scenario, keyIndex, requested)
        : createResolution(scenario, keyIndex, requested, baseline, [conflict])
    );

    renderWithProviders(<DesignerPage />, {
      services: {
        solverGateway: createSolverGateway({ resolvePoseEdit })
      }
    });

    const spine = await screen.findByLabelText("Spine");
    expect(spine).not.toHaveAttribute("aria-describedby");

    // The track stops where the coupled arm limit blocks the pose, so the
    // control cannot offer a value the rail already reports as unreachable.
    await waitFor(
      () => {
        expect(Number(spine.getAttribute("max"))).toBeLessThanOrEqual(blockedAbove);
      },
      { timeout: 4000 }
    );
    expect(Number(spine.getAttribute("max"))).toBeGreaterThan(blockedAbove - 0.05);

    // The unconstrained knee keeps its full declared extent.
    expect(screen.getByLabelText("Knee")).toHaveAttribute("max", "1.5");
  });

  it("sets hip extents from clearance-aware pose resolution", async () => {
    const hipMaximum = 0.4;
    const conflict: DesignConflict = {
      code: "rider-bike-overlap",
      kind: "clearance",
      keyIndex: 0,
      riderPart: "pelvis",
      bikePart: "topTube",
      separation: -0.01,
      message: "Pelvis overlaps top tube"
    };
    const resolvePoseEdit = vi.fn(async (scenario, keyIndex, baseline, requested) =>
      requested.hip <= hipMaximum
        ? createResolution(scenario, keyIndex, requested)
        : createResolution(scenario, keyIndex, requested, baseline, [conflict])
    );

    renderWithProviders(<DesignerPage />, {
      services: { solverGateway: createSolverGateway({ resolvePoseEdit }) }
    });

    const hip = await screen.findByLabelText("Hip");
    await waitFor(
      () => {
        expect(Number(hip.getAttribute("max"))).toBeLessThanOrEqual(hipMaximum);
      },
      { timeout: 4000 }
    );
    expect(Number(hip.getAttribute("max"))).toBeGreaterThan(hipMaximum - 0.05);
  });

  it("rejects stale async samples and surfaces finite constrained output", async () => {
    let firstResolve: ((sample: PoseSample) => void) | null = null;
    let secondResolve: ((sample: PoseSample) => void) | null = null;

    const samplePose = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<PoseSample>((resolve) => {
            firstResolve = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<PoseSample>((resolve) => {
            secondResolve = resolve;
          })
      );

    renderWithProviders(<DesignerPage />, {
      services: {
        solverGateway: createSolverGateway({ samplePose })
      }
    });

    const listbox = await screen.findByRole("listbox", { name: /keyframe list/i });
    fireEvent.keyDown(listbox, { key: "ArrowDown" });

    secondResolve?.({
      ...createSample(0),
      derivedArm: { shoulder: Number.NaN, elbow: Number.POSITIVE_INFINITY, constrained: false }
    });

    firstResolve?.({
      ...createSample(-5),
      targets: { knee: 0.8, hip: 0.6, spine: 0.2 }
    });

    await waitFor(() => {
      expect(screen.getByText(/saturated|constrained/i)).toBeVisible();
    });

    expect(samplePose.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("pose-shoulder-value")).toHaveTextContent(/-?\d+\.\d+/);
    expect(screen.getByTestId("pose-elbow-value")).toHaveTextContent(/-?\d+\.\d+/);
  });

  it("exposes the achieved elbow as read-only text with no editable elbow control", async () => {
    renderWithProviders(<DesignerPage />, {
      services: {
        solverGateway: createSolverGateway()
      }
    });

    await screen.findByTestId("pose-elbow-value");
    expect(screen.queryByLabelText(/^elbow$/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Hip")).toBeInTheDocument();
    expect(screen.getByLabelText("Knee")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ankle")).not.toBeInTheDocument();
  });
});
