import { describe, expect, it } from "vitest";

import type { AchievedPoseLandmarks } from "../../../../packages/schema/src/index";
import { buildRiderGeometry } from "../../src/rendering/geometry/rider-geometry";

const landmarks: AchievedPoseLandmarks = {
  pedalContact: { x: -0.18, y: 0.33 },
  ankle: { x: -0.18, y: 0.33 },
  knee: { x: -0.08, y: 0.55 },
  hip: { x: 0.04, y: 0.82 },
  shoulder: { x: 0.08, y: 1.3 },
  elbow: { x: 0.26, y: 1.16 },
  hand: { x: 0.42, y: 1.02 },
  handlebarContact: { x: 0.42, y: 1.02 },
  head: { x: 0.09, y: 1.48 }
};

const length = (start: { x: number; y: number }, end: { x: number; y: number }) =>
  Math.hypot(end.x - start.x, end.y - start.y);

describe("paired rider geometry", () => {
  it("places the far foot on a reachable opposite pedal with constrained segment lengths", () => {
    const farPedal = { x: -0.1, y: 0.33 };
    const geometry = buildRiderGeometry(landmarks, farPedal);

    expect(geometry.farLegReachable).toBe(true);
    expect(geometry.farLeg.distal).toEqual(farPedal);
    expect(length(geometry.farLeg.proximal, geometry.farLeg.middle)).toBeCloseTo(
      length(geometry.nearLeg.proximal, geometry.nearLeg.middle),
      10
    );
    expect(length(geometry.farLeg.middle, geometry.farLeg.distal)).toBeCloseTo(
      length(geometry.nearLeg.middle, geometry.nearLeg.distal),
      10
    );
  });

  it("flags an unreachable opposite pedal without stretching either leg segment", () => {
    const unreachablePedal = { x: -4, y: -2 };
    const geometry = buildRiderGeometry(landmarks, unreachablePedal);

    expect(geometry.farLegReachable).toBe(false);
    expect(geometry.farLeg.distal).not.toEqual(unreachablePedal);
    expect(length(geometry.farLeg.proximal, geometry.farLeg.middle)).toBeCloseTo(
      length(geometry.nearLeg.proximal, geometry.nearLeg.middle),
      10
    );
    expect(length(geometry.farLeg.middle, geometry.farLeg.distal)).toBeCloseTo(
      length(geometry.nearLeg.middle, geometry.nearLeg.distal),
      5
    );
  });
});
