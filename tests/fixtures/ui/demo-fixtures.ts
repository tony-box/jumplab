import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  runResultSchema,
  scenarioSchema,
  type RunResult,
  type Scenario
} from "../../../packages/schema/src/index";

export type DemoFixtureBuilder = {
  createScenario: (overrides?: Partial<Scenario>) => Scenario;
  createRunResult: (overrides?: Partial<RunResult>) => RunResult;
  createFrameBuffer: (frameCount: number, stride?: number) => ArrayBuffer;
};

const baseScenario: Scenario = scenarioSchema.parse({
  schemaVersion: 3,
  id: "2fbb1b9d-c304-48ef-b42d-f7c3418a8f30",
  name: "Demo Scenario",
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
      knee: { min: -0.1, max: 1.5, tauMax: 600 },
      hip: { min: -1.2, max: 1, tauMax: 700 },
      spine: { min: -0.5, max: 1.1, tauMax: 500 },
      shoulder: { min: -2.8, max: 1.4, tauMax: 350 },
      elbow: { min: -0.1, max: 2.6, tauMax: 300 }
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
    rearShock: { travel: 0.14, sag: 0.03, springRate: 22000, damping: 1200 },
    geometry: {
      modelVersion: 1,
      reach: 0.47,
      stack: 0.63,
      headTubeLength: 0.11,
      headTubeAngle: 1.1344640137963142,
      forkLength: 0.5706583371144672,
      forkOffset: 0.05,
      seatTubeLength: 0.322,
      seatTubeAngle: 1.3264502315156903,
      saddleHeight: 0.46,
      saddleSetback: 0,
      crankLength: 0.17,
      handlebarOffsetX: 0.05,
      handlebarOffsetY: 0.03
    }
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
        targets: { knee: 0.3, hip: -0.5, spine: 0.75 }
      },
      {
        s: 0,
        label: "Lip",
        targets: { knee: 0.35, hip: -0.6, spine: 0.85 }
      }
    ]
  },
  solver: {
    dt: 0.0010416666666666667,
    substeps: 4,
    ccd: true,
    seed: 0,
    outputHz: 240,
    solverVersion: "rapier-0.35.2-two-wheel-contact-v4"
  }
});

const baseRunResult: RunResult = runResultSchema.parse({
  runId: "0ea94457-4557-43e5-a1f2-0a0658b8f13a",
  scenarioHash: "a".repeat(64),
  solverVersion: "rapier-0.35.2-two-wheel-contact-v4",
  frameLayout: {
    version: FRAME_LAYOUT_VERSION,
    strideFloat32: FRAME_STRIDE_FLOAT32,
    fields: FRAME_LAYOUT_FIELDS
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
    reasons: ["the bike never left the ground"]
  },
  telemetry: { layoutVersion: 2, strideFloat32: 4, sampleCount: 1, channels: [] },
  resultHash: "b".repeat(64)
});

export const createDemoFixtures = (): DemoFixtureBuilder => ({
  createScenario(overrides = {}) {
    return scenarioSchema.parse({ ...structuredClone(baseScenario), ...overrides });
  },
  createRunResult(overrides = {}) {
    return runResultSchema.parse({ ...structuredClone(baseRunResult), ...overrides });
  },
  createFrameBuffer(frameCount, stride = FRAME_STRIDE_FLOAT32) {
    const data = new Float32Array(frameCount * stride);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = index;
    }
    return data.buffer;
  }
});
