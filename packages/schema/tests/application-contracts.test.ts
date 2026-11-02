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
  DEFAULT_RIDER_COUPLING,
  DEFAULT_RIDER_INSTINCT,
  PROTOCOL_VERSION,
  SCENARIO_SCHEMA_VERSION,
  SOLVER_VERSION,
  TELEMETRY_CHANNELS,
  TELEMETRY_LAYOUT_VERSION,
  bikeGeometrySpecSchema,
  hashScenario,
  kickerTransitionLength,
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

const legacyV2Scenario = {
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
};

const scenario = scenarioSchema.parse(legacyV2Scenario);

const manifest = runResultSchema.parse({
  runId: "0ea94457-4557-43e5-a1f2-0a0658b8f13a",
  scenarioHash: "a".repeat(64),
  solverVersion: SOLVER_VERSION,
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
    status: "airborne-at-end",
    region: null,
    attitude: null,
    firstContact: null,
    severity: "clean",
    crashTime: null,
    reasons: ["run ended in the air"]
  },
  telemetry: {
    layoutVersion: TELEMETRY_LAYOUT_VERSION,
    strideFloat32: TELEMETRY_CHANNELS.length,
    sampleCount: 1,
    channels: TELEMETRY_CHANNELS.map((channel, offset) => ({ ...channel, offset }))
  },
  resultHash: "b".repeat(64)
});

const capabilities = {
  protocolVersion: PROTOCOL_VERSION,
  solverVersion: "solver-v1",
  modelVersion: "model-v1",
  deterministic: true,
  supportedScenarioPaths: ["scenario.entry.speed", "scenario.jump.gap"],
  supportedOutputs: ["contactImpulse", "landingOutcome"],
  ccd: true,
  contactImpulse: true,
  riderCoupling: true,
  riderInstinct: true,
  suspension: false
};

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

  it("migrates v2 scenarios through v3 geometry to v4 without changing authored values", () => {
    const legacy = structuredClone(legacyV2Scenario) as Record<string, unknown>;

    const migrated = parseScenario(legacy);

    expect(migrated.schemaVersion).toBe(SCENARIO_SCHEMA_VERSION);
    expect(migrated.bike.geometry).toEqual(migratedGeometry);
    expect(migrated.id).toBe(legacyV2Scenario.id);
    expect(migrated.jump).toEqual({
      ...legacyV2Scenario.jump,
      lipAngle: expect.closeTo(legacyV2Scenario.jump.lipAngle, 12),
      transitionLength: expect.closeTo(kickerTransitionLength(1, 0.9), 9)
    });
    const { kp: _kp, kd: _kd, joints, ...riderValues } = legacyV2Scenario.rider;
    expect(migrated.rider).toEqual({
      ...riderValues,
      coupling: DEFAULT_RIDER_COUPLING,
      joints: Object.fromEntries(
        Object.entries(joints).map(([name, { min, max }]) => [name, { min, max }])
      )
    });
    expect(migrated.entry).toEqual(legacyV2Scenario.entry);
    expect(migrated.poseClip).toEqual(legacyV2Scenario.poseClip);
    const { seed: _seed, ...solverValues } = legacyV2Scenario.solver;
    expect(migrated.solver).toEqual({
      ...solverValues,
      solverVersion: SOLVER_VERSION,
      riderInstinct: DEFAULT_RIDER_INSTINCT
    });
    expect(migrated.bike).toMatchObject(legacyV2Scenario.bike);
  });

  it("migrates scenario-file envelopes and deterministically rehashes v4 content", async () => {
    const legacy = structuredClone(legacyV2Scenario) as Record<string, unknown>;
    const legacyHash = await hashScenario(legacy);
    const legacyFile = {
      format: "bike-jumper-scenario",
      schemaVersion: 2,
      exportedBy: {
        appVersion: "0.1.0",
        solverVersion: legacyV2Scenario.solver.solverVersion,
        exportedAt: "2026-09-01T12:00:00.000Z"
      },
      scenario: legacy,
      contentHash: legacyHash
    };

    const first = await parseScenarioFile(legacyFile);
    const second = await parseScenarioFile(structuredClone(legacyFile));

    expect(first.schemaVersion).toBe(4);
    expect(first.scenario.schemaVersion).toBe(4);
    expect(first.scenario.poseClip).toEqual(legacy.poseClip);
    expect(first.contentHash).toBe(await hashScenario(first.scenario));
    expect(first.contentHash).not.toBe(legacyHash);
    expect(second).toEqual(first);
  });

  it("produces stable canonical hashes for equivalent migrated v4 scenarios", async () => {
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
    expect(() => solverCapabilityManifestSchema.parse(capabilities)).not.toThrow();

    expect(() =>
      solverCapabilityManifestSchema.parse({
        ...capabilities,
        supportedScenarioPaths: ["scenario.entry.speed", "scenario.entry.speed"]
      })
    ).toThrow();
    expect(() =>
      solverCapabilityManifestSchema.parse({
        ...capabilities,
        supportedOutputs: ["contactImpulse", "contactImpulse"]
      })
    ).toThrow();
  });

  it("requires the two-body capability flags and rejects retired actuator flags", () => {
    for (const flag of ["ccd", "contactImpulse", "riderCoupling", "riderInstinct", "suspension"]) {
      const { [flag]: _removed, ...missing } = capabilities as Record<string, unknown>;
      expect(() => solverCapabilityManifestSchema.parse(missing), flag).toThrow();
    }
    expect(() =>
      solverCapabilityManifestSchema.parse({ ...capabilities, motorWork: true })
    ).toThrow();
    expect(() =>
      solverCapabilityManifestSchema.parse({ ...capabilities, jointTorque: false })
    ).toThrow();
    expect(() =>
      solverCapabilityManifestSchema.parse({ ...capabilities, protocolVersion: 3 })
    ).toThrow();
  });

  it("accepts run artifacts with metadata and source", () => {
    const artifact = {
      runId: manifest.runId,
      createdAt: "2026-08-25T00:00:00.000Z",
      scenarioSnapshot: scenario,
      scenarioHash: manifest.scenarioHash,
      manifest,
      model: {
        scenarioSchemaVersion: SCENARIO_SCHEMA_VERSION,
        solverVersion: manifest.solverVersion,
        modelVersion: "model-v1",
        assumptionsId: "assumptions-v1",
        unitSystemId: "si-v1",
        metricDefinitionVersion: "metrics-v1"
      },
      frameBuffer: new ArrayBuffer(FRAME_STRIDE_FLOAT32 * Float32Array.BYTES_PER_ELEMENT),
      telemetryBuffer: new ArrayBuffer(TELEMETRY_CHANNELS.length * Float32Array.BYTES_PER_ELEMENT),
      source: "solver"
    };
    expect(runArtifactSchema.parse(artifact).manifest.landing.status).toBe("airborne-at-end");
    expect(() =>
      runArtifactSchema.parse({ ...artifact, model: { ...artifact.model, solverVersion: "x" } })
    ).toThrow(/model.solverVersion must match/);
    expect(() =>
      runArtifactSchema.parse({ ...artifact, runId: "11111111-1111-4111-8111-111111111111" })
    ).toThrow(/runId must match/);
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
