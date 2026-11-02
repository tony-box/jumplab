# Follow-up Feature Boundaries

## Physics productionization

Own coupled bicycle/rider bodies, suspension and tire/contact models, calibration datasets,
sensitivity analysis, expanded golden cases, and production performance budgets. It consumes the v1
scenario and worker boundaries but must publish a new model version.

### Required coupled rider and suspension dynamics specification

Feature 005 may temporarily model the rider and bike as one rigid mass only to establish honest
two-wheel non-penetration, measured contact loads, and shared terrain geometry. A follow-up
specification is required before the product claims that rider posture, movement, suspension setup,
or frame type changes jump dynamics. That specification must model rider position and weight
transfer, active rider movement, suspension compression and rebound, and their coupled effects on
takeoff, airborne rotation, landing, and ground loads. It owns retirement of feature 005's temporary
Principle II exception and must publish a new model version with analytical, energy, angular-motion,
and regression validation.

## Workbench

Own complete input families, baseline comparison, camera/overlay persistence, production-worker
integration, warnings, and run management. It may orchestrate solves but cannot calculate physics.

## Pose editor

Own complete distance-key authoring, reusable clips, validation feedback, and preview controls. All
interpolation, joint limits, and constrained limbs remain Rust-owned.

## Reporting, library, and validation

Own durable run comparison, exports, reusable scenario components, provenance-rich charts/tables,
and analytical validation views. These should be separate specifications because their persistence,
sharing, and acceptance criteria differ from the workbench spike.
