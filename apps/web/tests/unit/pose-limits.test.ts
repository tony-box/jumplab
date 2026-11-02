import { describe, expect, it, vi } from "vitest";

import {
  feasiblePoseLimits,
  poseEnvelopeLimits,
  type PoseTargets
} from "../../src/features/designer/pose-limits";

const declared = {
  knee: { min: -0.1, max: 1.7 },
  hip: { min: -1.2, max: 1.1 },
  spine: { min: -0.6, max: 1.1 }
};

const targets: PoseTargets = { knee: 0.3, hip: -0.5, spine: 0.75 };

describe("feasible pose limits", () => {
  it("keeps declared bounds when the whole range stays reachable", async () => {
    const probe = vi.fn(async () => true);

    expect(await feasiblePoseLimits(declared, targets, probe)).toEqual(declared);
    // One shared check for the pose, then a reachable endpoint per joint side.
    expect(probe).toHaveBeenCalledTimes(7);
  });

  it("reports the reachable span when a coupled limit blocks part of the range", async () => {
    const probe = async (candidate: PoseTargets) => candidate.hip <= 0.4;

    const limits = await feasiblePoseLimits(declared, targets, probe);

    expect(limits.hip.min).toBe(-1.2);
    expect(limits.hip.max).toBeGreaterThan(0.38);
    expect(limits.hip.max).toBeLessThanOrEqual(0.4);
    expect(limits.knee).toEqual(declared.knee);
  });

  it("never reports a bound the authoring step cannot select", async () => {
    const probe = async (candidate: PoseTargets) =>
      candidate.spine >= -0.237 && candidate.spine <= 0.923;

    const { spine } = await feasiblePoseLimits(declared, targets, probe);

    expect(await probe({ ...targets, spine: spine.min })).toBe(true);
    expect(await probe({ ...targets, spine: spine.max })).toBe(true);
    expect(spine.min * 100).toBeCloseTo(Math.round(spine.min * 100), 6);
    expect(spine.max * 100).toBeCloseTo(Math.round(spine.max * 100), 6);
  });

  it("reports a bound the editor accepts even when the boundary sits between steps", async () => {
    // Boundaries deliberately land just inside a step so an un-confirmed
    // rounded bound would be one step optimistic.
    for (const boundary of [0.9501, 0.9499, 0.95, 1.0500001, 0.4499999]) {
      const probe = async (candidate: PoseTargets) => candidate.knee <= boundary;
      const { knee } = await feasiblePoseLimits(declared, targets, probe);

      expect(await probe({ ...targets, knee: knee.max })).toBe(true);
      expect(knee.max).toBeGreaterThan(boundary - 0.03);
    }
  });

  it("collapses a joint whose current value is already blocked", async () => {
    const limits = await feasiblePoseLimits(declared, targets, async () => false);

    expect(limits.knee).toEqual({ min: 0.3, max: 0.3 });
    expect(limits.hip).toEqual({ min: -0.5, max: -0.5 });
  });

  it("reports the same bounds for a joint wherever that joint currently sits", async () => {
    // Boundaries deliberately fall between authoring steps.
    const probe = async (candidate: PoseTargets) =>
      candidate.knee >= -0.083 && candidate.knee <= 1.237 && candidate.hip <= 0.4;

    const seen = new Set<string>();
    for (const knee of [-0.08, 0.1, 0.33, 0.5, 0.77, 0.9, 1.23]) {
      const limits = await feasiblePoseLimits(declared, { ...targets, knee }, probe);
      seen.add(`${limits.knee.min}..${limits.knee.max}`);
    }

    expect([...seen]).toEqual(["-0.08..1.23"]);
  });
});

describe("pose envelope limits", () => {
  it("bounds each joint to what some combination of the others can reach", async () => {
    // Hip is only ever reachable up to 0.25, and only when the knee is low.
    const probe = async (candidate: PoseTargets) =>
      candidate.hip <= 0.25 && candidate.knee <= 1.2 && candidate.hip - candidate.knee <= 0.1;

    const envelope = await poseEnvelopeLimits(declared, probe);

    expect(envelope).not.toBeNull();
    expect(envelope!.hip.max).toBeGreaterThan(0.2);
    expect(envelope!.hip.max).toBeLessThanOrEqual(0.25);
    expect(envelope!.knee.max).toBeGreaterThan(1.15);
    expect(envelope!.knee.max).toBeLessThanOrEqual(1.2);
    // The bound is only claimed because some companion pose achieves it.
    expect(await probe({ knee: envelope!.hip.max, hip: envelope!.hip.max, spine: 0 })).toBe(true);
  });

  it("never reports a bound outside the declared range", async () => {
    const envelope = await poseEnvelopeLimits(declared, async () => true);

    expect(envelope).toEqual(declared);
  });

  it("returns nothing when no combination is reachable", async () => {
    expect(await poseEnvelopeLimits(declared, async () => false)).toBeNull();
  });

  it("finds a bound that only a narrow companion pose can reach", async () => {
    // Hip may reach 0.6, but only in a thin corridor the coarse grid misses,
    // so the search has to re-choose the other joints to get there.
    const probe = async (candidate: PoseTargets) => {
      if (candidate.hip <= -0.4) return true;
      return candidate.hip <= 0.6 && Math.abs(candidate.knee - candidate.hip * 2) <= 0.12;
    };

    const envelope = await poseEnvelopeLimits(declared, probe);

    expect(envelope!.hip.max).toBeGreaterThan(0.5);
    expect(envelope!.hip.max).toBeLessThanOrEqual(0.6);
    expect(await probe({ knee: envelope!.hip.max * 2, hip: envelope!.hip.max, spine: 0 })).toBe(
      true
    );
  });
});
