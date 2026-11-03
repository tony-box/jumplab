import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { PoseSample } from "../../../../packages/schema/src/index";
import standard from "../../../../tests/fixtures/scenarios/standard-v1.json";
import { interpolatePoseSample } from "../../src/features/designer/pose-sample-cache";

const pkg = resolve("crates/physics-core/pkg-node/physics_core.js");
const core = existsSync(pkg)
  ? (createRequire(import.meta.url)(pkg) as {
      samplePoseJson: (clip: string, s: number, rider: string, bike: string) => string;
    })
  : null;

const sample = (s: number): PoseSample =>
  JSON.parse(
    core!.samplePoseJson(
      JSON.stringify(standard.poseClip),
      s,
      JSON.stringify(standard.rider),
      JSON.stringify(standard.bike)
    )
  ) as PoseSample;

describe.skipIf(!core)("pose preview cache", () => {
  it("blends cached core samples to within a millimetre of a direct sample", () => {
    const start = -6;
    const step = 0.05;
    const samples = Array.from({ length: 301 }, (_, index) => sample(start + index * step));
    const cache = { start, step, samples };

    let worst = 0;
    for (let s = start; s <= 9; s += 0.0173) {
      const blended = interpolatePoseSample(cache, s)!;
      const direct = sample(s);
      for (const [name, point] of Object.entries(direct.landmarks)) {
        const other = blended.landmarks[name as keyof PoseSample["landmarks"]];
        worst = Math.max(worst, Math.hypot(point.x - other.x, point.y - other.y));
      }
    }
    expect(worst).toBeLessThan(0.001);
  });

  it("holds the end poses outside the cached range", () => {
    const samples = [sample(0), sample(1)];
    const cache = { start: 0, step: 1, samples };
    expect(interpolatePoseSample(cache, -5)!.landmarks).toEqual(samples[0]!.landmarks);
    expect(interpolatePoseSample(cache, 5)!.landmarks).toEqual(samples[1]!.landmarks);
  });
});
