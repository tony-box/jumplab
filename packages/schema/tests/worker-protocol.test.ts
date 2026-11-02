import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  TELEMETRY_CHANNELS,
  TELEMETRY_LAYOUT_VERSION,
  scenarioSchema,
  workerCommandSchema,
  workerErrorCodeSchema,
  workerEventSchema,
  type WorkerCommand,
  type WorkerEvent
} from "../src/index";
import standardScenario from "../../../tests/fixtures/scenarios/standard-v1.json";

const capabilities = {
  protocolVersion: PROTOCOL_VERSION,
  solverVersion: "x",
  modelVersion: "x",
  deterministic: true,
  supportedScenarioPaths: ["scenario.entry.speed"],
  supportedOutputs: ["contactImpulse"],
  ccd: true,
  contactImpulse: true,
  riderCoupling: true,
  riderInstinct: true,
  suspension: false
};

const solveCommand: WorkerCommand = {
  protocolVersion: PROTOCOL_VERSION,
  type: "solve",
  requestId: "3f3768bc-1976-4c88-ab7f-3002fa9a033a",
  runId: "0ea94457-4557-43e5-a1f2-0a0658b8f13a",
  scenario: scenarioSchema.parse(standardScenario)
};

describe("worker protocol", () => {
  it("accepts segmented terrain commands and responses", () => {
    const terrainCommand = workerCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "terrain",
      requestId: solveCommand.requestId,
      scenario: solveCommand.scenario,
      step: 0.1
    });
    expect(terrainCommand.type).toBe("terrain");

    const terrainEvent = {
      protocolVersion: PROTOCOL_VERSION,
      type: "terrain",
      requestId: solveCommand.requestId,
      profile: {
        segments: [
          {
            id: "approach-takeoff",
            kind: "approach-takeoff",
            points: [
              [-12, 0],
              [1, 1]
            ]
          }
        ],
        approachStartX: -12,
        lipX: 1,
        landingStartX: 6,
        sampleStep: 0.1
      }
    };

    expect(() => workerEventSchema.parse(terrainEvent)).not.toThrow();
    expect(() =>
      workerEventSchema.parse({
        ...terrainEvent,
        profile: {
          ...terrainEvent.profile,
          segments: [{ ...terrainEvent.profile.segments[0], points: [[-12, 0]] }]
        }
      })
    ).toThrow();
  });

  it("accepts solve commands and result events", () => {
    expect(() => workerCommandSchema.parse(solveCommand)).not.toThrow();

    const resultEvent: WorkerEvent = {
      protocolVersion: PROTOCOL_VERSION,
      type: "result",
      requestId: solveCommand.requestId,
      runId: solveCommand.runId,
      source: "solver",
      manifest: {
        runId: solveCommand.runId,
        scenarioHash: "a".repeat(64),
        solverVersion: "rapier-0.35.2-enhanced-determinism",
        frameLayout: {
          version: FRAME_LAYOUT_VERSION,
          strideFloat32: FRAME_STRIDE_FLOAT32,
          fields: FRAME_LAYOUT_FIELDS.map((field) => ({ ...field }))
        },
        frameCount: 1,
        outputHz: 240,
        phases: [{ name: "approach", startFrame: 0, endFrame: 0 }],
        metrics: {
          airtime: { value: 0, unit: "s", source: "measured", reason: null }
        },
        landing: {
          status: "no-flight",
          region: null,
          attitude: null,
          firstContact: null,
          severity: "clean",
          crashTime: null,
          reasons: ["run ended before the lip"]
        },
        telemetry: {
          layoutVersion: TELEMETRY_LAYOUT_VERSION,
          strideFloat32: TELEMETRY_CHANNELS.length,
          sampleCount: 1,
          channels: TELEMETRY_CHANNELS.map((channel, offset) => ({ ...channel, offset }))
        },
        resultHash: "b".repeat(64)
      },
      frameBuffer: new ArrayBuffer(FRAME_STRIDE_FLOAT32 * Float32Array.BYTES_PER_ELEMENT),
      telemetryBuffer: new ArrayBuffer(TELEMETRY_CHANNELS.length * Float32Array.BYTES_PER_ELEMENT)
    };

    expect(() => workerEventSchema.parse(resultEvent)).not.toThrow();
    if (resultEvent.type !== "result") throw new Error("expected a result event");
    const { landing: _landing, ...manifestWithoutLanding } = resultEvent.manifest;
    expect(() =>
      workerEventSchema.parse({ ...resultEvent, manifest: manifestWithoutLanding })
    ).toThrow();
  });

  it("rejects legacy scenarios that cannot reach schema 4 in solve commands", () => {
    expect(solveCommand.type === "solve" && solveCommand.scenario.schemaVersion).toBe(4);
    expect(() =>
      workerCommandSchema.parse({
        ...solveCommand,
        scenario: { ...standardScenario, schemaVersion: 1 }
      })
    ).toThrow(/Cannot migrate scenario schemaVersion 1/);
    expect(() =>
      workerCommandSchema.parse({
        ...solveCommand,
        scenario: { ...standardScenario, solver: { ...standardScenario.solver, seed: 0 } }
      })
    ).toThrow();
  });

  it("uses kebab-case error codes only", () => {
    for (const code of workerErrorCodeSchema.options) {
      expect(code).toMatch(/^[a-z]+(?:-[a-z]+)*$/);
    }
    expect(workerErrorCodeSchema.options).toEqual(
      expect.arrayContaining([
        "protocol-mismatch",
        "solver-version-mismatch",
        "invalid-scenario",
        "unsupported-schema",
        "core-init-failed",
        "core-crashed",
        "timeout",
        "buffer-layout-error",
        "internal-error",
        "cancelled",
        "core-unavailable"
      ])
    );

    const errorEvent = {
      protocolVersion: PROTOCOL_VERSION,
      type: "error",
      requestId: solveCommand.requestId,
      runId: null,
      code: "core-crashed",
      message: "unreachable executed",
      details: { operation: "solve" },
      recoverable: false
    };
    expect(() => workerEventSchema.parse(errorEvent)).not.toThrow();
    for (const legacy of ["protocol_mismatch", "internal_error", "numerical_instability"]) {
      expect(() => workerEventSchema.parse({ ...errorEvent, code: legacy })).toThrow();
    }
  });

  it("rejects protocol version mismatches and retired capability flags", () => {
    expect(PROTOCOL_VERSION).toBe(4);
    for (const protocolVersion of [1, 2, 3]) {
      expect(() => workerCommandSchema.parse({ ...solveCommand, protocolVersion })).toThrow();
    }

    const ready = {
      protocolVersion: PROTOCOL_VERSION,
      type: "ready",
      requestId: solveCommand.requestId,
      solverVersion: "x",
      modelVersion: "x",
      capabilities
    };
    expect(() => workerEventSchema.parse(ready)).not.toThrow();
    expect(() => workerEventSchema.parse({ ...ready, protocolVersion: 3 })).toThrow();
    expect(() =>
      workerEventSchema.parse({ ...ready, capabilities: { ...capabilities, protocolVersion: 3 } })
    ).toThrow();
    const { riderCoupling: _riderCoupling, ...missingFlag } = capabilities;
    expect(() => workerEventSchema.parse({ ...ready, capabilities: missingFlag })).toThrow();
    expect(() =>
      workerEventSchema.parse({
        ...ready,
        capabilities: { ...capabilities, motorWork: true, jointTorque: true }
      })
    ).toThrow();
  });

  it("accepts a valid pose-sample event requiring achieved landmarks", () => {
    expect(() =>
      workerEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "pose-sample",
        requestId: solveCommand.requestId,
        sample: {
          s: 0,
          targets: { knee: 0.9, hip: 0.4, spine: 0.15 },
          derivedArm: { shoulder: -0.2, elbow: 1.1, constrained: false },
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
          solverVersion: "x"
        }
      })
    ).not.toThrow();
  });

  it("rejects malformed pose-sample, speed-window, and progress envelopes", () => {
    expect(() =>
      workerEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "pose-sample",
        requestId: solveCommand.requestId,
        sample: {
          s: 0,
          targets: { knee: 0, hip: 0 },
          derivedArm: { shoulder: 0, elbow: 0, constrained: true },
          solverVersion: "x"
        }
      })
    ).toThrow();

    expect(() =>
      workerEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "speed-window",
        requestId: solveCommand.requestId,
        window: {
          minimum: 9,
          maximum: 8,
          scenarioHash: "f".repeat(64),
          solverVersion: "x",
          status: "measured",
          reason: null
        }
      })
    ).toThrow();

    expect(() =>
      workerEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "progress",
        requestId: solveCommand.requestId,
        runId: solveCommand.runId,
        completedSteps: 11,
        totalSteps: 10,
        fraction: 1.2
      })
    ).toThrow();
  });

  it("accepts cancellation and rejects unknown types", () => {
    expect(() =>
      workerCommandSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "cancel",
        requestId: solveCommand.requestId,
        runId: solveCommand.runId
      })
    ).not.toThrow();

    expect(() =>
      workerEventSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "mystery",
        requestId: solveCommand.requestId
      })
    ).toThrow();
  });
});
