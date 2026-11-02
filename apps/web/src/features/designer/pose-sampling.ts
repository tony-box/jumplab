import type {
  AchievedPoseLandmarks,
  Point2,
  PoseSample,
  Scenario
} from "../../../../../packages/schema/src/index";

export type JointName = "knee" | "hip" | "spine";

/**
 * Outer sanity envelope for the absolute segment angles the sliders author.
 * These are deliberately wider than any rideable posture: the real limits are
 * the bike contacts (saddle, top tube, handlebars, tires, pedals) plus the
 * relative joint bends that Rust enforces.
 */
export const humanPoseLimits: Record<JointName, { min: number; max: number }> = {
  knee: { min: -0.6, max: 2.2 },
  hip: { min: -1.8, max: 1.6 },
  spine: { min: -1.0, max: 2.0 }
};

export const poseAuthoringRange = (scenario: Scenario, joint: JointName) => {
  const scenarioLimits = scenario.rider.joints[joint];
  const humanLimits = humanPoseLimits[joint];
  const minimum = Math.max(scenarioLimits.min, humanLimits.min);
  const maximum = Math.min(scenarioLimits.max, humanLimits.max);
  return minimum <= maximum ? { min: minimum, max: maximum } : humanLimits;
};

export const poseSampleHasReachableLegs = (_scenario: Scenario, sample: PoseSample): boolean =>
  [sample.landmarks.pedalContact, sample.landmarks.knee, sample.landmarks.hip].every(
    (point) => Number.isFinite(point.x) && Number.isFinite(point.y)
  );

export type PoseSamplingState = {
  sample: PoseSample;
  saturated: boolean;
  reason: string | null;
};

const joints: JointName[] = ["knee", "hip", "spine"];

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

const isFinitePoint = (point: Point2 | undefined): point is Point2 =>
  point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y);

const landmarkNames = [
  "pedalContact",
  "ankle",
  "knee",
  "hip",
  "shoulder",
  "elbow",
  "hand",
  "handlebarContact",
  "head"
] as const;

/**
 * Guards against a malformed transport payload without reclamping Rust's
 * already-constrained landmarks (FR-021: Rust owns clamping and geometry).
 */
const sanitizeLandmarks = (
  landmarks: AchievedPoseLandmarks | undefined,
  fallback: Point2
): { landmarks: AchievedPoseLandmarks; allFinite: boolean } => {
  let allFinite = true;
  const safe = {} as AchievedPoseLandmarks;

  for (const name of landmarkNames) {
    const point = landmarks?.[name];
    if (isFinitePoint(point)) {
      safe[name] = point;
    } else {
      allFinite = false;
      safe[name] = fallback;
    }
  }

  return { landmarks: safe, allFinite };
};

export const normalizePoseTargets = (
  scenario: Scenario,
  targets: Record<JointName, number>
): { targets: Record<JointName, number>; saturated: boolean } => {
  let saturated = false;
  const clamped = { ...targets };

  for (const joint of joints) {
    const limits = poseAuthoringRange(scenario, joint);
    const raw = finiteOr(targets[joint], 0);
    const next = clamp(raw, limits.min, limits.max);
    if (next !== raw) {
      saturated = true;
    }
    clamped[joint] = next;
  }

  return { targets: clamped, saturated };
};

/**
 * Trusts Rust's already-clamped achieved targets, arm angles, and landmarks
 * (FR-021) and only substitutes a defensive fallback for non-finite transport
 * values; it never reclamps a valid physics-owned result.
 */ export const sanitizePoseSample = (
  _scenario: Scenario,
  requestedS: number,
  rawSample: PoseSample,
  fallbackTargets: Record<JointName, number>
): PoseSamplingState => {
  const finiteTargets = {
    knee: finiteOr(rawSample.targets.knee, fallbackTargets.knee),
    hip: finiteOr(rawSample.targets.hip, fallbackTargets.hip),
    spine: finiteOr(rawSample.targets.spine, fallbackTargets.spine)
  };
  const nonFiniteTargets =
    !Number.isFinite(rawSample.targets.knee) ||
    !Number.isFinite(rawSample.targets.hip) ||
    !Number.isFinite(rawSample.targets.spine);

  const shoulder = finiteOr(rawSample.derivedArm.shoulder, 0);
  const elbow = finiteOr(rawSample.derivedArm.elbow, 0);
  const nonFiniteArm =
    !Number.isFinite(rawSample.derivedArm.shoulder) || !Number.isFinite(rawSample.derivedArm.elbow);

  const fallbackPoint: Point2 = { x: finiteTargets.hip, y: 0 };
  const { landmarks, allFinite: landmarksFinite } = sanitizeLandmarks(
    rawSample.landmarks,
    fallbackPoint
  );

  const saturated =
    rawSample.derivedArm.constrained || nonFiniteTargets || nonFiniteArm || !landmarksFinite;

  return {
    sample: {
      s: finiteOr(rawSample.s, requestedS),
      targets: finiteTargets,
      derivedArm: {
        shoulder,
        elbow,
        constrained: saturated
      },
      landmarks,
      solverVersion: rawSample.solverVersion
    },
    saturated,
    reason: saturated ? "Constrained to reachable finite limits" : null
  };
};
