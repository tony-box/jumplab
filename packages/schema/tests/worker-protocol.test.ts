import { describe, expect, it } from "vitest";

import {
  PROTOCOL_VERSION,
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  workerCommandSchema,
  workerEventSchema,
  type WorkerCommand,
  type WorkerEvent
} from "../src/index";

const solveCommand: WorkerCommand = {
  protocolVersion: PROTOCOL_VERSION,
  type: "solve",
  requestId: "3f3768bc-1976-4c88-ab7f-3002fa9a033a",
  runId: "0ea94457-4557-43e5-a1f2-0a0658b8f13a",
  scenario: {
    schemaVersion: 2,
    id: "2fbb1b9d-c304-48ef-b42d-f7c3418a8f30",
    name: "Scenario",
    jump: {
      kind: "table",
      lipHeight: 1,
      lipAngle: 0.9,
      transitionLength: 1.2,
      gap: 5,
      stepDelta: 0,
      landingAngle: 0.4,
      landingLength: 8,
      rollout: 12
    },
    rider: {
      height: 1.8,
      mass: 78,
      legRatio: 0.48,
      armRatio: 0.38,
      strengthScale: 1,
      kp: 1500,
      kd: 120,
      joints: {
        knee: { min: -1.5, max: 0.1, tauMax: 600 },
        hip: { min: -1.2, max: 1, tauMax: 700 },
        spine: { min: -0.5, max: 0.5, tauMax: 500 },
        shoulder: { min: -1.2, max: 1.2, tauMax: 350 },
        elbow: { min: -1.2, max: 0.1, tauMax: 300 }
      }
    },
    bike: {
      frameType: "full",
      wheelSize: 29,
      wheelbase: 1.25,
      chainstay: 0.44,
      bbHeight: 0.33,
      mass: 14,
      fork: { travel: 0.16, sag: 0.04, springRate: 23000, damping: 1400 },
      rearShock: { travel: 0.14, sag: 0.03, springRate: 22000, damping: 1200 }
    },
    entry: { speed: 7, startX: -12 },
    poseClip: {
      id: "f0804f13-0d4e-4aa8-8f35-9b88f1a645a5",
      name: "Author pose",
      interpolation: "linear",
      keys: [
        {
          s: -5,
          label: "Approach",
          targets: { knee: 1, hip: 0.4, spine: 0.15 }
        },
        {
          s: 0,
          label: "Lip",
          targets: { knee: 0.9, hip: 0.5, spine: 0.2 }
        }
      ]
    },
    solver: {
      dt: 0.0010416666666666667,
      substeps: 4,
      ccd: true,
      seed: 0,
      outputHz: 240,
      solverVersion: "rapier-0.35.2-enhanced-determinism"
    }
  }
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
        telemetry: { layoutVersion: 1, sampleCount: 1, channels: [] },
        resultHash: "b".repeat(64)
      },
      frameBuffer: new ArrayBuffer(16),
      telemetryBuffer: new ArrayBuffer(8)
    };

    expect(() => workerEventSchema.parse(resultEvent)).not.toThrow();
  });

  it("rejects protocol version mismatches", () => {
    expect(() =>
      workerCommandSchema.parse({
        ...solveCommand,
        protocolVersion: 1
      })
    ).toThrow();

    expect(() =>
      workerEventSchema.parse({
        protocolVersion: 1,
        type: "ready",
        requestId: solveCommand.requestId,
        solverVersion: "x",
        modelVersion: "x",
        capabilities: {
          protocolVersion: PROTOCOL_VERSION,
          solverVersion: "x",
          modelVersion: "x",
          deterministic: true,
          supportedScenarioPaths: ["scenario.entry.speed"],
          supportedOutputs: ["contactImpulse"],
          ccd: true,
          contactImpulse: true,
          motorWork: true,
          jointTorque: true
        }
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
