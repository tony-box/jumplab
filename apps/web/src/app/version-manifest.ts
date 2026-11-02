import { PROTOCOL_VERSION } from "../../../../packages/schema/src/index";

export const versionManifest = Object.freeze({
  app: "0.1.0",
  schema: 3,
  protocol: PROTOCOL_VERSION,
  frameLayout: 2,
  persistence: 2,
  model: "rigid-two-wheel-contact-v4-geometry-v1-mass-distribution-v1",
  solver: "rapier-0.35.2-two-wheel-contact-v5-geometry-v1-mass-distribution-v1",
  rust: "1.98.0",
  assumptions: "default-assumptions-v1",
  units: "si-v1",
  metricDefinitions: "core-metrics-v1",
  excludedEffects: Object.freeze([
    "aerodynamic drag",
    "tire deformation",
    "coupled suspension bodies",
    "rider motor forces"
  ]),
  validationSource: "representative-fixture",
  dependencies: Object.freeze({ react: "19.2.8", vite: "8.2.2", rapier2d: "0.35.2" })
});
