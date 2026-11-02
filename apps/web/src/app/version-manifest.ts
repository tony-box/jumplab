import {
  FRAME_LAYOUT_VERSION,
  MODEL_VERSION,
  PROTOCOL_VERSION,
  SCENARIO_SCHEMA_VERSION,
  SOLVER_VERSION
} from "../../../../packages/schema/src/index";

export const versionManifest = Object.freeze({
  app: "0.2.0",
  schema: SCENARIO_SCHEMA_VERSION,
  protocol: PROTOCOL_VERSION,
  frameLayout: FRAME_LAYOUT_VERSION,
  persistence: 2,
  model: MODEL_VERSION,
  solver: SOLVER_VERSION,
  rust: "1.98.0",
  assumptions: "default-assumptions-v1",
  units: "si-v1",
  metricDefinitions: "core-metrics-v2",
  excludedEffects: Object.freeze([
    "aerodynamic drag",
    "tire friction and deformation",
    "suspension compression",
    "articulated limb dynamics"
  ]),
  dependencies: Object.freeze({ react: "19.2.8", vite: "8.2.2", rapier2d: "0.35.2" })
});
