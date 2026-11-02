import type { Scenario } from "../../../packages/schema/src/index";
import standardScenario from "../scenarios/standard-v1.json";

const baseScenario = standardScenario as Scenario;

/** Minimum supported rider proportions for boundary geometry checks. */
export const minimumRiderScenario = (): Scenario => ({
  ...structuredClone(baseScenario),
  rider: {
    ...structuredClone(baseScenario.rider),
    height: 1.2,
    legRatio: 0.35,
    armRatio: 0.3
  }
});

/** Maximum supported rider proportions for boundary geometry checks. */
export const maximumRiderScenario = (): Scenario => ({
  ...structuredClone(baseScenario),
  rider: {
    ...structuredClone(baseScenario.rider),
    height: 2.2,
    legRatio: 0.6,
    armRatio: 0.5
  }
});

const bikeOverridesByFrame = {
  rigid: { frameType: "rigid" as const, rearShock: null },
  hardtail: { frameType: "hardtail" as const, rearShock: null },
  full: {
    frameType: "full" as const,
    rearShock: { travel: 0.14, sag: 0.03, springRate: 22000, damping: 1200 }
  }
};

/** A scenario using the requested rigid/hardtail/full-suspension bike frame. */
export const bikeFrameScenario = (frameType: keyof typeof bikeOverridesByFrame): Scenario => ({
  ...structuredClone(baseScenario),
  bike: {
    ...structuredClone(baseScenario.bike),
    ...bikeOverridesByFrame[frameType]
  }
});
