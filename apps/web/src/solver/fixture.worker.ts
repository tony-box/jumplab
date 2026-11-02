import type {
  RunResult,
  Scenario,
  WorkerCommand,
  WorkerEvent
} from "../../../../packages/schema/src/index";
import { PROTOCOL_VERSION } from "../../../../packages/schema/src/index";

type FixtureWorkerOptions = {
  failSolve?: boolean;
};

const defaultBikeDims = { wheelbase: 1.25, chainstay: 0.44, bbHeight: 0.33 };

const createFrameBuffer = (fixture: RunResult, scenario?: Scenario): ArrayBuffer => {
  const stride = fixture.frameLayout.strideFloat32;
  const values = new Float32Array(fixture.frameCount * stride);
  const bike = scenario?.bike ?? defaultBikeDims;
  const bbX = -bike.wheelbase / 2 + bike.chainstay;
  const bbY = bike.bbHeight;
  const pedalX = bbX + 0.1;
  const pedalY = bbY;
  const handlebarX = bike.wheelbase * 0.55;
  const handlebarY = bbY + 0.75;

  for (let frameIndex = 0; frameIndex < fixture.frameCount; frameIndex += 1) {
    const offset = frameIndex * stride;
    const fraction = fixture.frameCount <= 1 ? 0 : frameIndex / (fixture.frameCount - 1);
    values[offset] = frameIndex / fixture.outputHz;
    values[offset + 1] = -10 + fraction * 24;
    values[offset + 2] = 0.35 + Math.sin(fraction * Math.PI) * 2.4;
    values[offset + 3] = Math.sin(fraction * Math.PI * 2) * 0.12;
    values[offset + 4] = 8.2;
    values[offset + 5] = Math.cos(fraction * Math.PI) * 2.1;
    values[offset + 6] = frameIndex >= 121 && frameIndex <= 259 ? 1 : 0;
    values[offset + 7] = frameIndex >= 260 ? Math.max(0, 420 - (frameIndex - 260) * 8) : 0;
    values[offset + 8] = -0.35 + fraction * 0.12;
    values[offset + 9] = 0.18 + fraction * 0.22;

    if (stride < 31) {
      continue;
    }

    const kneeTarget = 0.6 + Math.sin(fraction * Math.PI) * 0.2;
    const hipTarget = 0.4 + Math.sin(fraction * Math.PI) * 0.1;
    const spineTarget = 0.1;
    const kneeX = pedalX + Math.sin(kneeTarget) * 0.24;
    const kneeY = pedalY + Math.cos(kneeTarget) * 0.24;
    const hipX = kneeX + Math.sin(hipTarget) * 0.27;
    const hipY = kneeY + Math.cos(hipTarget) * 0.27;
    const shoulderX = hipX + Math.sin(spineTarget) * 0.5;
    const shoulderY = hipY + Math.cos(spineTarget) * 0.5;

    values[offset + 10] = kneeTarget;
    values[offset + 11] = hipTarget;
    values[offset + 12] = spineTarget;
    values[offset + 13] = pedalX;
    values[offset + 14] = pedalY;
    values[offset + 15] = pedalX;
    values[offset + 16] = pedalY;
    values[offset + 17] = kneeX;
    values[offset + 18] = kneeY;
    values[offset + 19] = hipX;
    values[offset + 20] = hipY;
    values[offset + 21] = shoulderX;
    values[offset + 22] = shoulderY;
    values[offset + 23] = shoulderX + 0.18;
    values[offset + 24] = shoulderY - 0.15;
    values[offset + 25] = handlebarX;
    values[offset + 26] = handlebarY;
    values[offset + 27] = handlebarX;
    values[offset + 28] = handlebarY;
    values[offset + 29] = shoulderX;
    values[offset + 30] = shoulderY + 0.18;
  }

  return values.buffer;
};

const createTelemetryBuffer = (fixture: RunResult): ArrayBuffer => {
  const values = new Float32Array(fixture.telemetry.sampleCount);

  for (const channel of fixture.telemetry.channels) {
    for (let index = 0; index < channel.count; index += 1) {
      const fraction = channel.count <= 1 ? 0 : index / (channel.count - 1);
      values[channel.offset + index] = fraction;
    }
  }

  return values.buffer;
};

export const createFixtureWorkerRuntime = (
  fixture: RunResult,
  options: FixtureWorkerOptions = {}
): { handleCommand: (command: WorkerCommand) => WorkerEvent[] } => ({
  handleCommand(command) {
    if (command.type === "init") {
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "ready",
          requestId: command.requestId,
          solverVersion: fixture.solverVersion,
          modelVersion: "fixture-v1",
          capabilities: {
            protocolVersion: PROTOCOL_VERSION,
            solverVersion: fixture.solverVersion,
            modelVersion: "fixture-v1",
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
            supportedOutputs: [
              "height",
              "velocity",
              "pitch",
              "contactImpulse",
              "motorWork",
              "jointTorque"
            ],
            ccd: true,
            contactImpulse: true,
            motorWork: true,
            jointTorque: false
          }
        }
      ];
    }

    if (command.type === "solve") {
      if (options.failSolve) {
        return [
          {
            protocolVersion: PROTOCOL_VERSION,
            type: "error",
            requestId: command.requestId,
            runId: command.runId,
            code: "internal_error",
            message: "Configured fixture solve failure",
            details: { fixture: true },
            recoverable: true
          }
        ];
      }

      const progress = [0, 1, 2, 3, 4].map(
        (completedSteps): WorkerEvent => ({
          protocolVersion: PROTOCOL_VERSION,
          type: "progress",
          requestId: command.requestId,
          runId: command.runId,
          completedSteps,
          totalSteps: 4,
          fraction: completedSteps / 4
        })
      );

      return [
        ...progress,
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "result",
          requestId: command.requestId,
          runId: command.runId,
          source: "representative-fixture",
          manifest: {
            ...fixture,
            runId: command.runId,
            frameLayout: {
              ...fixture.frameLayout,
              fields: fixture.frameLayout.fields.map((field) => ({ ...field }))
            },
            phases: fixture.phases.map((phase) => ({ ...phase })),
            metrics: Object.fromEntries(
              Object.entries(fixture.metrics).map(([name, metric]) => [name, { ...metric }])
            ),
            telemetry: {
              ...fixture.telemetry,
              channels: fixture.telemetry.channels.map((channel) => ({ ...channel }))
            }
          },
          frameBuffer: createFrameBuffer(fixture, command.scenario),
          telemetryBuffer: createTelemetryBuffer(fixture)
        }
      ];
    }

    if (command.type === "cancel") {
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "cancelled",
          requestId: command.requestId,
          runId: command.runId
        }
      ];
    }

    if (command.type === "sample-pose") {
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "pose-sample",
          requestId: command.requestId,
          sample: {
            s: command.s,
            targets: { knee: 1.03, hip: 0.5, spine: 0.18 },
            derivedArm: { shoulder: -0.35, elbow: 0.03, constrained: true },
            landmarks: {
              pedalContact: { x: -0.28, y: 0.33 },
              ankle: { x: -0.28, y: 0.33 },
              knee: { x: -0.15, y: 0.56 },
              hip: { x: 0.02, y: 0.82 },
              shoulder: { x: 0.07, y: 1.31 },
              elbow: { x: 0.25, y: 1.16 },
              hand: { x: 0.42, y: 1.02 },
              handlebarContact: { x: 0.42, y: 1.02 },
              head: { x: 0.08, y: 1.49 }
            },
            solverVersion: fixture.solverVersion
          }
        }
      ];
    }

    if (command.type === "analyze-speed-window") {
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "speed-window",
          requestId: command.requestId,
          window: {
            minimum: 8.47,
            maximum: 14.47,
            scenarioHash: fixture.scenarioHash,
            solverVersion: fixture.solverVersion,
            status: "measured",
            reason: null
          }
        }
      ];
    }

    if (command.type === "inspect-bike-geometry") {
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "error",
          requestId: command.requestId,
          runId: null,
          code: "core-unavailable",
          message: "Fixture worker cannot derive canonical bike geometry",
          details: { operation: command.type, source: "representative-fixture" },
          recoverable: false
        }
      ];
    }

    if (command.type === "resolve-pose-edit" || command.type === "validate-design") {
      return [
        {
          protocolVersion: PROTOCOL_VERSION,
          type: "error",
          requestId: command.requestId,
          runId: null,
          code: "core-unavailable",
          message: `Fixture worker cannot perform ${command.type} physics validation`,
          details: { operation: command.type, source: "representative-fixture" },
          recoverable: false
        }
      ];
    }

    return [
      {
        protocolVersion: PROTOCOL_VERSION,
        type: "disposed",
        requestId: command.requestId
      }
    ];
  }
});
