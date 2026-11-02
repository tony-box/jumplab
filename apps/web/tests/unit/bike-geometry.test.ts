import { describe, expect, it, vi } from "vitest";

import type { CanonicalBikeGeometry } from "../../../../packages/schema/src/index";
import {
  canonicalGeometryPoints,
  transformCanonicalBikeGeometry
} from "../../src/rendering/geometry/bike-geometry";
import { drawBikeGeometry } from "../../src/rendering/geometry/draw-bike";

const canonical: CanonicalBikeGeometry = {
  modelVersion: 1,
  valid: true,
  issues: [],
  closureResidual: 0.003,
  landmarks: {
    rearAxle: { x: -0.6, y: 0.36 },
    frontAxle: { x: 0.65, y: 0.36 },
    bottomBracket: { x: -0.18, y: 0.33 },
    pedalForward: { x: -0.01, y: 0.33 },
    pedalRearward: { x: -0.35, y: 0.33 },
    handlebarContact: { x: 0.39, y: 1.02 }
  },
  members: [
    {
      name: "crankRearward",
      start: { x: -0.18, y: 0.33 },
      end: { x: -0.35, y: 0.33 }
    },
    { name: "chainstay", start: { x: -0.6, y: 0.36 }, end: { x: -0.18, y: 0.33 } },
    { name: "handlebar", start: { x: 0.31, y: 0.98 }, end: { x: 0.39, y: 1.02 } }
  ],
  protectedShapes: [
    {
      part: "rearTire",
      contactSurface: "none",
      shape: "ring",
      center: { x: -0.6, y: 0.36 },
      innerRadius: 0.33,
      outerRadius: 0.37
    },
    {
      part: "pedalForward",
      contactSurface: "foot",
      shape: "circle",
      center: { x: -0.01, y: 0.33 },
      radius: 0.025
    },
    {
      part: "pedalRearward",
      contactSurface: "foot",
      shape: "circle",
      center: { x: -0.35, y: 0.33 },
      radius: 0.025
    },
    {
      part: "saddle",
      contactSurface: "saddle-top",
      shape: "capsule",
      start: { x: -0.33, y: 0.9 },
      end: { x: -0.07, y: 0.9 },
      radius: 0.025
    }
  ],
  massProperties: {
    totalMass: 14,
    centerOfGravity: { x: -0.04, y: 0.53 },
    planarInertia: 2.75,
    distributionVersion: 1
  }
};

const context = () =>
  ({
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn()
  }) as unknown as CanvasRenderingContext2D;

describe("canonical bike rendering", () => {
  it("transforms core-returned landmarks, members, protected shapes, contacts, and CoG", () => {
    const transformed = transformCanonicalBikeGeometry(canonical, (point) => ({
      x: point.x + 10,
      y: point.y - 4
    }));

    expect(transformed.landmarks.rearAxle).toEqual({ x: 9.4, y: -3.64 });
    expect(transformed.members.find((member) => member.name === "chainstay")?.start).toEqual({
      x: 9.4,
      y: -3.64
    });
    expect(transformed.protectedShapes[0]).toMatchObject({
      shape: "ring",
      center: { x: 9.4, y: -3.64 }
    });
    expect(transformed.protectedShapes[1]).toMatchObject({
      contactSurface: "foot",
      center: { x: 9.99, y: -3.67 }
    });
    expect(transformed.massProperties.centerOfGravity.x).toBeCloseTo(9.96);
    expect(transformed.massProperties.centerOfGravity.y).toBeCloseTo(-3.47);
  });

  it("draws member and envelope endpoints supplied by the core without reconstructing them", () => {
    const drawing = context();
    const toScreen = vi.fn(
      (point: { x: number; y: number }) => [point.x * 100, point.y * 100] as [number, number]
    );

    drawBikeGeometry(drawing, toScreen, canonical, {
      protectedEnvelopes: true,
      contacts: true,
      centerOfGravity: true
    });

    expect(toScreen).toHaveBeenCalledWith(canonical.members[0]!.start);
    expect(toScreen).toHaveBeenCalledWith(canonical.members[0]!.end);
    expect(toScreen).toHaveBeenCalledWith(canonical.massProperties.centerOfGravity);
    const saddlePoints = toScreen.mock.calls
      .map(([point]) => point)
      .filter((point) => Math.abs(point.y - 0.9) < 1e-9);
    expect(saddlePoints.some((point) => Math.abs(point.x + 0.295) < 1e-9)).toBe(true);
    expect(saddlePoints.some((point) => Math.abs(point.x + 0.105) < 1e-9)).toBe(true);
  });

  it("draws the saddle and mutes the far-side crank and pedal", () => {
    const drawing = context();
    const strokes: string[] = [];
    const fills: string[] = [];
    drawing.strokeStyle = "";
    drawing.fillStyle = "";
    vi.mocked(drawing.stroke).mockImplementation(() => strokes.push(String(drawing.strokeStyle)));
    vi.mocked(drawing.fill).mockImplementation(() => fills.push(String(drawing.fillStyle)));

    drawBikeGeometry(drawing, (point) => [point.x * 100, point.y * 100], canonical, {
      contacts: true
    });

    expect(strokes[0]).toBe("#4b5760");
    expect(strokes).toContain("#f2c14e");
    expect(fills).toContain("#4b5760");
    expect(fills).toContain("#f2c14e");
  });

  it("computes extents only from canonical points", () => {
    const points = canonicalGeometryPoints(canonical);
    expect(points).toEqual(
      expect.arrayContaining([
        canonical.landmarks.rearAxle,
        canonical.members[1]!.end,
        canonical.massProperties.centerOfGravity
      ])
    );
  });
});
