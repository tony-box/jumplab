import { describe, expect, it } from "vitest";

import { toWorldPoint, type WorkbenchFrame } from "../../src/rendering/canvas/workbench-stage";
import { canonicalBikeGeometry } from "./canonical-bike-fixture";

const bike = canonicalBikeGeometry();
const rearAxle = bike.landmarks.rearAxle!;
const frontAxle = bike.landmarks.frontAxle!;
const rearWheel = bike.protectedShapes.find((shape) => shape.part === "rearTire");
const wheelRadius = rearWheel?.shape === "ring" ? rearWheel.outerRadius : 0;

describe("workbench bike anchor", () => {
  it("places each lowest wheel point at frame y for zero pitch", () => {
    const frame: WorkbenchFrame = { x: 3, y: 1.25, pitch: 0 };
    const worldRearAxle = toWorldPoint(rearAxle, frame);
    const worldFrontAxle = toWorldPoint(frontAxle, frame);

    expect(worldRearAxle.y - wheelRadius).toBeCloseTo(frame.y, 6);
    expect(worldFrontAxle.y - wheelRadius).toBeCloseTo(frame.y, 6);
  });

  it("places the front axle above the rear axle for positive pitch", () => {
    const frame: WorkbenchFrame = { x: 0, y: 0, pitch: Math.PI / 12 };
    const worldRearAxle = toWorldPoint(rearAxle, frame);
    const worldFrontAxle = toWorldPoint(frontAxle, frame);

    expect(worldFrontAxle.y).toBeGreaterThan(worldRearAxle.y);
  });
});
