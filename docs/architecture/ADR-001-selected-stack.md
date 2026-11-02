# ADR-001: Selected Stack for Bounded Validation Spikes

- Status: Provisional after maintainer sign-off
- Date: 2026-08-24
- Decision record: `docs/architecture/stack-decision.json`
- Rubric: `docs/architecture/stack-rubric.json`
- Evidence catalog: `docs/architecture/evidence/catalog.json`

## Context

This project must validate deterministic coupled rider-and-bike physics, responsive browser workflows,
offline operation after first load, and auditable boundaries before production feature implementation.
The selected stack must satisfy hard gates from `specs/001-stack-evaluation/spec.md` and remain
traceable through explicit evidence.

## Decision

Select the integrated stack represented by `cand-selected-stack`:

- UI and app shell: React 19 + strict TypeScript + Vite static build.
- Physics kernel: Rust 2024 + Rapier 2D enhanced determinism compiled to WASM.
- Compute boundary: dedicated worker with versioned protocol and stale-run rejection.
- Persistence and offline: IndexedDB via Dexie + service-worker-cached shell assets.
- Validation and quality gates: Zod runtime schemas, Vitest, Playwright project matrix, and scripted
  stack decision validation artifacts.

## Rejected Alternatives

- `cand-js-rapier-worker`: viable but lower confidence in deterministic preprocessing ownership and
  boundary clarity.
- `cand-main-thread-mixed`: rejected by mandatory worker-isolation and determinism hard gates.

## Ownership Boundaries

- `crates/physics-core`: authoritative physical calculations, deterministic preprocessing,
  interpolation, and solver outputs.
- `packages/schema`: trust-boundary schemas for scenarios, run results, worker protocol, and decision
  artifacts.
- `apps/web`: presentation, interaction, persistence orchestration, and immutable replay.
- `scripts/validate-stack-decision.mjs`: rubric scoring, hard-gate enforcement, evidence traceability,
  and lifecycle stop-work checks.

## Risks and Mitigations

- Rust/WASM integration complexity:
  Mitigation: pinned toolchains, explicit build orchestration, and boundary tests.
- Determinism regressions across runtimes:
  Mitigation: parity gates across native/WASM/browsers and canonical hashing checks.
- Pending benchmark evidence:
  Mitigation: retain provisional status until benchmark and spike gates are executed.

## Consequences

- US2 and US3 implementation can proceed only after `docs/architecture/stack-decision.json` reaches
  `provisionally-approved` and validator output confirms all hard gates pass.
- Final approval remains blocked until post-spike evidence transitions the decision through
  `evidence-complete` to `approved`.
