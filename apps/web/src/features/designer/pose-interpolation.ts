import type { PoseClip } from "../../../../../packages/schema/src/index";

import type { JointName } from "./pose-sampling";

export type ChannelKey = {
  s: number;
  targets: Record<JointName, number>;
};

/**
 * Mirrors `sample_pose`'s scalar target interpolation in `crates/physics-core/src/pose.rs`
 * for display-only channel curves. Rust remains the authority for achieved poses.
 */
export const sampleChannel = (
  keys: readonly ChannelKey[],
  interpolation: PoseClip["interpolation"],
  joint: JointName,
  s: number
): number => {
  if (keys.length === 0) {
    return 0;
  }
  if (keys.length === 1) {
    return keys[0]!.targets[joint];
  }

  let lower = 0;
  for (let index = 0; index < keys.length - 1; index += 1) {
    if (s >= keys[index]!.s && s <= keys[index + 1]!.s) {
      lower = index;
      break;
    }
  }
  if (s <= keys[0]!.s) {
    lower = 0;
  } else if (s >= keys[keys.length - 1]!.s) {
    lower = keys.length - 2;
  }

  const upper = lower + 1;
  const left = keys[lower]!;
  const right = keys[upper]!;
  const span = Math.max(right.s - left.s, 1e-6);
  const t = Math.min(1, Math.max(0, (s - left.s) / span));

  const a = left.targets[joint];
  const b = right.targets[joint];

  if (interpolation === "step") {
    return t >= 1 ? b : a;
  }
  if (interpolation === "linear") {
    return a + (b - a) * t;
  }

  const leftPrevious = lower === 0 ? left : keys[lower - 1]!;
  const rightNext = upper + 1 >= keys.length ? right : keys[upper + 1]!;
  const c0 = (b - leftPrevious.targets[joint]) * 0.5;
  const c1 = (rightNext.targets[joint] - a) * 0.5;
  const t2 = t * t;
  const t3 = t2 * t;

  return (
    (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * c0 + (-2 * t3 + 3 * t2) * b + (t3 - t2) * c1
  );
};

export type ChannelCurve = {
  joint: JointName;
  path: string;
};

const CURVE_SAMPLES = 200;
const MINIMUM_DOMAIN_RAD = 0.1;

/**
 * Pads the domain with the authored extremes only, so switching interpolation
 * redraws the curve without rescaling the axis underneath it.
 */
const channelDomain = (
  keys: readonly ChannelKey[],
  joint: JointName
): { minimum: number; maximum: number } => {
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const key of keys) {
    minimum = Math.min(minimum, key.targets[joint]);
    maximum = Math.max(maximum, key.targets[joint]);
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    return { minimum: -1, maximum: 1 };
  }
  const centre = (minimum + maximum) / 2;
  const half = Math.max((maximum - minimum) / 2, MINIMUM_DOMAIN_RAD / 2) * 1.35;
  return { minimum: centre - half, maximum: centre + half };
};

export const buildChannelCurves = (
  keys: readonly ChannelKey[],
  interpolation: PoseClip["interpolation"],
  joints: readonly JointName[],
  viewBoxWidth: number,
  viewBoxHeight: number,
  /** Distance range drawn across the view box; defaults to the keys. Outside the keys targets hold. */
  domain?: { start: number; end: number }
): ChannelCurve[] => {
  if (keys.length < 2) {
    return [];
  }

  const first = domain?.start ?? keys[0]!.s;
  const last = domain?.end ?? keys[keys.length - 1]!.s;
  const span = Math.max(last - first, 1e-6);

  return joints.map((joint) => {
    const { minimum, maximum } = channelDomain(keys, joint);
    const range = Math.max(maximum - minimum, 1e-6);
    let path = "";
    for (let index = 0; index <= CURVE_SAMPLES; index += 1) {
      const fraction = index / CURVE_SAMPLES;
      const value = sampleChannel(keys, interpolation, joint, first + span * fraction);
      const x = fraction * viewBoxWidth;
      const y = viewBoxHeight - ((value - minimum) / range) * viewBoxHeight;
      path += `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }
    return { joint, path };
  });
};
