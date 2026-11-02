import { scenarioSchema, type Scenario } from "../../../../../packages/schema/src/index";
import standardScenarioJson from "../../../../../tests/fixtures/scenarios/standard-v1.json";

/**
 * Modest tabletop the workbench opens with before a preset or saved run is chosen.
 * Rider, bike, pose, and solver settings stay on the shared baseline.
 */
export const defaultWorkbenchScenario: Scenario = scenarioSchema.parse({
  ...standardScenarioJson,
  id: "0f2c9a7e-5d63-4a18-9b74-2c3e6f1a8d40",
  name: "Basic Tabletop",
  jump: {
    kind: "table",
    lipHeight: 0.9,
    lipAngle: 0.62,
    transitionLength: 2,
    gap: 4,
    stepDelta: 0,
    landingAngle: 0.3,
    landingLength: 6,
    rollout: 5
  },
  entry: {
    speed: 7,
    startX: -5
  }
});
