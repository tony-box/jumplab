import { describe, expect, it } from "vitest";

import { stackLabels } from "../../src/features/designer/DistanceTrack";

describe("marker label stacking", () => {
  it("keeps separated labels on the bottom row", () => {
    expect(
      stackLabels([
        { id: "transition", left: 0, right: 50 },
        { id: "lip", left: 100, right: 120 },
        { id: "landing", left: 200, right: 250 }
      ])
    ).toEqual({ transition: 0, lip: 0, landing: 0 });
  });

  it("raises a label that would overlap or crowd its neighbour", () => {
    expect(
      stackLabels([
        { id: "landing", left: 95, right: 140 },
        { id: "lip", left: 100, right: 118 },
        { id: "transition", left: 40, right: 98 }
      ])
    ).toEqual({ transition: 0, landing: 1, lip: 2 });
  });

  it("reuses the lowest free row", () => {
    expect(
      stackLabels([
        { id: "a", left: 0, right: 40 },
        { id: "b", left: 20, right: 60 },
        { id: "c", left: 80, right: 120 }
      ])
    ).toEqual({ a: 0, b: 1, c: 0 });
  });
});
