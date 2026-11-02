import { describe, expect, it } from "vitest";

import {
  presetSchema,
  runArtifactSchema,
  sessionReferenceSchema,
  solverCapabilityManifestSchema,
  validationCheckSchema
} from "../src/application";
import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  PROTOCOL_VERSION,
  bikeGeometrySpecSchema,
  hashScenario,
  parseScenario,
  parseScenarioFile,
  runResultSchema,
  scenarioSchema
} from "../src/index";

const migratedGeometry = {
  modelVersion: 1 as const,
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
};

const scenario = scenarioSchema.parse({
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
});

const manifest = runResultSchema.parse({
  runId: "0ea94457-4557-43e5-a1f2-0a0658b8f13a",
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
});

describe("application contracts", () => {
  it.each([
    ["reach", 0.3, 0.6],
    ["stack", 0.45, 0.8],
    ["headTubeLength", 0.06, 0.25],
    ["headTubeAngle", 0.87, 1.4],
    ["forkLength", 0.3, 0.65],
    ["forkOffset", 0, 0.1],
    ["seatTubeLength", 0.25, 0.65],
    ["seatTubeAngle", 1.05, 1.45],
    ["saddleHeight", 0.3, 0.9],
    ["saddleSetback", -0.15, 0.25],
    ["crankLength", 0.145, 0.19],
    ["handlebarOffsetX", -0.1, 0.3],
    ["handlebarOffsetY", -0.15, 0.25]
  ] as const)("enforces the BikeGeometrySpec %s range", (field, minimum, maximum) => {
    expect(() =>
      bikeGeometrySpecSchema.parse({ ...migratedGeometry, [field]: minimum })
    ).not.toThrow();
    expect(() =>
      bikeGeometrySpecSchema.parse({ ...migratedGeometry, [field]: maximum })
    ).not.toThrow();
    expect(() =>
      bikeGeometrySpecSchema.parse({ ...migratedGeometry, [field]: minimum - 0.001 })
    ).toThrow();
    expect(() =>
      bikeGeometrySpecSchema.parse({ ...migratedGeometry, [field]: maximum + 0.001 })
    ).toThrow();
  });

  it("requires geometry model 1, finite values, and strict object keys", () => {
    expect(() => bikeGeometrySpecSchema.parse(migratedGeometry)).not.toThrow();
    expect(() => bikeGeometrySpecSchema.parse({ ...migratedGeometry, modelVersion: 2 })).toThrow();
    expect(() =>
      bikeGeometrySpecSchema.parse({ ...migratedGeometry, reach: Number.NaN })
    ).toThrow();
    expect(() =>
      bikeGeometrySpecSchema.parse({ ...migratedGeometry, decorativeOnly: true })
    ).toThrow();
  });

  it("migrates v2 scenarios to v3 without changing existing values or pose targets", () => {
    const legacy = structuredClone(scenario) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 2;
    const legacyBike = structuredClone(scenario.bike) as unknown as Record<string, unknown>;
    delete legacyBike.geometry;
    legacy.bike = legacyBike;

    const migrated = parseScenario(legacy);

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.bike.geometry).toEqual(migratedGeometry);
    expect(migrated.id).toBe(legacy.id);
    expect(migrated.jump).toEqual(legacy.jump);
    expect(migrated.rider).toEqual(legacy.rider);
    expect(migrated.entry).toEqual(legacy.entry);
    expect(migrated.poseClip).toEqual(legacy.poseClip);
    expect(migrated.solver).toEqual(legacy.solver);
    expect(migrated.bike).toMatchObject(legacyBike);
  });

  it("migrates scenario-file envelopes and deterministically rehashes v3 content", async () => {
    const legacy = structuredClone(scenario) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 2;
    const legacyBike = structuredClone(scenario.bike) as unknown as Record<string, unknown>;
    delete legacyBike.geometry;
    legacy.bike = legacyBike;
    const legacyHash = await hashScenario(legacy);
    const legacyFile = {
      format: "bike-jumper-scenario",
      schemaVersion: 2,
      exportedBy: {
        appVersion: "0.1.0",
        solverVersion: scenario.solver.solverVersion,
        exportedAt: "2026-09-01T12:00:00.000Z"
      },
      scenario: legacy,
      contentHash: legacyHash
    };

    const first = await parseScenarioFile(legacyFile);
    const second = await parseScenarioFile(structuredClone(legacyFile));

    expect(first.schemaVersion).toBe(3);
    expect(first.scenario.schemaVersion).toBe(3);
    expect(first.scenario.poseClip).toEqual(legacy.poseClip);
    expect(first.contentHash).toBe(await hashScenario(first.scenario));
    expect(first.contentHash).not.toBe(legacyHash);
    expect(second).toEqual(first);
  });

  it("produces stable canonical hashes for equivalent migrated v3 scenarios", async () => {
    const parsed = parseScenario(scenario);
    const reordered = {
      ...parsed,
      bike: {
        ...parsed.bike,
        geometry: Object.fromEntries(Object.entries(parsed.bike.geometry).reverse())
      }
    };

    await expect(hashScenario(parsed)).resolves.toBe(await hashScenario(reordered));
  });

  it("accepts capability manifests and rejects duplicate capability paths", () => {
    expect(() =>
      solverCapabilityManifestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        solverVersion: "solver-v1",
        modelVersion: "model-v1",
        deterministic: true,
        supportedScenarioPaths: ["scenario.entry.speed", "scenario.jump.gap"],
        supportedOutputs: ["contactImpulse", "jointTorque"],
        ccd: true,
        contactImpulse: true,
        motorWork: true,
        jointTorque: false
      })
    ).not.toThrow();

    expect(() =>
      solverCapabilityManifestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        solverVersion: "solver-v1",
        modelVersion: "model-v1",
        deterministic: true,
        supportedScenarioPaths: ["scenario.entry.speed", "scenario.entry.speed"],
        supportedOutputs: ["contactImpulse"],
        ccd: true,
        contactImpulse: true,
        motorWork: true,
        jointTorque: false
      })
    ).toThrow();
  });

  it("accepts run artifacts with metadata and source", () => {
    expect(() =>
      runArtifactSchema.parse({
        runId: manifest.runId,
        createdAt: "2026-08-25T00:00:00.000Z",
        scenarioSnapshot: scenario,
        scenarioHash: manifest.scenarioHash,
        manifest,
        model: {
          scenarioSchemaVersion: 1,
          solverVersion: manifest.solverVersion,
          modelVersion: "model-v1",
          assumptionsId: "assumptions-v1",
          unitSystemId: "si-v1",
          metricDefinitionVersion: "metrics-v1"
        },
        frameBuffer: new ArrayBuffer(16),
        telemetryBuffer: new ArrayBuffer(16),
        source: "solver"
      })
    ).not.toThrow();
  });

  it("accepts presets, validation checks, and session references", () => {
    expect(() =>
      presetSchema.parse({
        id: "jump-table-neutral",
        category: "jump",
        name: "Neutral Table",
        tags: ["table", "neutral"],
        note: "Measured guidance available from core.",
        patch: { jump: { gap: 4.2 } },
        readOnly: true,
        speedWindow: {
          minimum: 8,
          maximum: 12,
          status: "measured",
          reason: null
        }
      })
    ).not.toThrow();

    expect(() =>
      validationCheckSchema.parse({
        id: "determinism-hash",
        category: "determinism",
        label: "Determinism hash",
        measured: { value: 1, unit: "ratio" },
        tolerance: { value: 1, unit: "ratio" },
        margin: 1,
        traceRef: "trace://determinism",
        owner: null,
        blockedGate: null,
        status: "pass"
      })
    ).not.toThrow();

    expect(() =>
      sessionReferenceSchema.parse({
        kind: "run",
        id: manifest.runId,
        label: "Standard run",
        reason: "Missing from local storage",
        stale: true
      })
    ).not.toThrow();
  });
});
