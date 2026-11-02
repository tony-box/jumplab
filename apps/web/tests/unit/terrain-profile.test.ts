import { describe, expect, it } from "vitest";

import type { TerrainProfile } from "../../../../packages/schema/src/index";
import {
  drawTerrainProfileSegments,
  fillTerrainProfileSegments,
  terrainHeightAt
} from "../../src/rendering/canvas/terrain-profile";

const profile: TerrainProfile = {
  segments: [
    {
      id: "approach-takeoff",
      kind: "approach-takeoff",
      points: [
        [-4, 0],
        [-1, 0],
        [0, 1]
      ]
    },
    {
      id: "landing-rollout",
      kind: "landing-rollout",
      points: [
        [3, 0.5],
        [5, 0]
      ]
    }
  ],
  approachStartX: -4,
  lipX: 0,
  landingStartX: 3,
  sampleStep: 0.1
};

describe("terrain height sampling", () => {
  it("interpolates the surface and reports voids as unsupported", () => {
    expect(terrainHeightAt(profile, -4)).toBe(0);
    expect(terrainHeightAt(profile, -2)).toBe(0);
    expect(terrainHeightAt(profile, -0.5)).toBeCloseTo(0.5, 10);
    expect(terrainHeightAt(profile, 4)).toBeCloseTo(0.25, 10);
    expect(terrainHeightAt(profile, 1.5)).toBeNull();
    expect(terrainHeightAt(null, 0)).toBeNull();
  });
});

describe("segmented terrain drawing", () => {
  it("draws every returned vertex with one independent stroke per segment", () => {
    const calls: Array<[string, number?, number?]> = [];
    const context = {
      beginPath: () => calls.push(["beginPath"]),
      moveTo: (x: number, y: number) => calls.push(["moveTo", x, y]),
      lineTo: (x: number, y: number) => calls.push(["lineTo", x, y]),
      stroke: () => calls.push(["stroke"])
    };

    const result = drawTerrainProfileSegments(context, profile, (point) => [point[0], point[1]]);

    expect(result).toEqual({ segmentCount: 2, vertexCount: 5 });
    expect(calls.filter(([name]) => name === "beginPath")).toHaveLength(2);
    expect(calls.filter(([name]) => name === "stroke")).toHaveLength(2);
    expect(calls.filter(([name]) => name === "moveTo")).toEqual([
      ["moveTo", -4, 0],
      ["moveTo", 3, 0.5]
    ]);
    expect(calls).not.toContainEqual(["lineTo", 3, 0.5]);
  });

  it("omits vertical cut faces from the rideable surface stroke", () => {
    const calls: string[] = [];
    const context = {
      beginPath: () => calls.push("beginPath"),
      moveTo: () => calls.push("moveTo"),
      lineTo: () => calls.push("lineTo"),
      stroke: () => calls.push("stroke")
    };
    const withFace: TerrainProfile = {
      ...profile,
      segments: [
        ...profile.segments,
        {
          id: "landing-face",
          kind: "landing-face",
          points: [
            [3, 0.1],
            [3, 0.5]
          ]
        }
      ]
    };

    const result = drawTerrainProfileSegments(context, withFace, (point) => [point[0], point[1]]);

    expect(result).toEqual({ segmentCount: 2, vertexCount: 5 });
    expect(calls.filter((name) => name === "stroke")).toHaveLength(2);
  });
});

describe("segmented terrain filling", () => {
  it("closes each segment down to the view floor with one fill per segment", () => {
    const calls: Array<[string, number?, number?]> = [];
    const context = {
      beginPath: () => calls.push(["beginPath"]),
      moveTo: (x: number, y: number) => calls.push(["moveTo", x, y]),
      lineTo: (x: number, y: number) => calls.push(["lineTo", x, y]),
      closePath: () => calls.push(["closePath"]),
      fill: () => calls.push(["fill"])
    };

    const result = fillTerrainProfileSegments(
      context,
      profile,
      (point) => [point[0], point[1]],
      -2
    );

    expect(result).toEqual({ filledSegmentCount: 2, vertexCount: 5 });
    expect(calls.filter(([name]) => name === "fill")).toHaveLength(2);
    expect(calls).toContainEqual(["lineTo", 0, -2]);
    expect(calls).toContainEqual(["lineTo", -4, -2]);
    expect(calls).toContainEqual(["lineTo", 5, -2]);
    expect(calls).toContainEqual(["lineTo", 3, -2]);
  });

  it("leaves gaps and vertical step faces unfilled", () => {
    const calls: string[] = [];
    const context = {
      beginPath: () => calls.push("beginPath"),
      moveTo: () => calls.push("moveTo"),
      lineTo: () => calls.push("lineTo"),
      closePath: () => calls.push("closePath"),
      fill: () => calls.push("fill")
    };

    const result = fillTerrainProfileSegments(
      context,
      {
        ...profile,
        segments: [
          {
            id: "landing-face",
            kind: "landing-face",
            points: [
              [3, 1.5],
              [3, 0.5]
            ]
          }
        ]
      },
      (point) => [point[0], point[1]],
      -2
    );

    expect(result).toEqual({ filledSegmentCount: 0, vertexCount: 0 });
    expect(calls).toHaveLength(0);
  });
});
