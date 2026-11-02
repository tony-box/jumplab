import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  hashScenario,
  type BaselineSelection,
  type RunArtifact,
  type Scenario,
  type SolverCapabilityManifest,
  type TerrainProfile
} from "../../../../packages/schema/src/index";
import { createDemoFixtures } from "../../../../tests/fixtures/ui/demo-fixtures";
import { WorkbenchPage } from "../../src/features/workbench/WorkbenchPage";
import { renderWithProviders } from "../test-utils";
import { useAppStore } from "../../src/state/store";
import { versionManifest } from "../../src/app/version-manifest";
import { canonicalBikeGeometry } from "./canonical-bike-fixture";

const fixtures = createDemoFixtures();
const terrainProfile: TerrainProfile = {
  segments: [
    {
      id: "approach-takeoff",
      kind: "approach-takeoff",
      points: [
        [-8, 0],
        [0, 1]
      ]
    },
    {
      id: "landing-rollout",
      kind: "landing-rollout",
      points: [
        [4, 1],
        [12, 0]
      ]
    }
  ],
  approachStartX: -8,
  lipX: 0,
  landingStartX: 4,
  sampleStep: 0.1
};

const setFrameField = (
  artifact: RunArtifact,
  frameIndex: number,
  fieldName: string,
  value: number
): void => {
  const field = artifact.manifest.frameLayout.fields.find((entry) => entry.name === fieldName);
  if (!field) throw new Error(`Missing frame field ${fieldName}`);
  new Float32Array(artifact.frameBuffer)[
    frameIndex * artifact.manifest.frameLayout.strideFloat32 + field.offset
  ] = value;
};

const createArtifact = async (runId: string, scenario: Scenario): Promise<RunArtifact> => {
  const scenarioHash = await hashScenario(scenario);
  const result = fixtures.createRunResult({
    runId,
    scenarioHash,
    solverVersion: versionManifest.solver,
    frameLayout: {
      version: FRAME_LAYOUT_VERSION,
      strideFloat32: FRAME_STRIDE_FLOAT32,
      fields: FRAME_LAYOUT_FIELDS
    },
    frameCount: 30,
    outputHz: 120,
    phases: [
      { name: "approach", startFrame: 0, endFrame: 9 },
      { name: "takeoff", startFrame: 10, endFrame: 10 },
      { name: "flight", startFrame: 11, endFrame: 22 },
      { name: "landing", startFrame: 23, endFrame: 29 }
    ]
  });

  return {
    runId,
    createdAt: new Date().toISOString(),
    scenarioSnapshot: structuredClone(scenario),
    scenarioHash,
    manifest: result,
    model: {
      scenarioSchemaVersion: versionManifest.schema,
      solverVersion: versionManifest.solver,
      modelVersion: versionManifest.model,
      assumptionsId: "default-assumptions-v1",
      unitSystemId: "si-v1",
      metricDefinitionVersion: "core-metrics-v1",
      terrainSampleStep: 0.1
    },
    frameBuffer: fixtures.createFrameBuffer(result.frameCount, result.frameLayout.strideFloat32),
    telemetryBuffer: new ArrayBuffer(0),
    source: "solver"
  };
};

const createManifest = (): SolverCapabilityManifest => ({
  protocolVersion: 3,
  solverVersion: versionManifest.solver,
  modelVersion: versionManifest.model,
  deterministic: true,
  supportedScenarioPaths: [
    "scenario.jump.kind",
    "scenario.jump.lipHeight",
    "scenario.jump.lipAngle",
    "scenario.jump.transitionLength",
    "scenario.jump.gap",
    "scenario.jump.stepDelta",
    "scenario.jump.landingAngle",
    "scenario.jump.landingLength",
    "scenario.jump.rollout",
    "scenario.entry.speed",
    "scenario.entry.startX",
    "scenario.rider.height",
    "scenario.rider.mass",
    "scenario.bike.wheelbase",
    "scenario.bike.mass",
    "scenario.bike.fork.travel",
    "scenario.bike.fork.sag"
  ],
  supportedOutputs: ["height", "velocity", "contactImpulse"],
  ccd: true,
  contactImpulse: true,
  motorWork: true,
  jointTorque: false
});

describe("workbench page", () => {
  beforeEach(() => {
    const { actions } = useAppStore.getState();
    actions.clearScenario();
    actions.setScenario(fixtures.createScenario(), "workbench-test-hash");
  });

  afterEach(() => {
    cleanup();
  });

  it("renders workbench selectors and capability-gated controls", async () => {
    const scenario = fixtures.createScenario();
    const dispose = vi.fn().mockResolvedValue(undefined);

    const { unmount } = renderWithProviders(<WorkbenchPage />, {
      services: {
        solverGateway: {
          initialize: vi.fn().mockResolvedValue(createManifest()),
          solve: vi
            .fn()
            .mockImplementation(async (runId: string, nextScenario: Scenario) =>
              createArtifact(runId, nextScenario)
            ),
          cancel: vi.fn().mockResolvedValue(undefined),
          inspectBikeGeometry: vi.fn().mockResolvedValue(canonicalBikeGeometry()),
          samplePose: vi.fn(),
          analyzeSpeedWindow: vi.fn(),
          terrain: vi.fn().mockResolvedValue(terrainProfile),
          dispose
        },
        runArtifactRepository: {
          save: vi.fn(async (artifact) => artifact),
          replaceSolution: vi.fn(async (_runId, artifact) => artifact as RunArtifact),
          get: vi.fn().mockResolvedValue(null),
          list: vi.fn().mockResolvedValue([]),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Solve run" })).toBeEnabled());
    await waitFor(() => expect(screen.getByLabelText("Entry speed")).toBeEnabled());
    expect(screen.queryByRole("tab", { name: "Rider" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Bike" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Follow" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Pan & Zoom" })).toBeVisible();
    expect(screen.getByRole("slider", { name: "Camera zoom" })).toHaveValue("1");
    expect(screen.getByRole("button", { name: "Reset view" })).toBeVisible();
    const playbackSpeed = screen.getByRole("slider", { name: "Playback speed" });
    expect(playbackSpeed).toHaveAttribute("min", "0.1");
    expect(playbackSpeed).toHaveAttribute("max", "2");
    expect(playbackSpeed).toHaveAttribute("step", "0.1");
    expect(playbackSpeed).toHaveAttribute("list", "playback-rate-detents");
    expect(playbackSpeed).toHaveValue("1");

    fireEvent.change(playbackSpeed, { target: { value: "0.1" } });
    expect(useAppStore.getState().session.view.playbackRate).toBe(0.1);
    fireEvent.change(playbackSpeed, { target: { value: "0.5" } });
    expect(useAppStore.getState().session.view.playbackRate).toBe(0.5);

    fireEvent.change(screen.getByRole("slider", { name: "Camera zoom" }), {
      target: { value: "1.6" }
    });
    expect(useAppStore.getState().session.view.cameraZoomFactor).toBe(1.6);

    fireEvent.click(screen.getByRole("button", { name: "Pan & Zoom" }));
    expect(useAppStore.getState().session.view.cameraMode).toBe("pan-zoom");
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(useAppStore.getState().session.view.cameraMode).toBe("follow");
    expect(useAppStore.getState().session.view.manualCamera).toBeNull();
    expect(useAppStore.getState().session.view.cameraZoomFactor).toBe(1);

    unmount();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("marks stale results from input edits without invoking solve", async () => {
    const scenario = fixtures.createScenario();
    const solve = vi
      .fn()
      .mockImplementation(async (runId: string, nextScenario: Scenario) =>
        createArtifact(runId, nextScenario)
      );

    renderWithProviders(<WorkbenchPage />, {
      services: {
        solverGateway: {
          initialize: vi.fn().mockResolvedValue(createManifest()),
          solve,
          cancel: vi.fn().mockResolvedValue(undefined),
          inspectBikeGeometry: vi.fn().mockResolvedValue(canonicalBikeGeometry()),
          samplePose: vi.fn(),
          analyzeSpeedWindow: vi.fn(),
          terrain: vi.fn().mockResolvedValue(terrainProfile),
          dispose: vi.fn().mockResolvedValue(undefined)
        },
        runArtifactRepository: {
          save: vi.fn(async (artifact) => artifact),
          replaceSolution: vi.fn(async (_runId, artifact) => artifact as RunArtifact),
          get: vi.fn().mockResolvedValue(null),
          list: vi.fn().mockResolvedValue([]),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await waitFor(() => expect(screen.getByLabelText("Entry speed")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Entry speed"), { target: { value: "8.1" } });

    expect(solve).not.toHaveBeenCalled();
    expect(useAppStore.getState().scenario.resultState).toBe("none");
  });

  it("solves explicitly, supports playback actions, and pins baseline without re-solving", async () => {
    const scenario = fixtures.createScenario();
    const artifact = await createArtifact("33333333-3333-4333-8333-333333333333", scenario);
    const solve = vi
      .fn()
      .mockImplementation(async (runId: string, nextScenario: Scenario) =>
        createArtifact(runId, nextScenario)
      );

    const compare = vi.fn(
      (_current: RunArtifact | null, baseline: RunArtifact | null): BaselineSelection => {
        if (!baseline) {
          return { runId: null, compatibility: "none", reasons: [] };
        }
        return { runId: baseline.runId, compatibility: "compatible", reasons: [] };
      }
    );

    renderWithProviders(<WorkbenchPage />, {
      services: {
        solverGateway: {
          initialize: vi.fn().mockResolvedValue(createManifest()),
          solve,
          cancel: vi.fn().mockResolvedValue(undefined),
          inspectBikeGeometry: vi.fn().mockResolvedValue(canonicalBikeGeometry()),
          samplePose: vi.fn(),
          analyzeSpeedWindow: vi.fn(),
          terrain: vi.fn().mockResolvedValue(terrainProfile),
          dispose: vi.fn().mockResolvedValue(undefined)
        },
        runArtifactRepository: {
          save: vi.fn(async (saved) => saved),
          replaceSolution: vi.fn(async (_runId, saved) => saved as RunArtifact),
          get: vi.fn().mockResolvedValue(artifact),
          list: vi.fn().mockResolvedValue([]),
          remove: vi.fn().mockResolvedValue(undefined)
        },
        baselineComparator: {
          compare
        }
      }
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Solve run" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Solve run" }));

    await waitFor(() => expect(solve).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useAppStore.getState().run.active?.runId).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Step forward one frame" }));
    fireEvent.click(screen.getByRole("button", { name: "Pin baseline" }));
    await waitFor(() =>
      expect(useAppStore.getState().run.baselineRunId).toBe(
        useAppStore.getState().run.active?.runId ?? null
      )
    );
    expect(solve).toHaveBeenCalledTimes(1);
  });

  it("renders a solved run whose frames carry the complete achieved pose and landmarks", async () => {
    const scenario = fixtures.createScenario();
    const solve = vi
      .fn()
      .mockImplementation(async (runId: string, nextScenario: Scenario) =>
        createArtifact(runId, nextScenario)
      );

    renderWithProviders(<WorkbenchPage />, {
      services: {
        solverGateway: {
          initialize: vi.fn().mockResolvedValue(createManifest()),
          solve,
          cancel: vi.fn().mockResolvedValue(undefined),
          inspectBikeGeometry: vi.fn().mockResolvedValue(canonicalBikeGeometry()),
          samplePose: vi.fn(),
          analyzeSpeedWindow: vi.fn(),
          terrain: vi.fn().mockResolvedValue(terrainProfile),
          dispose: vi.fn().mockResolvedValue(undefined)
        },
        runArtifactRepository: {
          save: vi.fn(async (saved) => saved),
          replaceSolution: vi.fn(async (_runId, saved) => saved as RunArtifact),
          get: vi.fn().mockResolvedValue(null),
          list: vi.fn().mockResolvedValue([]),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Solve run" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Solve run" }));
    await waitFor(() => expect(solve).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useAppStore.getState().run.active?.runId).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Step forward one frame" }));
    expect(
      document.querySelector('canvas[aria-label="Jump simulation stage"]')
    ).toBeInTheDocument();
  });

  it("loads authoritative terrain and reports measured contact at touchdown", async () => {
    const terrain = vi.fn().mockResolvedValue(terrainProfile);
    const solve = vi.fn().mockImplementation(async (runId: string, scenario: Scenario) => {
      const artifact = await createArtifact(runId, scenario);
      new Float32Array(artifact.frameBuffer).fill(0);
      setFrameField(artifact, 1, "groundedRear", 1);
      setFrameField(artifact, 1, "normalForceRear", 100);
      setFrameField(artifact, 1, "normalForceFront", 50);
      setFrameField(artifact, 1, "minClearance", -0.002);
      return artifact;
    });

    renderWithProviders(<WorkbenchPage />, {
      services: {
        solverGateway: {
          initialize: vi.fn().mockResolvedValue(createManifest()),
          solve,
          cancel: vi.fn().mockResolvedValue(undefined),
          inspectBikeGeometry: vi.fn().mockResolvedValue(canonicalBikeGeometry()),
          samplePose: vi.fn(),
          analyzeSpeedWindow: vi.fn(),
          terrain,
          dispose: vi.fn().mockResolvedValue(undefined)
        },
        runArtifactRepository: {
          save: vi.fn(async (saved) => saved),
          replaceSolution: vi.fn(async (_runId, saved) => saved as RunArtifact),
          get: vi.fn().mockResolvedValue(null),
          list: vi.fn().mockResolvedValue([]),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Solve run" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Solve run" }));
    // Terrain is live, so its readiness no longer implies the solve finished.
    await waitFor(() => expect(solve).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/contact 0.0 N · touchdown 1/i)).toBeVisible());
    await waitFor(() => expect(screen.getByText(/terrain ready/i)).toBeVisible());
    expect(terrain).toHaveBeenCalledWith(expect.any(Object), 0.1);

    fireEvent.click(screen.getByRole("button", { name: "Step forward one frame" }));
    expect(screen.getByText(/contact 150.0 N · touchdown 1/i)).toBeVisible();
  });

  it("renders terrain before any run and refetches only when the jump shape changes", async () => {
    const terrain = vi.fn().mockResolvedValue(terrainProfile);
    const solve = vi.fn();

    renderWithProviders(<WorkbenchPage />, {
      services: {
        solverGateway: {
          initialize: vi.fn().mockResolvedValue(createManifest()),
          solve,
          cancel: vi.fn().mockResolvedValue(undefined),
          inspectBikeGeometry: vi.fn().mockResolvedValue(canonicalBikeGeometry()),
          samplePose: vi.fn(),
          analyzeSpeedWindow: vi.fn(),
          terrain,
          dispose: vi.fn().mockResolvedValue(undefined)
        },
        runArtifactRepository: {
          save: vi.fn(async (saved) => saved),
          replaceSolution: vi.fn(async (_runId, saved) => saved as RunArtifact),
          get: vi.fn().mockResolvedValue(null),
          list: vi.fn().mockResolvedValue([]),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await waitFor(() => expect(screen.getByText(/terrain ready/i)).toBeVisible());
    expect(solve).not.toHaveBeenCalled();
    expect(terrain).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(screen.getByLabelText("Lip height")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Lip height"), { target: { value: "1.6" } });

    await waitFor(() => expect(terrain).toHaveBeenCalledTimes(2));
    expect(terrain.mock.calls[1]?.[0]).toMatchObject({ jump: { lipHeight: 1.6 } });

    fireEvent.change(screen.getByLabelText("Entry speed"), { target: { value: "8.1" } });
    await waitFor(() =>
      expect(useAppStore.getState().scenario.scenario?.entry.speed).toBeCloseTo(8.1)
    );
    expect(terrain).toHaveBeenCalledTimes(2);
  });

  it("raises the lip angle when height would otherwise create a rollover", async () => {
    renderWithProviders(<WorkbenchPage />, {
      services: {
        solverGateway: {
          initialize: vi.fn().mockResolvedValue(createManifest()),
          solve: vi.fn(),
          cancel: vi.fn().mockResolvedValue(undefined),
          inspectBikeGeometry: vi.fn().mockResolvedValue(canonicalBikeGeometry()),
          samplePose: vi.fn(),
          analyzeSpeedWindow: vi.fn(),
          terrain: vi.fn().mockResolvedValue(terrainProfile),
          dispose: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await waitFor(() => expect(screen.getByLabelText("Lip height")).toBeEnabled());
    fireEvent.change(screen.getByLabelText("Lip height"), { target: { value: "2" } });

    await waitFor(() => {
      const jump = useAppStore.getState().scenario.scenario?.jump;
      expect(jump?.lipAngle ?? 0).toBeGreaterThanOrEqual(Math.atan((1.5 * 2) / 1.7));
    });
  });

  it("enables Step delta only for step-up and step-down jump kinds", async () => {
    renderWithProviders(<WorkbenchPage />, {
      services: {
        solverGateway: {
          initialize: vi.fn().mockResolvedValue(createManifest()),
          solve: vi.fn(),
          cancel: vi.fn().mockResolvedValue(undefined),
          inspectBikeGeometry: vi.fn().mockResolvedValue(canonicalBikeGeometry()),
          samplePose: vi.fn(),
          analyzeSpeedWindow: vi.fn(),
          terrain: vi.fn().mockResolvedValue(terrainProfile),
          dispose: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Step up" })).toBeEnabled());
    expect(screen.getByLabelText("Step delta")).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Step up" }));
    await waitFor(() => expect(screen.getByLabelText("Step delta")).toBeEnabled());
    expect(useAppStore.getState().scenario.scenario?.jump).toMatchObject({
      kind: "stepup",
      stepDelta: 0.5
    });

    fireEvent.change(screen.getByLabelText("Step delta"), { target: { value: "1.25" } });
    await waitFor(() =>
      expect(useAppStore.getState().scenario.scenario?.jump.stepDelta).toBe(1.25)
    );

    fireEvent.click(screen.getByRole("button", { name: "Step down" }));
    await waitFor(() =>
      expect(useAppStore.getState().scenario.scenario?.jump).toMatchObject({
        kind: "stepdown",
        stepDelta: -0.5
      })
    );
  });

  it("blocks a legacy run with no scenario snapshot and disables playback", async () => {
    const legacyRunId = "44444444-4444-4444-8444-444444444444";
    const legacyResult = fixtures.createRunResult({ runId: legacyRunId });
    const { actions } = useAppStore.getState();
    actions.beginSolve(legacyRunId);
    actions.commitRunResult(legacyResult);

    renderWithProviders(<WorkbenchPage />, {
      services: {
        solverGateway: {
          initialize: vi.fn().mockResolvedValue(createManifest()),
          solve: vi.fn(),
          cancel: vi.fn().mockResolvedValue(undefined),
          inspectBikeGeometry: vi.fn().mockResolvedValue(canonicalBikeGeometry()),
          samplePose: vi.fn(),
          analyzeSpeedWindow: vi.fn(),
          terrain: vi.fn().mockResolvedValue(terrainProfile),
          dispose: vi.fn().mockResolvedValue(undefined)
        },
        runArtifactRepository: {
          save: vi.fn(async (saved) => saved),
          replaceSolution: vi.fn(async (_runId, saved) => saved as RunArtifact),
          get: vi.fn().mockResolvedValue(null),
          list: vi.fn().mockResolvedValue([
            {
              runId: legacyRunId,
              createdAt: "2026-01-01T00:00:00.000Z",
              source: "solver",
              legacySnapshotMissing: true
            }
          ]),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await waitFor(() => expect(screen.getByText("Run unavailable")).toBeVisible());
    await waitFor(() =>
      expect(screen.getByText("Legacy run did not capture a scenario snapshot")).toBeVisible()
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });

  it("blocks an invalid stored snapshot load and surfaces the repository reason", async () => {
    const runId = "55555555-5555-4555-8555-555555555555";
    const { actions } = useAppStore.getState();
    actions.beginSolve(runId);
    actions.commitRunResult(fixtures.createRunResult({ runId }));

    renderWithProviders(<WorkbenchPage />, {
      services: {
        solverGateway: {
          initialize: vi.fn().mockResolvedValue(createManifest()),
          solve: vi.fn(),
          cancel: vi.fn().mockResolvedValue(undefined),
          inspectBikeGeometry: vi.fn().mockResolvedValue(canonicalBikeGeometry()),
          samplePose: vi.fn(),
          analyzeSpeedWindow: vi.fn(),
          terrain: vi.fn().mockResolvedValue(terrainProfile),
          dispose: vi.fn().mockResolvedValue(undefined)
        },
        runArtifactRepository: {
          save: vi.fn(async (saved) => saved),
          replaceSolution: vi.fn(async (_runId, saved) => saved as RunArtifact),
          get: vi.fn().mockRejectedValue(new Error("Stored scenario snapshot is invalid")),
          list: vi.fn().mockResolvedValue([]),
          remove: vi.fn().mockResolvedValue(undefined)
        }
      }
    });

    await waitFor(() => expect(screen.getByText("Run unavailable")).toBeVisible());
    await waitFor(() =>
      expect(screen.getByText("Stored scenario snapshot is invalid")).toBeVisible()
    );
    expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  });
});
