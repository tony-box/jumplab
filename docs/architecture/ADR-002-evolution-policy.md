# ADR-002: Stack Evolution and Compatibility Policy

- Status: Active
- Owner: project maintainer
- Applies to: scenario files, worker protocol, frame layout, persistence, solver/model versions, and
  pinned dependencies

## Policy

Rust owns physical meaning and generated results. The schema package owns serialized boundaries and
compatibility registries. The web app owns interaction, storage orchestration, and display only.

Every boundary change increments its version, adds a registry entry, and supplies a deterministic
migration or an explicit rejection. Migrations must preserve canonical scenario meaning and must run
before persistence commit. Removing a supported version requires a superseding decision.

Dependency upgrades require a clean `npm audit`, native/WASM hash parity, the physics acceptance
tests, and passing browser workflows. Solver,
model, schema, protocol, frame-layout, app, Rust, and major dependency versions are published in the
TypeScript and Rust manifests.

## Current boundary

The current boundary is scenario schema 4, worker protocol 4, frame layout 3, telemetry layout 2,
geometry model 1 and mass-distribution model 2. The model is
`two-body-rider-coupling-v1-geometry-v1-mass-distribution-v2`; the solver is
`rapier-0.35.2-two-body-v6-geometry-v1-mass-distribution-v2`. The Rust core publishes these in
`versionsJson`, and the worker refuses a core whose versions or layouts differ from the app's.

Scenarios migrate step by step from v1 to v4; a step that doesn't advance the version is an error,
not a loop. The v3→v4 step derives circular-arc kicker lengths, replaces the old PD gains with the
rider coupling and instinct defaults, and raises the physics rate to at least 240 Hz. Stored runs
are never migrated: their snapshot hash is checked against the stored, unmigrated scenario, and runs
from older frame layouts are re-solved from that snapshot.
`/designer` is the canonical authoring route. `/pose` is a compatibility alias implemented as
replacement navigation and is retained in the offline precache so old bookmarks do not add a
history entry or require network access.

## Revisit triggers

- Any parity, determinism, worker isolation, offline, accessibility, license, or security gate fails.
- A supported file or protocol version cannot preserve physical meaning.
- Benchmark thresholds regress without a deterministic remediation.
- A critical vulnerability cannot be patched within the pinned stack.
- Product scope adds collaboration, server authority, 3D, or a materially different physics model.
