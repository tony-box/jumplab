import type { PoseSample } from "../../../../../packages/schema/src/index";

/** Poses sampled by the core at even spacing along the clip. */
export type PoseSampleCache = {
  start: number;
  step: number;
  samples: PoseSample[];
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * The pose at `s`, blended linearly between the two nearest cached core samples. The clip is
 * smooth at the cache spacing, so this matches a direct core sample to well under a millimetre
 * while costing nothing per frame.
 */
export const interpolatePoseSample = (cache: PoseSampleCache, s: number): PoseSample | null => {
  const { samples, start, step } = cache;
  if (samples.length === 0) return null;
  const position = Math.min(samples.length - 1, Math.max(0, (s - start) / step));
  const lowerIndex = Math.floor(position);
  const lower = samples[lowerIndex]!;
  const upper = samples[Math.min(samples.length - 1, lowerIndex + 1)]!;
  const t = position - lowerIndex;

  const landmarks = Object.fromEntries(
    Object.entries(lower.landmarks).map(([name, point]) => {
      const next = upper.landmarks[name as keyof PoseSample["landmarks"]];
      return [name, { x: lerp(point.x, next.x, t), y: lerp(point.y, next.y, t) }];
    })
  ) as PoseSample["landmarks"];

  return {
    s,
    targets: {
      knee: lerp(lower.targets.knee, upper.targets.knee, t),
      hip: lerp(lower.targets.hip, upper.targets.hip, t),
      spine: lerp(lower.targets.spine, upper.targets.spine, t)
    },
    derivedArm: {
      shoulder: lerp(lower.derivedArm.shoulder, upper.derivedArm.shoulder, t),
      elbow: lerp(lower.derivedArm.elbow, upper.derivedArm.elbow, t),
      constrained: lower.derivedArm.constrained || upper.derivedArm.constrained
    },
    landmarks,
    solverVersion: lower.solverVersion
  };
};
