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

Dependency upgrades require lockfile integrity and license checks, a vulnerability audit, native/WASM
hash parity, deterministic visual baselines, browser workflows, and regenerated evidence. Solver,
model, schema, protocol, frame-layout, app, Rust, and major dependency versions are published in the
TypeScript and Rust manifests.

## Current boundary

The current boundary is scenario schema 3, worker protocol 3, frame layout 2, persistence 2,
geometry model 1, and mass-distribution model 1. The published model is
`rigid-two-wheel-contact-v4-geometry-v1-mass-distribution-v1`; the solver is
`rapier-0.35.2-two-wheel-contact-v5-geometry-v1-mass-distribution-v1`.

Scenario v1 migrates through v2 to v3, and v2 migrates deterministically to v3. Migration preserves
existing identifiers, bike values, and pose targets while materializing explicit measured geometry;
derived geometry issues, contacts, envelopes, CoG, and inertia are recomputed rather than persisted.
Protocol v1 similarly migrates through v2 to v3. Frame layout and persistence remain at version 2.

`/designer` is the canonical authoring route. `/pose` is a compatibility alias implemented as
replacement navigation and is retained in the offline precache so old bookmarks do not add a
history entry or require network access.

## Decision lifecycle

Allowed transitions are `draft -> provisionally-approved -> evidence-complete -> approved ->
superseded`. Evidence must be no more than 60 days old. Exceptions require an owner, rationale,
expiry, and affected gates; expired exceptions fail validation. Final approval requires explicit
maintainer sign-off. Supersession names the replacement decision and retains the prior record.

## Revisit triggers

- Any parity, determinism, worker isolation, offline, accessibility, license, or security gate fails.
- A supported file or protocol version cannot preserve physical meaning.
- Benchmark thresholds regress without a deterministic remediation.
- A critical vulnerability cannot be patched within the pinned stack.
- Product scope adds collaboration, server authority, 3D, or a materially different physics model.

The fallback is the TypeScript/Rapier worker candidate only after its deterministic ownership and all
hard gates are re-evaluated. No fallback may silently change result meaning.
