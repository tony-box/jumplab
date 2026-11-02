import { describe, expect, it } from "vitest";

import { buildChannelCurves, sampleChannel } from "../../src/features/designer/pose-interpolation";

const keys = [
  { s: -3, targets: { knee: 0.1, hip: 0.2, spine: 0.05 } },
  { s: -1, targets: { knee: 1.2, hip: 0.9, spine: 0.6 } },
  { s: 1, targets: { knee: 0.3, hip: 0.4, spine: 0.1 } },
  { s: 3, targets: { knee: 0.9, hip: 0.7, spine: 0.5 } }
];

describe("pose channel interpolation", () => {
  it("holds the previous key in step mode and blends it in linear mode", () => {
    expect(sampleChannel(keys, "step", "hip", 0)).toBe(0.9);
    expect(sampleChannel(keys, "linear", "hip", 0)).toBeCloseTo(0.65, 6);
  });

  it("matches the Rust cubic Hermite tangents between keys", () => {
    // t = 0.5 between s = -1 and s = 1 with Catmull-Rom style half-differences.
    const a = 0.9;
    const b = 0.4;
    const c0 = (b - 0.2) * 0.5;
    const c1 = (0.7 - a) * 0.5;
    const expected = 0.5 * a + 0.125 * c0 + 0.5 * b + -0.125 * c1;

    expect(sampleChannel(keys, "cubic", "hip", 0)).toBeCloseTo(expected, 6);
  });

  it("reproduces authored values exactly at every key regardless of mode", () => {
    for (const mode of ["cubic", "linear", "step"] as const) {
      for (const key of keys) {
        expect(sampleChannel(keys, mode, "spine", key.s)).toBeCloseTo(key.targets.spine, 6);
      }
    }
  });

  it("clamps outside the authored span", () => {
    expect(sampleChannel(keys, "cubic", "knee", -10)).toBeCloseTo(0.1, 6);
    expect(sampleChannel(keys, "cubic", "knee", 10)).toBeCloseTo(0.9, 6);
  });

  it("draws a different curve per interpolation mode over a stable domain", () => {
    const paths = (["cubic", "linear", "step"] as const).map(
      (mode) => buildChannelCurves(keys, mode, ["hip", "spine"], 1000, 100)[0]?.path ?? ""
    );

    expect(new Set(paths).size).toBe(3);

    // Endpoints are authored keys, so the vertical domain does not shift between modes.
    const endpoints = paths.map((path) => {
      const commands = path.split("L");
      return [commands[0], commands[commands.length - 1]];
    });
    expect(endpoints[1]).toEqual(endpoints[0]);
    expect(endpoints[2]).toEqual(endpoints[0]);
  });

  it("returns no curves when there is nothing to interpolate", () => {
    expect(buildChannelCurves(keys.slice(0, 1), "cubic", ["hip"], 1000, 100)).toEqual([]);
  });
});
