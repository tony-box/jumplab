import { describe, expect, it, vi } from "vitest";

import {
  PROTOCOL_VERSION,
  bikeGeometryInspectedEventSchema,
  cancelCommandSchema,
  designValidatedEventSchema,
  inspectBikeGeometryCommandSchema,
  progressEventSchema,
  resolvePoseEditCommandSchema,
  poseEditResolvedEventSchema,
  readyEventSchema,
  resultEventSchema,
  solveCommandSchema,
  validateDesignCommandSchema,
  workerCommandSchema,
  workerEventSchema
} from "../../packages/schema/src/worker-protocol";
import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32
} from "../../packages/schema/src/run-result";
import { createPhysicsController } from "../../apps/web/src/solver/controller";
import { createFixtureWorkerRuntime } from "../../apps/web/src/solver/fixture.worker";
import { createWorkerRuntime, type WasmExports } from "../../apps/web/src/solver/physics.worker";
import scenarioJson from "../fixtures/scenarios/standard-v1.json";
import { scenarioSchema } from "../../packages/schema/src/scenario";
import runResultJson from "../fixtures/run-results/standard-v1.json";
import { runResultSchema } from "../../packages/schema/src/run-result";

const currentScenario = scenarioSchema.parse(scenarioJson);

const geometryInspection = {
  modelVersion: 1 as const,
  valid: true,
  issues: [],
  closureResidual: 0.004,
  landmarks: {
    rearAxle: { x: 0, y: 0.3683 },
    bottomBracket: { x: 0.44, y: 0.33 },
    frontAxle: { x: 1.25, y: 0.3683 }
  },
  members: [],
  protectedShapes: [],
  massProperties: {
    totalMass: currentScenario.bike.mass,
    centerOfGravity: { x: 0.57, y: 0.54 },
    planarInertia: 2.8,
    distributionVersion: 1 as const
  }
};

const poseSample = {
  s: currentScenario.poseClip.keys[0].s,
  targets: currentScenario.poseClip.keys[0].targets,
  derivedArm: { shoulder: -1.1, elbow: 1.2, constrained: false },
  landmarks: {
    pedalContact: { x: -0.1, y: 0.33 },
    ankle: { x: -0.1, y: 0.33 },
    knee: { x: 0.1, y: 0.7 },
    hip: { x: 0, y: 1.05 },
    shoulder: { x: 0.2, y: 1.45 },
    elbow: { x: 0.4, y: 1.3 },
    hand: { x: 0.6, y: 1.1 },
    handlebarContact: { x: 0.6, y: 1.1 },
    head: { x: 0.25, y: 1.65 }
  },
  solverVersion: currentScenario.solver.solverVersion
};

const keyValidation = {
  keyIndex: 0,
  s: poseSample.s,
  valid: true,
  sample: poseSample,
  minimumSeparation: 0,
  contacts: [
    {
      kind: "hand" as const,
      riderPart: "leftHand" as const,
      bikePart: "handlebar" as const,
      active: true,
      separation: -0.001
    }
  ],
  conflicts: []
};

const designValidation = {
  geometry: geometryInspection,
  poseKeys: [keyValidation],
  canSolve: true,
  conflictCount: 0,
  scenarioHash: "a".repeat(64),
  modelVersion: "geometry-v1",
  solverVersion: currentScenario.solver.solverVersion
};

const wasmExports = (overrides: Partial<WasmExports> = {}): WasmExports => ({
  solveScenarioJson: () => "{}",
  solveFrameBuffer: () => new Float32Array(0),
  solveTelemetryBuffer: () => new Float32Array(0),
  samplePoseJson: () => JSON.stringify(poseSample),
  analyzeSpeedWindowJson: () => "{}",
  terrainProfileJson: () => "{}",
  inspectBikeGeometry: () => JSON.stringify(geometryInspection),
  resolvePoseEditJson: () =>
    JSON.stringify({
      requestedTargets: currentScenario.poseClip.keys[0].targets,
      acceptedTargets: currentScenario.poseClip.keys[0].targets,
      requestedValid: true,
      validation: keyValidation,
      limitingConflicts: []
    }),
  validateDesignJson: () => JSON.stringify(designValidation),
  capabilitiesJson: () => "{}",
  ...overrides
});

const scenario = {
  schemaVersion: 2 as const,
  id: "2fbb1b9d-c304-48ef-b42d-f7c3418a8f30",
  name: "S",
  jump: {
    kind: "table" as const,
    lipHeight: 1,
    lipAngle: 0.9,
    transitionLength: 1.2,
    gap: 4,
    stepDelta: 0,
    landingAngle: 0.3,
    landingLength: 8,
    rollout: 12
  },
  rider: {
    height: 1.8,
    mass: 70,
    legRatio: 0.48,
    armRatio: 0.38,
    strengthScale: 1,
    kp: 1200,
    kd: 80,
    joints: {
      knee: { min: -1, max: 0.1, tauMax: 100 },
      hip: { min: -1, max: 1, tauMax: 100 },
      spine: { min: -0.5, max: 0.5, tauMax: 100 },
      shoulder: { min: -1, max: 1, tauMax: 100 },
      elbow: { min: -1, max: 0.1, tauMax: 100 }
    }
  },
  bike: {
    frameType: "hardtail" as const,
    wheelSize: 29 as const,
    wheelbase: 1.2,
    chainstay: 0.44,
    bbHeight: 0.33,
    mass: 14,
    fork: { travel: 0.14, sag: 0.03, springRate: 20000, damping: 1200 },
    rearShock: null
  },
  entry: { speed: 6, startX: -10 },
  poseClip: {
    id: "8f5ae67b-86cd-4111-af3a-7d2a758d6d16",
    name: "N",
    interpolation: "linear" as const,
    keys: [
      { s: -1, label: "a", targets: { knee: 0.7, hip: 0.3, spine: 0.1 } },
      { s: 1, label: "b", targets: { knee: 0.9, hip: 0.4, spine: 0.2 } }
    ]
  },
  solver: {
    dt: 0.004166666666666667,
    substeps: 2,
    ccd: true,
    seed: 0,
    outputHz: 120,
    solverVersion: "v1"
  }
};

describe("physics worker contract", () => {
  it("strictly validates additive Designer commands and responses", () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    const inspect = inspectBikeGeometryCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "inspect-bike-geometry",
      requestId,
      bike: currentScenario.bike
    });
    const resolve = resolvePoseEditCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "resolve-pose-edit",
      requestId,
      scenario: currentScenario,
      keyIndex: 0,
      baselineTargets: currentScenario.poseClip.keys[0].targets,
      requestedTargets: currentScenario.poseClip.keys[1].targets
    });
    const validate = validateDesignCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "validate-design",
      requestId,
      scenario: currentScenario
    });

    expect(workerCommandSchema.parse(inspect)).toEqual(inspect);
    expect(workerCommandSchema.parse(resolve)).toEqual(resolve);
    expect(workerCommandSchema.parse(validate)).toEqual(validate);
    expect(() =>
      inspectBikeGeometryCommandSchema.parse({ ...inspect, unexpected: true })
    ).toThrow();
    expect(() => workerCommandSchema.parse({ ...inspect, protocolVersion: 2 })).toThrow();

    expect(
      bikeGeometryInspectedEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "bike-geometry-inspected",
        requestId,
        inspection: geometryInspection
      }).inspection
    ).toEqual(geometryInspection);
    expect(() =>
      bikeGeometryInspectedEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "bike-geometry-inspected",
        requestId,
        inspection: geometryInspection,
        unexpected: true
      })
    ).toThrow();

    expect(poseEditResolvedEventSchema.shape.resolution).toBeDefined();
    expect(designValidatedEventSchema.shape.validation).toBeDefined();
  });

  it("correlates geometry inspections and handles Phase 3 core operations", () => {
    const wasm = wasmExports();
    const runtime = createWorkerRuntime(wasm, createPhysicsController());
    const firstRequestId = "11111111-1111-4111-8111-111111111111";
    const latestRequestId = "22222222-2222-4222-8222-222222222222";

    const stale = runtime.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "inspect-bike-geometry",
      requestId: firstRequestId,
      bike: currentScenario.bike
    });
    const latest = runtime.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "inspect-bike-geometry",
      requestId: latestRequestId,
      bike: currentScenario.bike
    });

    expect(stale[0]).toMatchObject({
      type: "bike-geometry-inspected",
      requestId: firstRequestId
    });
    expect(latest[0]).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      type: "bike-geometry-inspected",
      requestId: latestRequestId,
      inspection: geometryInspection
    });

    expect(
      runtime.handleCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "resolve-pose-edit",
        requestId: firstRequestId,
        scenario: currentScenario,
        keyIndex: 0,
        baselineTargets: currentScenario.poseClip.keys[0].targets,
        requestedTargets: currentScenario.poseClip.keys[0].targets
      })
    ).toEqual([
      expect.objectContaining({
        type: "pose-edit-resolved",
        requestId: firstRequestId,
        resolution: expect.objectContaining({ requestedValid: true })
      })
    ]);
    expect(
      runtime.handleCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "validate-design",
        requestId: latestRequestId,
        scenario: currentScenario
      })
    ).toEqual([
      expect.objectContaining({
        type: "design-validated",
        requestId: latestRequestId,
        validation: designValidation
      })
    ]);
  });

  it("validates every authored key up to the 64-key contract limit", () => {
    const validation64 = {
      ...designValidation,
      poseKeys: Array.from({ length: 64 }, (_, keyIndex) => ({
        ...keyValidation,
        keyIndex,
        s: keyIndex,
        sample: { ...poseSample, s: keyIndex }
      }))
    };
    const runtime = createWorkerRuntime(
      wasmExports({ validateDesignJson: () => JSON.stringify(validation64) }),
      createPhysicsController()
    );
    const [event] = runtime.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "validate-design",
      requestId: "11111111-1111-4111-8111-111111111111",
      scenario: currentScenario
    });

    expect(event.type).toBe("design-validated");
    if (event.type === "design-validated") {
      expect(event.validation.poseKeys).toHaveLength(64);
      expect(event.validation.poseKeys.map((key) => key.keyIndex)).toEqual(
        Array.from({ length: 64 }, (_, index) => index)
      );
    }
  });

  it("refuses invalid designs before dispatching any solve export", () => {
    const solveScenarioJson = vi.fn(() => "{}");
    const invalid = {
      ...designValidation,
      canSolve: false,
      conflictCount: 1,
      poseKeys: [
        {
          ...keyValidation,
          valid: false,
          conflicts: [
            {
              code: "rider-bike-overlap",
              kind: "clearance" as const,
              keyIndex: 0,
              riderPart: "leftThigh" as const,
              bikePart: "topTube" as const,
              separation: -0.02,
              message: "Rider envelope overlaps protected bicycle geometry"
            }
          ]
        }
      ]
    };
    const runtime = createWorkerRuntime(
      wasmExports({
        solveScenarioJson,
        validateDesignJson: () => JSON.stringify(invalid)
      }),
      createPhysicsController()
    );
    const [event] = runtime.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "solve",
      requestId: "11111111-1111-4111-8111-111111111111",
      runId: "33333333-3333-4333-8333-333333333333",
      scenario: currentScenario
    });

    expect(event).toMatchObject({ type: "error", code: "design-invalid", recoverable: true });
    expect(solveScenarioJson).not.toHaveBeenCalled();
  });

  it("returns a typed error when geometry inspection output is invalid", () => {
    const wasm: WasmExports = {
      solveScenarioJson: () => "{}",
      solveFrameBuffer: () => new Float32Array(0),
      solveTelemetryBuffer: () => new Float32Array(0),
      samplePoseJson: () => "{}",
      analyzeSpeedWindowJson: () => "{}",
      terrainProfileJson: () => "{}",
      inspectBikeGeometry: () => '{"valid":true}',
      capabilitiesJson: () => "{}"
    };
    const [event] = createWorkerRuntime(wasm, createPhysicsController()).handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "inspect-bike-geometry",
      requestId: "11111111-1111-4111-8111-111111111111",
      bike: currentScenario.bike
    });

    expect(event).toMatchObject({
      type: "error",
      runId: null,
      code: "invalid-bike-json",
      recoverable: true
    });
    expect(() => workerEventSchema.parse(event)).not.toThrow();
  });

  it("keeps fixture Designer operations honest when canonical core output is unavailable", () => {
    const [event] = createFixtureWorkerRuntime(runResultSchema.parse(runResultJson)).handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "inspect-bike-geometry",
      requestId: "11111111-1111-4111-8111-111111111111",
      bike: currentScenario.bike
    });

    expect(event).toMatchObject({
      type: "error",
      runId: null,
      code: "core-unavailable",
      recoverable: false
    });
    expect(() => workerEventSchema.parse(event)).not.toThrow();

    for (const type of ["resolve-pose-edit", "validate-design"] as const) {
      const command =
        type === "resolve-pose-edit"
          ? {
              protocolVersion: PROTOCOL_VERSION,
              type,
              requestId: "22222222-2222-4222-8222-222222222222",
              scenario: currentScenario,
              keyIndex: 0,
              baselineTargets: currentScenario.poseClip.keys[0].targets,
              requestedTargets: currentScenario.poseClip.keys[0].targets
            }
          : {
              protocolVersion: PROTOCOL_VERSION,
              type,
              requestId: "22222222-2222-4222-8222-222222222222",
              scenario: currentScenario
            };
      expect(
        createFixtureWorkerRuntime(runResultSchema.parse(runResultJson)).handleCommand(command)
      ).toEqual([
        expect.objectContaining({ type: "error", code: "core-unavailable", recoverable: false })
      ]);
    }
  });

  it("advertises protocol v3 and the append-only frame layout v2 descriptor", () => {
    const wasm: WasmExports = {
      solveScenarioJson: () =>
        JSON.stringify({
          runId: "33333333-3333-4333-8333-333333333333",
          scenarioHash: "a".repeat(64),
          solverVersion: "v2",
          outputHz: 120,
          phases: [],
          metrics: {},
          resultHash: "b".repeat(64)
        }),
      solveFrameBuffer: () => new Float32Array(36),
      solveTelemetryBuffer: () => new Float32Array(0),
      samplePoseJson: () => "{}",
      analyzeSpeedWindowJson: () => "{}",
      terrainProfileJson: () => "{}",
      inspectBikeGeometry: () => JSON.stringify(geometryInspection),
      capabilitiesJson: () => "{}"
    };
    const runtime = createWorkerRuntime(wasm, createPhysicsController());
    const events = runtime.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "solve",
      requestId: "11111111-1111-4111-8111-111111111111",
      runId: "33333333-3333-4333-8333-333333333333",
      scenario
    });
    const result = events.find((event) => event.type === "result");

    expect(PROTOCOL_VERSION).toBe(3);
    expect(result?.protocolVersion).toBe(3);
    expect(result?.type).toBe("result");
    if (!result || result.type !== "result") {
      throw new Error("worker did not return a result");
    }

    expect(result.manifest.frameLayout).toEqual({
      version: 2,
      strideFloat32: 36,
      fields: expect.arrayContaining([
        { name: "t", offset: 0, length: 1 },
        { name: "headY", offset: 30, length: 1 },
        { name: "groundedRear", offset: 31, length: 1 },
        { name: "groundedFront", offset: 32, length: 1 },
        { name: "normalForceRear", offset: 33, length: 1 },
        { name: "normalForceFront", offset: 34, length: 1 },
        { name: "minClearance", offset: 35, length: 1 }
      ])
    });
  });

  it("returns a validated segmented terrain profile", () => {
    const profile = {
      segments: [
        {
          id: "approach-takeoff",
          kind: "approach-takeoff" as const,
          points: [
            [-10, 0],
            [1, 1]
          ] as [number, number][]
        },
        {
          id: "landing-rollout",
          kind: "landing-rollout" as const,
          points: [
            [5, 1],
            [12, 0]
          ] as [number, number][]
        }
      ],
      approachStartX: -10,
      lipX: 1,
      landingStartX: 5,
      sampleStep: 0.1
    };
    const wasm: WasmExports = {
      solveScenarioJson: () => "{}",
      solveFrameBuffer: () => new Float32Array(0),
      solveTelemetryBuffer: () => new Float32Array(0),
      samplePoseJson: () => "{}",
      analyzeSpeedWindowJson: () => "{}",
      terrainProfileJson: () => JSON.stringify(profile),
      inspectBikeGeometry: () => JSON.stringify(geometryInspection),
      capabilitiesJson: () => "{}"
    };
    const runtime = createWorkerRuntime(wasm, createPhysicsController());

    expect(
      runtime.handleCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "terrain",
        requestId: "11111111-1111-4111-8111-111111111111",
        scenario,
        step: 0.1
      })
    ).toEqual([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "terrain",
        requestId: "11111111-1111-4111-8111-111111111111",
        profile
      }
    ]);
  });

  it("validates ready capabilities with supported input and output arrays", () => {
    expect(() =>
      readyEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "ready",
        requestId: "11111111-1111-4111-8111-111111111111",
        solverVersion: "v1",
        modelVersion: "model-v1",
        capabilities: {
          protocolVersion: PROTOCOL_VERSION,
          solverVersion: "v1",
          modelVersion: "model-v1",
          deterministic: true,
          supportedScenarioPaths: ["scenario.entry.speed", "scenario.jump.gap"],
          supportedOutputs: ["contactImpulse", "jointTorque"],
          ccd: true,
          contactImpulse: true,
          motorWork: true,
          jointTorque: true
        }
      })
    ).not.toThrow();

    expect(() =>
      readyEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "ready",
        requestId: "11111111-1111-4111-8111-111111111111",
        solverVersion: "v1",
        modelVersion: "model-v1",
        capabilities: {
          protocolVersion: PROTOCOL_VERSION,
          solverVersion: "v1",
          modelVersion: "model-v1",
          deterministic: true,
          supportedScenarioPaths: ["scenario.entry.speed", "scenario.entry.speed"],
          supportedOutputs: ["contactImpulse"],
          ccd: true,
          contactImpulse: true,
          motorWork: true,
          jointTorque: true
        }
      })
    ).toThrow();
  });

  it("requires monotonic progress and validates malformed buffers", () => {
    const valid = progressEventSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "progress",
      requestId: "11111111-1111-4111-8111-111111111111",
      runId: "22222222-2222-4222-8222-222222222222",
      completedSteps: 5,
      totalSteps: 10,
      fraction: 0.5
    });

    expect(valid.fraction).toBe(0.5);

    expect(() =>
      progressEventSchema.parse({
        ...valid,
        completedSteps: 11,
        fraction: 1.1
      })
    ).toThrow();

    const result = resultEventSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "result",
      requestId: "11111111-1111-4111-8111-111111111111",
      runId: "22222222-2222-4222-8222-222222222222",
      source: "solver",
      manifest: {
        runId: "22222222-2222-4222-8222-222222222222",
        scenarioHash: "a".repeat(64),
        solverVersion: "v1",
        frameLayout: {
          version: FRAME_LAYOUT_VERSION,
          strideFloat32: FRAME_STRIDE_FLOAT32,
          fields: FRAME_LAYOUT_FIELDS.map((field) => ({ ...field }))
        },
        frameCount: 1,
        outputHz: 60,
        phases: [{ name: "approach", startFrame: 0, endFrame: 0 }],
        metrics: {},
        telemetry: { layoutVersion: 1, sampleCount: 0, channels: [] },
        resultHash: "b".repeat(64)
      },
      frameBuffer: new ArrayBuffer(FRAME_STRIDE_FLOAT32 * Float32Array.BYTES_PER_ELEMENT),
      telemetryBuffer: new ArrayBuffer(0)
    });

    expect(() => workerEventSchema.parse({ ...result, frameBuffer: "bad" })).toThrow();
    expect(() =>
      workerEventSchema.parse({ ...result, source: "representative-fixture" })
    ).not.toThrow();
  });

  it("keeps stale results from overwriting active runs and supports cancellation", () => {
    const controller = createPhysicsController();
    const solve = solveCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "solve",
      requestId: "11111111-1111-4111-8111-111111111111",
      runId: "33333333-3333-4333-8333-333333333333",
      scenario
    });

    controller.beginRun(solve.runId);
    controller.beginRun("44444444-4444-4444-8444-444444444444");

    const accepted = controller.acceptResultForRun(solve.runId);
    expect(accepted).toBe(false);

    const cancel = cancelCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "cancel",
      requestId: "11111111-1111-4111-8111-111111111111",
      runId: "44444444-4444-4444-8444-444444444444"
    });

    controller.cancelRun(cancel.runId);
    expect(controller.state.lifecycle).toBe("cancelling");
  });
});
