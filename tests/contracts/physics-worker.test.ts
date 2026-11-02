import { describe, expect, it, vi } from "vitest";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import {
  PROTOCOL_VERSION,
  bikeGeometryInspectedEventSchema,
  designValidatedEventSchema,
  inspectBikeGeometryCommandSchema,
  progressEventSchema,
  resolvePoseEditCommandSchema,
  poseEditResolvedEventSchema,
  readyEventSchema,
  resultEventSchema,
  validateDesignCommandSchema,
  workerCommandSchema,
  workerEventSchema,
  type WorkerCommand,
  type WorkerErrorCode,
  type WorkerEvent
} from "../../packages/schema/src/worker-protocol";
import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  TELEMETRY_CHANNELS,
  TELEMETRY_LAYOUT_VERSION,
  runResultSchema
} from "../../packages/schema/src/run-result";
import {
  MODEL_VERSION,
  SCENARIO_SCHEMA_VERSION,
  SOLVER_VERSION
} from "../../packages/schema/src/versions";
import { hashScenario } from "../../packages/schema/src/canonical";
import { createFixtureWorkerRuntime } from "../../apps/web/src/solver/fixture.worker";
import {
  checkCoreVersions,
  coreErrorMessage,
  createWorkerRuntime,
  type WasmExports,
  type WasmSolveResult
} from "../../apps/web/src/solver/physics.worker";
import {
  SolverGatewayError,
  createSolverGateway,
  type SolverTransport
} from "../../apps/web/src/solver/gateway";
import scenarioJson from "../fixtures/scenarios/standard-v1.json";
import { scenarioSchema } from "../../packages/schema/src/scenario";
import runResultJson from "../fixtures/run-results/standard-v2.json";

const currentScenario = scenarioSchema.parse(scenarioJson);
const fixtureResult = runResultSchema.parse(runResultJson);

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_RUN_ID = "44444444-4444-4444-8444-444444444444";

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
    distributionVersion: 2 as const
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

const coreVersions = (overrides: Record<string, unknown> = {}) => ({
  protocolVersion: PROTOCOL_VERSION,
  schemaVersion: SCENARIO_SCHEMA_VERSION,
  frameLayoutVersion: FRAME_LAYOUT_VERSION,
  telemetryLayoutVersion: TELEMETRY_LAYOUT_VERSION,
  modelVersion: MODEL_VERSION,
  solverVersion: SOLVER_VERSION,
  frameFields: FRAME_LAYOUT_FIELDS.map((field) => field.name),
  telemetryChannels: TELEMETRY_CHANNELS.map(({ name, unit }) => ({ name, unit })),
  ...overrides
});

const coreCapabilities = {
  deterministic: true,
  supportedScenarioPaths: ["scenario.entry.speed", "scenario.rider.coupling"],
  supportedOutputs: ["contactImpulse", "landingOutcome"],
  ccd: true,
  contactImpulse: true,
  riderCoupling: true,
  riderInstinct: true,
  suspension: false
};

/** The camelCase manifest the core's `solve` export returns, mirroring the fixture run. */
const coreManifest = (overrides: Record<string, unknown> = {}) => ({
  runId: RUN_ID,
  scenarioHash: fixtureResult.scenarioHash,
  solverVersion: fixtureResult.solverVersion,
  modelVersion: MODEL_VERSION,
  frameLayoutVersion: FRAME_LAYOUT_VERSION,
  outputHz: fixtureResult.outputHz,
  strideFloat32: FRAME_STRIDE_FLOAT32,
  frameCount: fixtureResult.frameCount,
  telemetryStrideFloat32: TELEMETRY_CHANNELS.length,
  phases: fixtureResult.phases,
  metrics: fixtureResult.metrics,
  landing: fixtureResult.landing,
  summary: { landing: "clean" },
  resultHash: fixtureResult.resultHash,
  ...overrides
});

const ramp = (length: number): Float32Array => Float32Array.from({ length }, (_, index) => index);

const solveResult = (
  options: { manifest?: Record<string, unknown>; frames?: number; telemetry?: number } = {}
): WasmSolveResult & { free: ReturnType<typeof vi.fn> } => {
  const manifest = options.manifest ?? coreManifest();
  const frameCount = manifest.frameCount as number;
  return {
    manifest: JSON.stringify(manifest),
    frames: ramp(options.frames ?? frameCount * FRAME_STRIDE_FLOAT32),
    telemetry: ramp(options.telemetry ?? frameCount * TELEMETRY_CHANNELS.length),
    free: vi.fn()
  };
};

const wasmExports = (overrides: Partial<WasmExports> = {}): WasmExports => ({
  solve: () => solveResult(),
  versionsJson: () => JSON.stringify(coreVersions()),
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
  capabilitiesJson: () => JSON.stringify(coreCapabilities),
  ...overrides
});

const initCommand: WorkerCommand = {
  protocolVersion: PROTOCOL_VERSION,
  type: "init",
  requestId: REQUEST_ID,
  appVersion: "0.2.0",
  expectedSolverVersion: SOLVER_VERSION
};

const solveCommand = (scenario: unknown = currentScenario): WorkerCommand =>
  ({
    protocolVersion: PROTOCOL_VERSION,
    type: "solve",
    requestId: REQUEST_ID,
    runId: RUN_ID,
    scenario
  }) as WorkerCommand;

const commandFor = (type: WorkerCommand["type"]): WorkerCommand => {
  switch (type) {
    case "solve":
      return solveCommand();
    case "inspect-bike-geometry":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        requestId: REQUEST_ID,
        bike: currentScenario.bike
      };
    case "resolve-pose-edit":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        requestId: REQUEST_ID,
        scenario: currentScenario,
        keyIndex: 0,
        baselineTargets: currentScenario.poseClip.keys[0].targets,
        requestedTargets: currentScenario.poseClip.keys[1].targets
      };
    case "validate-design":
      return {
        protocolVersion: PROTOCOL_VERSION,
        type,
        requestId: REQUEST_ID,
        scenario: currentScenario
      };
    default:
      throw new Error(`no test command for ${type}`);
  }
};

const throwing = (error: unknown) => () => {
  throw error;
};

const singleEvent = (events: WorkerEvent[]): WorkerEvent => {
  expect(events).toHaveLength(1);
  return workerEventSchema.parse(events[0]);
};

describe("physics worker contract", () => {
  it("strictly validates additive Designer commands and responses", () => {
    const inspect = inspectBikeGeometryCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "inspect-bike-geometry",
      requestId: REQUEST_ID,
      bike: currentScenario.bike
    });
    const resolvePoseEdit = resolvePoseEditCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "resolve-pose-edit",
      requestId: REQUEST_ID,
      scenario: currentScenario,
      keyIndex: 0,
      baselineTargets: currentScenario.poseClip.keys[0].targets,
      requestedTargets: currentScenario.poseClip.keys[1].targets
    });
    const validate = validateDesignCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "validate-design",
      requestId: REQUEST_ID,
      scenario: currentScenario
    });

    expect(workerCommandSchema.parse(inspect)).toEqual(inspect);
    expect(workerCommandSchema.parse(resolvePoseEdit)).toEqual(resolvePoseEdit);
    expect(workerCommandSchema.parse(validate)).toEqual(validate);
    expect(() =>
      inspectBikeGeometryCommandSchema.parse({ ...inspect, unexpected: true })
    ).toThrow();
    expect(() => workerCommandSchema.parse({ ...inspect, protocolVersion: 3 })).toThrow();

    expect(
      bikeGeometryInspectedEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "bike-geometry-inspected",
        requestId: REQUEST_ID,
        inspection: geometryInspection
      }).inspection
    ).toEqual(geometryInspection);
    expect(() =>
      bikeGeometryInspectedEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "bike-geometry-inspected",
        requestId: REQUEST_ID,
        inspection: {
          ...geometryInspection,
          massProperties: { ...geometryInspection.massProperties, distributionVersion: 1 }
        }
      })
    ).toThrow();
    expect(() =>
      bikeGeometryInspectedEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "bike-geometry-inspected",
        requestId: REQUEST_ID,
        inspection: geometryInspection,
        unexpected: true
      })
    ).toThrow();

    expect(poseEditResolvedEventSchema.shape.resolution).toBeDefined();
    expect(designValidatedEventSchema.shape.validation).toBeDefined();
  });

  it("returns exactly one correlated event per Designer command", () => {
    const runtime = createWorkerRuntime(wasmExports());

    const stale = runtime.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "inspect-bike-geometry",
      requestId: REQUEST_ID,
      bike: currentScenario.bike
    });
    const latest = runtime.handleCommand({
      protocolVersion: PROTOCOL_VERSION,
      type: "inspect-bike-geometry",
      requestId: OTHER_REQUEST_ID,
      bike: currentScenario.bike
    });

    expect(stale).toEqual([
      expect.objectContaining({ type: "bike-geometry-inspected", requestId: REQUEST_ID })
    ]);
    expect(latest).toEqual([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "bike-geometry-inspected",
        requestId: OTHER_REQUEST_ID,
        inspection: geometryInspection
      }
    ]);

    expect(
      runtime.handleCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "resolve-pose-edit",
        requestId: REQUEST_ID,
        scenario: currentScenario,
        keyIndex: 0,
        baselineTargets: currentScenario.poseClip.keys[0].targets,
        requestedTargets: currentScenario.poseClip.keys[0].targets
      })
    ).toEqual([
      expect.objectContaining({
        type: "pose-edit-resolved",
        requestId: REQUEST_ID,
        resolution: expect.objectContaining({ requestedValid: true })
      })
    ]);
    expect(
      runtime.handleCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "validate-design",
        requestId: OTHER_REQUEST_ID,
        scenario: currentScenario
      })
    ).toEqual([
      expect.objectContaining({
        type: "design-validated",
        requestId: OTHER_REQUEST_ID,
        validation: designValidation
      })
    ]);
    expect(
      runtime.handleCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "sample-pose",
        requestId: REQUEST_ID,
        poseClip: currentScenario.poseClip,
        s: 0,
        rider: currentScenario.rider,
        bike: currentScenario.bike
      })
    ).toEqual([expect.objectContaining({ type: "pose-sample", sample: poseSample })]);
    expect(
      runtime.handleCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "cancel",
        requestId: REQUEST_ID,
        runId: RUN_ID
      })
    ).toEqual([
      { protocolVersion: PROTOCOL_VERSION, type: "cancelled", requestId: REQUEST_ID, runId: RUN_ID }
    ]);
    expect(
      runtime.handleCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "dispose",
        requestId: REQUEST_ID
      })
    ).toEqual([{ protocolVersion: PROTOCOL_VERSION, type: "disposed", requestId: REQUEST_ID }]);
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
      wasmExports({ validateDesignJson: () => JSON.stringify(validation64) })
    );
    const event = singleEvent(runtime.handleCommand(commandFor("validate-design")));

    expect(event.type).toBe("design-validated");
    if (event.type === "design-validated") {
      expect(event.validation.poseKeys).toHaveLength(64);
      expect(event.validation.poseKeys.map((key) => key.keyIndex)).toEqual(
        Array.from({ length: 64 }, (_, index) => index)
      );
    }
  });

  describe("init", () => {
    it("reports ready with the core's versions and two-body capabilities", () => {
      const event = singleEvent(createWorkerRuntime(wasmExports()).handleCommand(initCommand));

      expect(event).toMatchObject({
        protocolVersion: PROTOCOL_VERSION,
        type: "ready",
        requestId: REQUEST_ID,
        solverVersion: SOLVER_VERSION,
        modelVersion: MODEL_VERSION
      });
      if (event.type !== "ready") throw new Error("expected ready");
      expect(event.capabilities).toEqual({
        protocolVersion: PROTOCOL_VERSION,
        solverVersion: SOLVER_VERSION,
        modelVersion: MODEL_VERSION,
        ...coreCapabilities
      });
    });

    it("returns protocol-mismatch when the core speaks another protocol", () => {
      const capabilitiesJson = vi.fn(() => JSON.stringify(coreCapabilities));
      const event = singleEvent(
        createWorkerRuntime(
          wasmExports({
            versionsJson: () => JSON.stringify(coreVersions({ protocolVersion: 3 })),
            capabilitiesJson
          })
        ).handleCommand(initCommand)
      );

      expect(event).toMatchObject({
        type: "error",
        requestId: REQUEST_ID,
        runId: null,
        code: "protocol-mismatch",
        recoverable: false,
        details: { operation: "init" }
      });
      if (event.type === "error") expect(event.message).toMatch(/core protocol 3/);
      expect(capabilitiesJson).not.toHaveBeenCalled();
    });

    it("returns solver-version-mismatch when the core was built from another solver", () => {
      const event = singleEvent(
        createWorkerRuntime(
          wasmExports({
            versionsJson: () => JSON.stringify(coreVersions({ solverVersion: "rapier-old" }))
          })
        ).handleCommand(initCommand)
      );

      expect(event).toMatchObject({
        type: "error",
        code: "solver-version-mismatch",
        recoverable: false
      });
      if (event.type === "error") expect(event.message).toMatch(/core solver rapier-old/);
    });

    it("refuses a core whose frame or telemetry layout differs", () => {
      const swappedFields = FRAME_LAYOUT_FIELDS.map((field) => field.name);
      [swappedFields[1], swappedFields[2]] = [swappedFields[2]!, swappedFields[1]!];

      for (const [versions, message] of [
        [{ frameFields: swappedFields }, /frame layout/],
        [{ frameFields: swappedFields.slice(0, 36) }, /frame layout/],
        [{ frameLayoutVersion: 2 }, /frame layout/],
        [{ telemetryLayoutVersion: 1 }, /telemetry layout/],
        [
          {
            telemetryChannels: [
              { name: "contactImpulse", unit: "N*s" },
              { name: "motorWork", unit: "J" }
            ]
          },
          /telemetry layout/
        ]
      ] as const) {
        const event = singleEvent(
          createWorkerRuntime(
            wasmExports({ versionsJson: () => JSON.stringify(coreVersions(versions)) })
          ).handleCommand(initCommand)
        );
        expect(event).toMatchObject({ type: "error", recoverable: false });
        if (event.type === "error") {
          expect(["protocol-mismatch", "solver-version-mismatch"]).toContain(event.code);
          expect(event.message).toMatch(message);
        }
      }
    });

    it("exposes the version check used at startup", () => {
      expect(checkCoreVersions(coreVersions())).toBeNull();
      expect(checkCoreVersions(coreVersions({ protocolVersion: 3 }))).toMatch(/protocol/);
      expect(checkCoreVersions(coreVersions({ solverVersion: "other" }))).toMatch(/solver/);
      expect(checkCoreVersions(coreVersions({ frameLayoutVersion: 2 }))).toMatch(/frame layout/);
      expect(
        checkCoreVersions(coreVersions({ telemetryChannels: [{ name: "speed", unit: "m/s" }] }))
      ).toMatch(/telemetry layout/);
    });
  });

  describe("solve", () => {
    it("builds a layout 3 RunResult with interleaved telemetry and a landing outcome", () => {
      const result = solveResult();
      const solve = vi.fn((_scenarioJson: string, _runId: string) => result);
      const event = singleEvent(
        createWorkerRuntime(wasmExports({ solve })).handleCommand(solveCommand())
      );

      expect(solve).toHaveBeenCalledTimes(1);
      expect(JSON.parse(solve.mock.calls[0]![0])).toEqual(currentScenario);
      expect(solve.mock.calls[0]![1]).toBe(RUN_ID);
      expect(result.free).toHaveBeenCalledTimes(1);

      expect(event.type).toBe("result");
      if (event.type !== "result") throw new Error("worker did not return a result");
      expect(event.protocolVersion).toBe(4);
      expect(event.source).toBe("solver");
      expect(event.runId).toBe(RUN_ID);

      const manifest = runResultSchema.parse(event.manifest);
      expect(manifest).toEqual({ ...fixtureResult, runId: RUN_ID });
      expect(manifest.frameLayout).toEqual({
        version: 3,
        strideFloat32: 57,
        fields: expect.arrayContaining([
          { name: "t", offset: 0, length: 1 },
          { name: "minClearance", offset: 35, length: 1 },
          { name: "pitchRate", offset: 36, length: 1 },
          { name: "riderOffsetAngle", offset: 43, length: 1 },
          { name: "crashed", offset: 56, length: 1 }
        ])
      });
      expect(manifest.telemetry).toEqual({
        layoutVersion: 2,
        strideFloat32: 4,
        sampleCount: fixtureResult.frameCount,
        channels: [
          { name: "contactImpulse", unit: "N*s", offset: 0 },
          { name: "actuatorWork", unit: "J", offset: 1 },
          { name: "speed", unit: "m/s", offset: 2 },
          { name: "comHeight", unit: "m", offset: 3 }
        ]
      });
      expect(manifest.landing).toEqual(fixtureResult.landing);

      expect(event.frameBuffer.byteLength).toBe(
        fixtureResult.frameCount * FRAME_STRIDE_FLOAT32 * Float32Array.BYTES_PER_ELEMENT
      );
      expect(event.frameBuffer).not.toBe(result.frames.buffer);
      expect(new Float32Array(event.frameBuffer)).toEqual(result.frames);
      expect(event.telemetryBuffer.byteLength).toBe(
        fixtureResult.frameCount * TELEMETRY_CHANNELS.length * Float32Array.BYTES_PER_ELEMENT
      );
      expect(new Float32Array(event.telemetryBuffer)).toEqual(result.telemetry);
    });

    it.each([
      [
        "a short frame buffer",
        { frames: fixtureResult.frameCount * FRAME_STRIDE_FLOAT32 - 1 },
        /frame buffer length/
      ],
      [
        "an extra frame",
        { frames: (fixtureResult.frameCount + 1) * FRAME_STRIDE_FLOAT32 },
        /frame buffer length/
      ],
      [
        "a short telemetry buffer",
        { telemetry: fixtureResult.frameCount * 4 - 4 },
        /telemetry buffer length/
      ],
      [
        "a different core stride",
        { manifest: coreManifest({ strideFloat32: 36 }), frames: fixtureResult.frameCount * 36 },
        /core stride 36/
      ]
    ] as const)("rejects %s with buffer-layout-error", (_label, options, message) => {
      const result = solveResult(options);
      const event = singleEvent(
        createWorkerRuntime(wasmExports({ solve: () => result })).handleCommand(solveCommand())
      );

      expect(event).toMatchObject({
        type: "error",
        requestId: REQUEST_ID,
        runId: RUN_ID,
        code: "buffer-layout-error",
        recoverable: false,
        details: { operation: "solve" }
      });
      if (event.type === "error") expect(event.message).toMatch(message);
      expect(result.free).toHaveBeenCalledTimes(1);
    });

    it("rejects a core manifest missing its landing outcome", () => {
      const { landing: _landing, ...withoutLanding } = coreManifest();
      const result = solveResult({ manifest: withoutLanding });
      const event = singleEvent(
        createWorkerRuntime(wasmExports({ solve: () => result })).handleCommand(solveCommand())
      );

      expect(event).toMatchObject({ type: "error", runId: RUN_ID, code: "internal-error" });
      expect(result.free).toHaveBeenCalledTimes(1);
    });
  });

  describe("core errors", () => {
    it.each([
      ["solve", "invalid scenario json: missing field `schemaVersion`", "invalid-scenario"],
      ["solve", "invalid scenario: jump.gap must be between 0 and 20, got 25", "invalid-scenario"],
      ["solve", "unsupported schemaVersion", "unsupported-schema"],
      ["solve", "design-invalid", "design-invalid"],
      ["solve", "rapier panicked", "internal-error"],
      [
        "inspect-bike-geometry",
        "invalid bike json: missing field `frameType`",
        "invalid-bike-json"
      ],
      ["resolve-pose-edit", "invalid-baseline", "invalid-baseline"],
      ["resolve-pose-edit", "unsupported-schema", "unsupported-schema"],
      ["validate-design", "invalid scenario json: expected value", "invalid-scenario"]
    ] as const)("maps a string thrown by %s (%s) to %s", (type, thrown, code: WorkerErrorCode) => {
      const fail = throwing(thrown);
      const runtime = createWorkerRuntime(
        wasmExports({
          solve: fail,
          inspectBikeGeometry: fail,
          resolvePoseEditJson: fail,
          validateDesignJson: fail
        })
      );
      const event = singleEvent(runtime.handleCommand(commandFor(type)));

      expect(event).toEqual({
        protocolVersion: PROTOCOL_VERSION,
        type: "error",
        requestId: REQUEST_ID,
        runId: type === "solve" ? RUN_ID : null,
        code,
        message: thrown,
        details: { operation: type },
        recoverable: true
      });
    });

    it("reports a WebAssembly trap as a non-recoverable core crash", () => {
      const runtime = createWorkerRuntime(
        wasmExports({ solve: throwing(new WebAssembly.RuntimeError("unreachable executed")) })
      );
      const event = singleEvent(runtime.handleCommand(solveCommand()));

      expect(event).toMatchObject({
        type: "error",
        runId: RUN_ID,
        code: "core-crashed",
        message: "unreachable executed",
        recoverable: false
      });
    });

    it("returns a typed error when core output fails its contract", () => {
      const event = singleEvent(
        createWorkerRuntime(
          wasmExports({ inspectBikeGeometry: () => '{"valid":true}' })
        ).handleCommand(commandFor("inspect-bike-geometry"))
      );

      expect(event).toMatchObject({
        type: "error",
        runId: null,
        code: "internal-error",
        recoverable: true,
        details: { operation: "inspect-bike-geometry" }
      });
    });

    it("reads messages from both Error objects and wasm-bindgen strings", () => {
      expect(coreErrorMessage(new Error("boom"))).toBe("boom");
      expect(coreErrorMessage("design-invalid")).toBe("design-invalid");
      expect(coreErrorMessage(42)).toBe("42");
    });
  });

  it("keeps fixture Designer operations honest when canonical core output is unavailable", () => {
    const [event] = createFixtureWorkerRuntime(fixtureResult).handleCommand(
      commandFor("inspect-bike-geometry")
    );

    expect(event).toMatchObject({
      type: "error",
      runId: null,
      code: "core-unavailable",
      recoverable: false
    });
    expect(() => workerEventSchema.parse(event)).not.toThrow();

    for (const type of ["resolve-pose-edit", "validate-design"] as const) {
      expect(createFixtureWorkerRuntime(fixtureResult).handleCommand(commandFor(type))).toEqual([
        expect.objectContaining({ type: "error", code: "core-unavailable", recoverable: false })
      ]);
    }
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
    const runtime = createWorkerRuntime(
      wasmExports({ terrainProfileJson: () => JSON.stringify(profile) })
    );

    expect(
      runtime.handleCommand({
        protocolVersion: PROTOCOL_VERSION,
        type: "terrain",
        requestId: REQUEST_ID,
        scenario: currentScenario,
        step: 0.1
      })
    ).toEqual([
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "terrain",
        requestId: REQUEST_ID,
        profile
      }
    ]);
  });

  it("validates ready capabilities with supported input and output arrays", () => {
    const ready = {
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      requestId: REQUEST_ID,
      solverVersion: "v1",
      modelVersion: "model-v1",
      capabilities: {
        protocolVersion: PROTOCOL_VERSION,
        solverVersion: "v1",
        modelVersion: "model-v1",
        ...coreCapabilities
      }
    };
    expect(() => readyEventSchema.parse(ready)).not.toThrow();
    expect(() =>
      readyEventSchema.parse({
        ...ready,
        capabilities: {
          ...ready.capabilities,
          supportedScenarioPaths: ["scenario.entry.speed", "scenario.entry.speed"]
        }
      })
    ).toThrow();
    expect(() =>
      readyEventSchema.parse({
        ...ready,
        capabilities: { ...ready.capabilities, motorWork: true, jointTorque: true }
      })
    ).toThrow();
  });

  it("validates progress envelopes and malformed result buffers", () => {
    const valid = progressEventSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "progress",
      requestId: REQUEST_ID,
      runId: OTHER_REQUEST_ID,
      completedSteps: 5,
      totalSteps: 10,
      fraction: 0.5
    });

    expect(valid.fraction).toBe(0.5);
    expect(() =>
      progressEventSchema.parse({ ...valid, completedSteps: 11, fraction: 1.1 })
    ).toThrow();

    const result = resultEventSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "result",
      requestId: REQUEST_ID,
      runId: fixtureResult.runId,
      source: "solver",
      manifest: fixtureResult,
      frameBuffer: new ArrayBuffer(
        fixtureResult.frameCount * FRAME_STRIDE_FLOAT32 * Float32Array.BYTES_PER_ELEMENT
      ),
      telemetryBuffer: new ArrayBuffer(
        fixtureResult.frameCount * TELEMETRY_CHANNELS.length * Float32Array.BYTES_PER_ELEMENT
      )
    });

    expect(() => workerEventSchema.parse({ ...result, frameBuffer: "bad" })).toThrow();
    expect(() => workerEventSchema.parse({ ...result, telemetryBuffer: null })).toThrow();
    expect(() =>
      workerEventSchema.parse({ ...result, source: "representative-fixture" })
    ).not.toThrow();
  });
});

const readyEvent = (requestId: string): WorkerEvent => ({
  protocolVersion: PROTOCOL_VERSION,
  type: "ready",
  requestId,
  solverVersion: SOLVER_VERSION,
  modelVersion: MODEL_VERSION,
  capabilities: {
    protocolVersion: PROTOCOL_VERSION,
    solverVersion: SOLVER_VERSION,
    modelVersion: MODEL_VERSION,
    ...coreCapabilities
  }
});

/** A transport whose solves stay pending until the test settles them. */
const createControlledTransport = () => {
  const solves = new Map<
    string,
    {
      command: WorkerCommand;
      resolve: (event: WorkerEvent) => void;
      reject: (error: Error) => void;
    }
  >();
  const terminate = vi.fn((reason: WorkerErrorCode) => {
    for (const [runId, pending] of solves) {
      pending.reject(new SolverGatewayError(reason, `Physics core stopped: ${reason}`, true));
      solves.delete(runId);
    }
  });
  const transport: SolverTransport = {
    request: (command) => {
      if (command.type === "init") return Promise.resolve(readyEvent(command.requestId));
      if (command.type !== "solve") return Promise.reject(new Error(`unexpected ${command.type}`));
      return new Promise((resolvePromise, reject) => {
        solves.set(command.runId, { command, resolve: resolvePromise, reject });
      });
    },
    terminate
  };
  return { transport, solves, terminate };
};

const resultFor = (command: WorkerCommand, runId: string): WorkerEvent => ({
  protocolVersion: PROTOCOL_VERSION,
  type: "result",
  requestId: command.requestId,
  runId,
  source: "solver",
  manifest: { ...fixtureResult, runId },
  frameBuffer: new ArrayBuffer(
    fixtureResult.frameCount * FRAME_STRIDE_FLOAT32 * Float32Array.BYTES_PER_ELEMENT
  ),
  telemetryBuffer: new ArrayBuffer(
    fixtureResult.frameCount * TELEMETRY_CHANNELS.length * Float32Array.BYTES_PER_ELEMENT
  )
});

describe("solver gateway", () => {
  it("cancels only the active run by stopping the core", async () => {
    const { transport, solves, terminate } = createControlledTransport();
    const gateway = createSolverGateway(transport);

    const pending = gateway.solve(RUN_ID, currentScenario);
    await vi.waitFor(() => expect(solves.has(RUN_ID)).toBe(true));

    await gateway.cancel(OTHER_RUN_ID);
    expect(terminate).not.toHaveBeenCalled();

    await gateway.cancel(RUN_ID);
    expect(terminate).toHaveBeenCalledExactlyOnceWith("cancelled");
    await expect(pending).rejects.toMatchObject({ name: "SolverGatewayError", code: "cancelled" });

    await gateway.cancel(RUN_ID);
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it("refuses a result that belongs to another run", async () => {
    const { transport, solves } = createControlledTransport();
    const gateway = createSolverGateway(transport);

    const pending = gateway.solve(RUN_ID, currentScenario);
    await vi.waitFor(() => expect(solves.has(RUN_ID)).toBe(true));
    const { command, resolve: settle } = solves.get(RUN_ID)!;
    settle(resultFor(command, OTHER_RUN_ID));

    await expect(pending).rejects.toThrow("Result belongs to another run");
  });

  it("assembles a run artifact from the active run's result", async () => {
    const { transport, solves } = createControlledTransport();
    const gateway = createSolverGateway(transport);

    const pending = gateway.solve(RUN_ID, currentScenario);
    await vi.waitFor(() => expect(solves.has(RUN_ID)).toBe(true));
    const { command, resolve: settle } = solves.get(RUN_ID)!;
    settle(resultFor(command, RUN_ID));

    const artifact = await pending;
    expect(artifact.runId).toBe(RUN_ID);
    expect(artifact.scenarioHash).toBe(await hashScenario(currentScenario));
    expect(artifact.manifest.scenarioHash).toBe(artifact.scenarioHash);
    expect(artifact.manifest.landing).toEqual(fixtureResult.landing);
    expect(artifact.model.scenarioSchemaVersion).toBe(SCENARIO_SCHEMA_VERSION);
  });

  it("surfaces typed worker errors from an in-process runtime", async () => {
    const mismatched = createSolverGateway(async () =>
      createWorkerRuntime(
        wasmExports({ versionsJson: () => JSON.stringify(coreVersions({ protocolVersion: 3 })) })
      )
    );
    await expect(mismatched.initialize("0.2.0", SOLVER_VERSION)).rejects.toMatchObject({
      code: "protocol-mismatch",
      recoverable: false
    });

    const badBuffers = createSolverGateway(async () =>
      createWorkerRuntime(wasmExports({ solve: () => solveResult({ frames: 1 }) }))
    );
    await expect(badBuffers.solve(RUN_ID, currentScenario)).rejects.toMatchObject({
      code: "buffer-layout-error"
    });

    const working = createSolverGateway(async () => createWorkerRuntime(wasmExports()));
    await expect(working.initialize("0.2.0", SOLVER_VERSION)).resolves.toMatchObject({
      riderCoupling: true,
      riderInstinct: true
    });
    const artifact = await working.solve(RUN_ID, currentScenario);
    expect(artifact.source).toBe("solver");
    expect(artifact.frameBuffer.byteLength).toBe(
      fixtureResult.frameCount * FRAME_STRIDE_FLOAT32 * Float32Array.BYTES_PER_ELEMENT
    );
  });
});

const realCorePath = resolve("crates", "physics-core", "pkg-node", "physics_core.js");

describe.skipIf(!existsSync(realCorePath))("real physics core (pkg-node)", () => {
  const loadCore = (): WasmExports => createRequire(import.meta.url)(realCorePath) as WasmExports;

  it("passes the startup version check", () => {
    const core = loadCore();
    expect(checkCoreVersions(JSON.parse(core.versionsJson()))).toBeNull();

    const event = singleEvent(createWorkerRuntime(core).handleCommand(initCommand));
    expect(event).toMatchObject({ type: "ready", solverVersion: SOLVER_VERSION });
    if (event.type === "ready") {
      expect(event.capabilities).toMatchObject({ riderCoupling: true, riderInstinct: true });
    }
  });

  it("solves the standard scenario into a valid RunResult with a landing outcome", () => {
    const runtime = createWorkerRuntime(loadCore());
    const first = singleEvent(runtime.handleCommand(solveCommand()));
    const second = singleEvent(runtime.handleCommand(solveCommand()));

    if (first.type !== "result" || second.type !== "result") {
      throw new Error(`expected a result, got ${JSON.stringify(first)}`);
    }
    const manifest = runResultSchema.parse(first.manifest);
    expect(manifest.runId).toBe(RUN_ID);
    expect(manifest.solverVersion).toBe(SOLVER_VERSION);
    expect(manifest.outputHz).toBe(currentScenario.solver.outputHz);
    expect(manifest.frameCount).toBeGreaterThan(0);
    expect(manifest.phases.length).toBeGreaterThan(0);
    expect(manifest.landing.status).toMatch(/^(landed|no-flight|stalled|airborne-at-end)$/);
    expect(manifest.landing.severity).toMatch(/^(clean|crash)$/);
    expect(manifest.telemetry.sampleCount).toBe(manifest.frameCount);

    const frames = new Float32Array(first.frameBuffer);
    expect(frames.length).toBe(manifest.frameCount * FRAME_STRIDE_FLOAT32);
    expect(frames.every(Number.isFinite)).toBe(true);
    expect(frames[FRAME_STRIDE_FLOAT32]! - frames[0]!).toBeCloseTo(1 / manifest.outputHz, 6);
    expect(first.telemetryBuffer.byteLength).toBe(
      manifest.frameCount * TELEMETRY_CHANNELS.length * Float32Array.BYTES_PER_ELEMENT
    );

    expect(second.manifest.resultHash).toBe(manifest.resultHash);
    expect(new Float32Array(second.frameBuffer)).toEqual(frames);
  }, 60_000);

  it("maps real core rejections to typed errors", () => {
    const runtime = createWorkerRuntime(loadCore());

    expect(
      singleEvent(runtime.handleCommand(solveCommand({ ...currentScenario, schemaVersion: 3 })))
    ).toMatchObject({ type: "error", code: "unsupported-schema", runId: RUN_ID });
    expect(
      singleEvent(
        runtime.handleCommand(
          solveCommand({ ...currentScenario, jump: { ...currentScenario.jump, gap: 25 } })
        )
      )
    ).toMatchObject({ type: "error", code: "invalid-scenario", runId: RUN_ID });
    expect(
      singleEvent(
        runtime.handleCommand({
          protocolVersion: PROTOCOL_VERSION,
          type: "inspect-bike-geometry",
          requestId: REQUEST_ID,
          bike: {} as never
        })
      )
    ).toMatchObject({ type: "error", code: "invalid-bike-json", runId: null });
  });

  it("runs end to end through the in-process gateway", async () => {
    const core = loadCore();
    const gateway = createSolverGateway(async () => createWorkerRuntime(core));
    const artifact = await gateway.solve(RUN_ID, currentScenario);

    expect(artifact.runId).toBe(RUN_ID);
    expect(artifact.scenarioHash).toBe(await hashScenario(currentScenario));
    expect(artifact.manifest.landing.reasons).toBeInstanceOf(Array);
  }, 60_000);
});
