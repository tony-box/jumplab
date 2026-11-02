import { describe, expect, it } from "vitest";

import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  achievedPoseLandmarksSchema,
  frameLayoutSchema,
  phasesSchema,
  poseSampleSchema,
  runResultSchema,
  type RunResult
} from "../src/index";

const validResult: RunResult = {
  runId: "dcfd7cb6-c9d6-4f6d-95f9-6cf95df5b15d",
  scenarioHash: "a".repeat(64),
  solverVersion: "rapier-0.35.2-enhanced-determinism",
  frameLayout: {
    version: FRAME_LAYOUT_VERSION,
    strideFloat32: FRAME_STRIDE_FLOAT32,
    fields: FRAME_LAYOUT_FIELDS.map((field) => ({ ...field }))
  },
  frameCount: 120,
  outputHz: 240,
  phases: [
    { name: "approach", startFrame: 0, endFrame: 39 },
    { name: "takeoff", startFrame: 40, endFrame: 49 },
    { name: "flight", startFrame: 50, endFrame: 94 },
    { name: "landing", startFrame: 95, endFrame: 109 },
    { name: "rollout", startFrame: 110, endFrame: 119 }
  ],
  metrics: {
    airtime: { value: 0.64, unit: "s", source: "measured", reason: null },
    peakSuspensionForce: {
      value: null,
      unit: "N",
      source: "pending-core",
      reason: "awaiting telemetry integration"
    }
  },
  telemetry: {
    layoutVersion: 1,
    sampleCount: 240,
    channels: [
      { name: "contactImpulse", unit: "N*s", offset: 0, count: 120 },
      { name: "motorWork", unit: "J", offset: 120, count: 120 }
    ]
  },
  resultHash: "b".repeat(64)
};

describe("run-result schema", () => {
  it("accepts valid run results", () => {
    expect(() => runResultSchema.parse(validResult)).not.toThrow();
  });

  it("enforces metric source and reason rules", () => {
    expect(() =>
      runResultSchema.parse({
        ...validResult,
        metrics: {
          broken: { value: null, unit: "s", source: "measured", reason: null }
        }
      })
    ).toThrow();

    expect(() =>
      runResultSchema.parse({
        ...validResult,
        metrics: {
          broken: { value: 1, unit: "s", source: "pending-core", reason: null }
        }
      })
    ).toThrow();
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

  it("enforces packed layout and telemetry bounds", () => {
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

    expect(() =>
      runResultSchema.parse({
        ...validResult,
        telemetry: {
          layoutVersion: 1,
          sampleCount: 10,
          channels: [{ name: "contactImpulse", unit: "N*s", offset: 8, count: 8 }]
        }
      })
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
    solverVersion: "rapier-0.35.2-enhanced-determinism"
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
