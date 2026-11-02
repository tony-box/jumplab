import { describe, expect, it } from "vitest";

import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  TELEMETRY_CHANNELS,
  TELEMETRY_LAYOUT_VERSION,
  achievedPoseLandmarksSchema,
  bikeMassPropertiesSchema,
  frameLayoutSchema,
  landingOutcomeSchema,
  phasesSchema,
  poseSampleSchema,
  runResultSchema,
  telemetrySchema,
  type RunResult
} from "../src/index";
import standardRunResult from "../../../tests/fixtures/run-results/standard-v2.json";

const validResult: RunResult = {
  runId: "dcfd7cb6-c9d6-4f6d-95f9-6cf95df5b15d",
  scenarioHash: "a".repeat(64),
  solverVersion: "rapier-0.35.2-two-body-v6-geometry-v1-mass-distribution-v2",
  frameLayout: {
    version: FRAME_LAYOUT_VERSION,
    strideFloat32: FRAME_STRIDE_FLOAT32,
    fields: FRAME_LAYOUT_FIELDS.map((field) => ({ ...field }))
  },
  frameCount: 120,
  outputHz: 240,
  phases: [
    { name: "approach", startFrame: 0, endFrame: 29 },
    { name: "transition", startFrame: 30, endFrame: 39 },
    { name: "takeoff", startFrame: 40, endFrame: 49 },
    { name: "flight", startFrame: 50, endFrame: 94 },
    { name: "landing", startFrame: 95, endFrame: 109 },
    { name: "rollout", startFrame: 110, endFrame: 119 }
  ],
  metrics: {
    airtime: { value: 0.64, unit: "s", source: "measured", reason: null },
    sweetSpotOffset: {
      value: 0.2,
      unit: "m",
      source: "estimate",
      reason: "landing contact interpolated between frames"
    },
    peakSuspensionForce: {
      value: null,
      unit: "N",
      source: "unavailable",
      reason: "suspension is not simulated"
    }
  },
  landing: {
    status: "landed",
    region: "sweet-spot",
    attitude: "balanced",
    firstContact: "rear",
    severity: "clean",
    crashTime: null,
    reasons: []
  },
  telemetry: {
    layoutVersion: TELEMETRY_LAYOUT_VERSION,
    strideFloat32: TELEMETRY_CHANNELS.length,
    sampleCount: 120,
    channels: TELEMETRY_CHANNELS.map((channel, offset) => ({ ...channel, offset }))
  },
  resultHash: "b".repeat(64)
};

describe("run-result schema", () => {
  it("accepts valid run results", () => {
    expect(() => runResultSchema.parse(validResult)).not.toThrow();
  });

  it("accepts the real solver output fixture", () => {
    const parsed = runResultSchema.parse(standardRunResult);
    expect(parsed.frameLayout.version).toBe(3);
    expect(parsed.telemetry.sampleCount).toBe(parsed.frameCount);
    expect(parsed.landing.status).toBe("landed");
  });

  it("describes frame layout 3 as 57 packed scalar fields", () => {
    expect(FRAME_LAYOUT_VERSION).toBe(3);
    expect(FRAME_STRIDE_FLOAT32).toBe(57);
    expect(FRAME_LAYOUT_FIELDS).toHaveLength(57);
    expect(FRAME_LAYOUT_FIELDS.map((field) => field.offset)).toEqual(
      Array.from({ length: 57 }, (_, index) => index)
    );
    expect(FRAME_LAYOUT_FIELDS.every((field) => field.length === 1)).toBe(true);
    expect(FRAME_LAYOUT_FIELDS.slice(0, 3).map((field) => field.name)).toEqual(["t", "x", "y"]);
    expect(FRAME_LAYOUT_FIELDS[36]?.name).toBe("pitchRate");
    expect(FRAME_LAYOUT_FIELDS.at(-1)?.name).toBe("crashed");
    expect(new Set(FRAME_LAYOUT_FIELDS.map((field) => field.name)).size).toBe(57);
  });

  it("enforces metric source and reason rules", () => {
    const withMetric = (metric: unknown) =>
      runResultSchema.safeParse({ ...validResult, metrics: { broken: metric } }).success;

    expect(withMetric({ value: null, unit: "s", source: "measured", reason: null })).toBe(false);
    expect(withMetric({ value: 1, unit: "s", source: "measured", reason: "why" })).toBe(false);
    expect(withMetric({ value: 1, unit: "s", source: "pending-core", reason: null })).toBe(false);
    expect(withMetric({ value: 1, unit: "s", source: "estimate", reason: null })).toBe(false);
    expect(withMetric({ value: null, unit: "s", source: "unavailable", reason: null })).toBe(false);
    expect(withMetric({ value: 1, unit: "s", source: "guess", reason: "x" })).toBe(false);
    expect(withMetric({ value: 1, unit: "s", source: "estimate", reason: "approx" })).toBe(true);
    expect(withMetric({ value: null, unit: "s", source: "unavailable", reason: "n/a" })).toBe(true);
    expect(withMetric({ value: null, unit: "s", source: "pending-core", reason: "later" })).toBe(
      true
    );
  });

  it("enforces phase ordering and non-overlap", () => {
    expect(() =>
      phasesSchema.parse([
        { name: "flight", startFrame: 50, endFrame: 99 },
        { name: "takeoff", startFrame: 40, endFrame: 49 }
      ])
    ).toThrow();

    expect(() =>
      runResultSchema.parse({
        ...validResult,
        phases: [
          { name: "approach", startFrame: 0, endFrame: 40 },
          { name: "takeoff", startFrame: 40, endFrame: 50 }
        ]
      })
    ).toThrow();
  });

  it("enforces the packed frame layout", () => {
    expect(() =>
      frameLayoutSchema.parse({
        version: FRAME_LAYOUT_VERSION,
        strideFloat32: FRAME_STRIDE_FLOAT32,
        fields: [
          { name: "bikeX", offset: 0, length: 2 },
          { name: "bikeY", offset: 1, length: 2 }
        ]
      })
    ).toThrow();

    const fields = FRAME_LAYOUT_FIELDS.map((field) => ({ ...field }));
    const swapped = fields.map((field, index) =>
      index === 1 ? { ...field, name: "y" } : index === 2 ? { ...field, name: "x" } : field
    );
    expect(() => frameLayoutSchema.parse({ ...validResult.frameLayout, fields: swapped })).toThrow(
      /field 1 must be x/
    );
    expect(() =>
      frameLayoutSchema.parse({ ...validResult.frameLayout, fields: fields.slice(0, 36) })
    ).toThrow(/requires 57 fields/);
    expect(() => frameLayoutSchema.parse({ ...validResult.frameLayout, version: 2 })).toThrow();
    expect(() =>
      frameLayoutSchema.parse({ ...validResult.frameLayout, strideFloat32: 36 })
    ).toThrow();
  });

  it("enforces the interleaved telemetry layout", () => {
    expect(TELEMETRY_LAYOUT_VERSION).toBe(2);
    expect(TELEMETRY_CHANNELS.map((channel) => channel.name)).toEqual([
      "contactImpulse",
      "actuatorWork",
      "speed",
      "comHeight"
    ]);

    expect(() =>
      telemetrySchema.parse({
        layoutVersion: 2,
        strideFloat32: 4,
        sampleCount: 10,
        channels: [{ name: "contactImpulse", unit: "N*s", offset: 4 }]
      })
    ).toThrow(/offset exceeds the sample stride/);
    expect(() =>
      telemetrySchema.parse({
        layoutVersion: 1,
        strideFloat32: 4,
        sampleCount: 10,
        channels: []
      })
    ).toThrow();
    expect(() =>
      telemetrySchema.parse({
        layoutVersion: 2,
        sampleCount: 10,
        channels: [{ name: "contactImpulse", unit: "N*s", offset: 0, count: 10 }]
      })
    ).toThrow();
    expect(() =>
      runResultSchema.parse({
        ...validResult,
        telemetry: { ...validResult.telemetry, strideFloat32: 0 }
      })
    ).toThrow();
  });

  it("requires a structured landing outcome", () => {
    const { landing: _landing, ...withoutLanding } = validResult;
    expect(() => runResultSchema.parse(withoutLanding)).toThrow();

    expect(() =>
      landingOutcomeSchema.parse({
        status: "landed",
        region: "case",
        attitude: "nose-heavy",
        firstContact: "front",
        severity: "crash",
        crashTime: 1.42,
        reasons: ["cased the deck 4.30 m short of the landing"]
      })
    ).not.toThrow();
    expect(() =>
      landingOutcomeSchema.parse({
        status: "no-flight",
        region: null,
        attitude: null,
        firstContact: null,
        severity: "clean",
        crashTime: null,
        reasons: ["never left the ground"]
      })
    ).not.toThrow();

    for (const invalid of [
      { status: "crashed" },
      { region: "perfect" },
      { attitude: "level" },
      { firstContact: "frame" },
      { severity: "minor" },
      { crashTime: Number.NaN },
      { reasons: [""] },
      { label: "clean landing" }
    ]) {
      expect(() =>
        runResultSchema.parse({ ...validResult, landing: { ...validResult.landing, ...invalid } })
      ).toThrow();
    }
  });

  it("requires mass distribution version 2", () => {
    const massProperties = {
      totalMass: 14,
      centerOfGravity: { x: 0.57, y: 0.54 },
      planarInertia: 2.8,
      distributionVersion: 2
    };
    expect(() => bikeMassPropertiesSchema.parse(massProperties)).not.toThrow();
    expect(() =>
      bikeMassPropertiesSchema.parse({ ...massProperties, distributionVersion: 1 })
    ).toThrow();
  });
});

describe("pose sample schema", () => {
  const validLandmarks = {
    pedalContact: { x: -0.18, y: 0.33 },
    ankle: { x: -0.18, y: 0.33 },
    knee: { x: -0.15, y: 0.56 },
    hip: { x: 0.02, y: 0.82 },
    shoulder: { x: 0.07, y: 1.31 },
    elbow: { x: 0.25, y: 1.16 },
    hand: { x: 0.42, y: 1.02 },
    handlebarContact: { x: 0.42, y: 1.02 },
    head: { x: 0.08, y: 1.49 }
  };

  const validSample = {
    s: 0,
    targets: { knee: 0.9, hip: 0.4, spine: 0.15 },
    derivedArm: { shoulder: -0.2, elbow: 1.1, constrained: false },
    landmarks: validLandmarks,
    solverVersion: "rapier-0.35.2-two-body-v6-geometry-v1-mass-distribution-v2"
  };

  it("accepts a valid pose sample with achieved landmarks", () => {
    expect(() => poseSampleSchema.parse(validSample)).not.toThrow();
  });

  it("requires every achieved landmark", () => {
    const { pedalContact: _pedalContact, ...incompleteLandmarks } = validLandmarks;
    expect(() =>
      poseSampleSchema.parse({ ...validSample, landmarks: incompleteLandmarks })
    ).toThrow();
  });

  it("rejects non-finite landmark coordinates", () => {
    expect(() =>
      poseSampleSchema.parse({
        ...validSample,
        landmarks: { ...validLandmarks, hand: { x: Number.NaN, y: 1.02 } }
      })
    ).toThrow();
  });

  it("rejects unknown landmark fields", () => {
    expect(() =>
      achievedPoseLandmarksSchema.parse({ ...validLandmarks, extra: { x: 0, y: 0 } })
    ).toThrow();
  });
});
