import { describe, expect, it } from "vitest";

import { modelExtent, toWorldPoint } from "../../src/rendering/canvas/workbench-stage";
import { transformCanonicalBikeGeometry } from "../../src/rendering/geometry/bike-geometry";
import type { Scenario } from "../../../../packages/schema/src/index";
import { defaultWorkbenchScenario } from "../../src/features/workbench/default-template";
import { canonicalBikeGeometry } from "./canonical-bike-fixture";

const scenario: Scenario = defaultWorkbenchScenario;
const unavailableRider = { available: false } as never;

const extentForPitch = (pitch: number) => {
  const frame = { x: 4, y: 1.5, pitch };
  const spun = transformCanonicalBikeGeometry(canonicalBikeGeometry(), (point) =>
    toWorldPoint(point, frame)
  );

  return modelExtent(scenario, frame, spun, unavailableRider);
};

describe("follow framing during rotation", () => {
  it("measures the same rig size regardless of pitch", () => {
    const upright = extentForPitch(0);
    const inverted = extentForPitch(Math.PI);
    const diagonal = extentForPitch(Math.PI / 4);

    const height = (extent: typeof upright) => extent.maxY - extent.minY;
    const width = (extent: typeof upright) => extent.maxX - extent.minX;

    expect(height(diagonal)).toBeCloseTo(height(upright), 6);
    expect(width(diagonal)).toBeCloseTo(width(upright), 6);
    expect(height(inverted)).toBeCloseTo(height(upright), 6);
    expect(width(inverted)).toBeCloseTo(width(upright), 6);
  });
});
