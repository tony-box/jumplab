import type { JointName } from "./pose-sampling";

export type JointRange = { min: number; max: number };
export type PoseFeasibleLimits = Record<JointName, JointRange>;
export type PoseTargets = Record<JointName, number>;

/** Answers whether the whole rider still reaches its contacts for a candidate pose. */
export type PoseProbe = (targets: PoseTargets) => Promise<boolean>;

/** Authoring grid, so a reported bound is always a value a control can select. */
const STEP = 0.01;
/** Attempts to push a bound further by re-choosing the other joints. */
const EXTEND_ROUNDS = 7;

const onGrid = (index: number): number => Number((index * STEP).toFixed(2));

/**
 * Largest value this joint can take toward `endpoint` while the others hold.
 * The search walks the authoring grid rather than bracketing from the joint's
 * current value, so the bound depends only on the other joints and stays put
 * while this one is being dragged.
 */
const boundedBy = async (
  targets: PoseTargets,
  joint: JointName,
  endpoint: number,
  probe: PoseProbe,
  direction: 1 | -1
): Promise<number> => {
  if (await probe({ ...targets, [joint]: endpoint })) {
    return endpoint;
  }

  const current = targets[joint];
  let feasible = direction === 1 ? Math.floor(current / STEP) : Math.ceil(current / STEP);
  let blocked = Math.round(endpoint / STEP);
  let confirmed = false;

  while (Math.abs(blocked - feasible) > 1) {
    const middle = Math.round((feasible + blocked) / 2);
    if (await probe({ ...targets, [joint]: onGrid(middle) })) {
      feasible = middle;
      confirmed = true;
    } else {
      blocked = middle;
    }
  }

  // Only report a step the search actually proved reachable.
  return confirmed ? onGrid(feasible) : current;
};

/**
 * Narrows each joint's declared range to the span still reachable while the
 * other joints hold their current values, so coupled reach limits become
 * visible before a user pushes into one.
 */
export const feasiblePoseLimits = async (
  declared: PoseFeasibleLimits,
  targets: PoseTargets,
  probe: PoseProbe
): Promise<PoseFeasibleLimits> => {
  const joints: JointName[] = ["knee", "hip", "spine"];
  const limits = {} as PoseFeasibleLimits;

  const anchored = {
    knee: Math.min(declared.knee.max, Math.max(declared.knee.min, targets.knee)),
    hip: Math.min(declared.hip.max, Math.max(declared.hip.min, targets.hip)),
    spine: Math.min(declared.spine.max, Math.max(declared.spine.min, targets.spine))
  };

  // One check for the pose itself; each joint's search then starts from it.
  if (!(await probe(anchored))) {
    for (const joint of joints) {
      limits[joint] = { min: anchored[joint], max: anchored[joint] };
    }
    return limits;
  }

  for (const joint of joints) {
    limits[joint] = {
      min: await boundedBy(anchored, joint, declared[joint].min, probe, -1),
      max: await boundedBy(anchored, joint, declared[joint].max, probe, 1)
    };
  }

  return limits;
};

/**
 * Widest span each joint can ever occupy across any combination of the other
 * joints. Everything outside this is unreachable no matter how the rest of the
 * pose is arranged, so the outer arc never implies a pose that cannot exist.
 */
export const poseEnvelopeLimits = async (
  declared: PoseFeasibleLimits,
  unboundedProbe: PoseProbe,
  gridSteps = 6,
  maxProbes = 1_200
): Promise<PoseFeasibleLimits | null> => {
  // Every probe is a round trip to the physics worker, so the search has a hard budget.
  let probes = 0;
  const probe: PoseProbe = (targets) => {
    probes += 1;
    if (probes > maxProbes) throw new Error("pose envelope probe budget exhausted");
    return unboundedProbe(targets);
  };
  const joints: JointName[] = ["knee", "hip", "spine"];
  const axisOf = (joint: JointName) => {
    const { min, max } = declared[joint];
    return Array.from(
      { length: gridSteps + 1 },
      (_, index) => min + ((max - min) * index) / gridSteps
    );
  };

  const extremes = new Map<JointName, { minAt: PoseTargets; maxAt: PoseTargets }>();

  for (const knee of axisOf("knee")) {
    for (const hip of axisOf("hip")) {
      for (const spine of axisOf("spine")) {
        const targets = { knee, hip, spine };
        if (!(await probe(targets))) continue;

        for (const joint of joints) {
          const seen = extremes.get(joint);
          if (!seen) {
            extremes.set(joint, { minAt: targets, maxAt: targets });
            continue;
          }
          if (targets[joint] < seen.minAt[joint]) seen.minAt = targets;
          if (targets[joint] > seen.maxAt[joint]) seen.maxAt = targets;
        }
      }
    }
  }

  if (extremes.size === 0) {
    return null;
  }

  /**
   * Pushes one bound outward, re-searching the other joints whenever the
   * current companions run out of room. A grid seed alone under-reports,
   * because the pose that reaches an extreme often needs different companions.
   */
  const envelopeBound = async (
    joint: JointName,
    direction: 1 | -1,
    seed: PoseTargets
  ): Promise<number> => {
    const endpoint = direction === 1 ? declared[joint].max : declared[joint].min;
    const span = declared[joint].max - declared[joint].min;
    const [first, second] = joints.filter((other) => other !== joint) as [JointName, JointName];

    let companions = seed;
    let best = await boundedBy(companions, joint, endpoint, probe, direction);
    let reach = span / gridSteps;

    for (let round = 0; round < EXTEND_ROUNDS; round += 1) {
      if (reach < STEP) break;

      const proposed = best + direction * reach;
      const target = direction === 1 ? Math.min(endpoint, proposed) : Math.max(endpoint, proposed);
      if (direction === 1 ? target <= best : target >= best) {
        reach /= 2;
        continue;
      }

      let found: PoseTargets | null = null;
      for (const a of axisOf(first)) {
        for (const b of axisOf(second)) {
          const candidate = { ...companions, [first]: a, [second]: b, [joint]: target };
          if (await probe(candidate)) {
            found = candidate;
            break;
          }
        }
        if (found) break;
      }

      // A miss only means this step overshot, so close in rather than stop.
      if (!found) {
        reach /= 2;
        continue;
      }

      companions = found;
      const next = await boundedBy(found, joint, endpoint, probe, direction);
      if (direction === 1 ? next > best : next < best) best = next;
    }

    return best;
  };

  const envelope = {} as PoseFeasibleLimits;
  for (const joint of joints) {
    const seen = extremes.get(joint)!;
    envelope[joint] = {
      min: await envelopeBound(joint, -1, seen.minAt),
      max: await envelopeBound(joint, 1, seen.maxAt)
    };
  }

  return envelope;
};
