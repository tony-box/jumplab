# Implementation Plan: Ground Contact Fidelity

**Branch**: `005-ground-contact-fidelity` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-ground-contact-fidelity/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Make the bike physically respect the ground, and make the workbench show that it does. The solver
replaces its single free-floating wheel ball with one rigid bike body carrying two wheel colliders,
so Rapier resolves non-penetration and real normal forces at both contact points and the body's
pitch follows the surface. Grounded/airborne state and contact force become measured contact
output instead of clearance guesses and penetration-derived proxies. The discontinuous terrain
segments the solver resolves against are exported through WebAssembly and drawn verbatim by the
stage, replacing the six-point schematic that currently disagrees with the simulated surface. The
approach extends behind both wheels at `entry.startX`, while gaps remain true voids with no phantom
edge. The frame anchor is
redefined as the bike body-frame origin so the renderer's existing bike-local geometry lands exactly
on the simulated contact line. Solver, model, protocol, frame-layout, and logical persistence
versions are bumped together, and stored runs carrying an older solver version are automatically
re-solved in place from their saved scenario snapshot.

## Technical Context

**Language/Version**: Rust 1.98.0 (physics core), TypeScript 7.0.2, React 19.2.8

**Primary Dependencies**: Rapier2D 0.35.2, `wasm-bindgen`, Dexie (IndexedDB), Zod via
`@bike-jumper/schema`, Canvas 2D rendering utilities. No new runtime dependency.

**Storage**: Dexie/IndexedDB run artifacts (`apps/web/src/storage/database.ts`,
`apps/web/src/storage/repositories.ts`). Logical persistence contract version 1 to 2 with an
in-place re-solve migration; Dexie database schema version 2 to 3 because versions 1 and 2 already
exist.

**Testing**: `cargo test -p physics-core` (unit, analytical, convergence, determinism, regression),
Vitest (unit, contracts, parity, persistence), Playwright (e2e, visual, accessibility) with canvas
pixel checkpoints

**Target Platform**: Offline-capable modern desktop and tablet browsers; `wasm32-unknown-unknown`
physics core

**Project Type**: Monorepo browser application with shared TypeScript schemas and a Rust/WebAssembly
physics core

**Performance Goals**: Standard scenario benchmark stays within its existing budget; workbench
playback holds at least 55 FPS with zero dropped frames in the standard interaction benchmark. Two
wheel colliders against a small fixed set of static terrain segments remain a trivial island for
Rapier.

**Constraints**: Penetration at most 0.01 m at any reported frame; rendered wheels within 2 px of the
rendered ground line in grounded frames; zero tyre friction, rolling resistance, and aerodynamic drag
retained per constitution; deterministic and reproducible results; rendering must never clamp or
correct simulation output

**Scale/Scope**: One solver contact-body rewrite, one new WASM terrain export plus worker command,
one frame-layout revision (stride 31 to 36), one renderer terrain and anchor correction, one Dexie
schema migration, and five version identifier bumps; scenario schema remains unchanged

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Research Gate

| Principle / Gate | Plan Evidence | Status |
| --- | --- | --- |
| I. Physics fidelity is verifiable | Contact becomes a solved constraint producing real normal forces rather than a penetration-derived display proxy. Rendering is corrected to represent solver state and is explicitly forbidden from repairing it. Tolerances, units, and the retained horizontal-speed approximation are documented and tested. | PASS (with documented deviation) |
| II. Rider and bike form one dynamic system | Both wheel contacts transmit ground reaction into one rigid combined mass, but rider movement and suspension loading remain uncoupled. Feature 005 has a bounded temporary exception owned by the project maintainer; it expires before those controls may be claimed to affect takeoff, flight, landing, or loads, and must be retired by the registered coupled-physics follow-up specification. | EXCEPTION |
| III. Teach through visible cause and effect | Per-frame grounded state, per-wheel normal force, and minimum clearance become measured, inspectable outputs. Touchdown becomes visible in the animation, and no value is invented when unavailable. | PASS |
| IV. Deterministic and reproducible | Fixed time step and substeps are unchanged and contact resolution is deterministic. Solver, model, frame-layout, and persistence versions are bumped so old and new runs are distinguishable, and each fixed defect is captured as a minimal regression scenario before correction. | PASS |
| V. Focused 2D experience | Remains side-view 2D. Added complexity is one extra collider plus measured contact channels, all of which change computed motion rather than adding ornamental realism. | PASS |
| VI. Wireframes are the UX contract | No screen structure, `data-od-id` region, or primary action changes. Only the drawn ground profile and bike placement change, and both gain deterministic canvas checkpoints for Playwright assertions. | PASS |
| Development quality gates | Solver tests cover constraints, takeoff, trajectory, landing, slope pitch, lip-crest stability, deterministic airborne rotation, and energy accounting including external work from the speed constraint. Story-level desktop/tablet Playwright checks cover stable IDs, accessibility state, nonblank output, framing, overlap, clipping, overflow, layout shifts, and deterministic pixels. | PASS |

### Post-Design Re-Check

Re-evaluated after Phase 1. All gates above still hold, including the explicitly bounded Principle
II exception. The design adds no new dependency, keeps the excluded-effects list intact, and
confines new complexity to the contact body, segmented terrain export, and frame-layout revision.
Supporting evidence is recorded in [research.md](research.md),
[data-model.md](data-model.md), and the contracts under [contracts/](contracts/).

### Delivery Coverage

| Delivery boundary | Requirements and criteria completed |
| --- | --- |
| Foundation | FR-011, FR-014; canonical defects captured before correction and all five version identities established |
| User Story 1 MVP | FR-001 to FR-005, FR-009, FR-010, FR-012; SC-001, SC-002, SC-005; physics, angular/energy, desktop/tablet, stable-ID, accessibility, and rendered-output gates pass |
| User Story 2 | Landing acceptance cases and SC-006; deterministic last-airborne and first-grounded visual evidence passes |
| User Story 3 | FR-006 to FR-008; SC-003; rendered segments, voids, and wheel pixels agree with solver output |
| Regeneration | FR-015 and SC-008; current, legacy, corrupt-stride, schema-migration, and rollback paths pass |
| Final gate | FR-013, SC-004, SC-007; documentation, every canonical scenario, benchmarks, accessibility audit, and full verification pass |

## Project Structure

### Documentation (this feature)

```text
specs/005-ground-contact-fidelity/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── frame-layout-v2.md
│   ├── terrain-profile.md
│   └── run-regeneration.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
crates/physics-core/
├── src/
│   ├── solver.rs           # Two-wheel contact body, measured contact outputs, frame stride 36
│   ├── bike.rs             # Contact-point geometry; replaces the detect_takeoff clearance heuristic
│   ├── geometry.rs         # Segmented terrain generation, void-aware distance queries
│   ├── lib.rs              # New terrainProfileJson WASM export
│   └── version.rs          # SOLVER_VERSION, MODEL_VERSION, FRAME_LAYOUT_VERSION bumps
└── tests/
    ├── analytical.rs       # Resting equilibrium and ballistic separation reference cases
    ├── determinism.rs      # Golden hashes regenerated for the new solver version
    └── regression.rs       # Ground-contact regression scenarios

packages/schema/
└── src/
    ├── application.ts        # Run artifact and model metadata (terrain sample step)
    ├── run-result.ts         # Frame layout and contact field descriptors
    ├── worker-protocol.ts    # terrain command request/response
    └── migrations/
        └── compatibility.ts  # frame-layout and persistence version 2 registries

apps/web/
├── src/
│   ├── app/version-manifest.ts        # frameLayout, persistence, solver, model bumps
│   ├── solver/
│   │   ├── gateway.ts                 # terrain() call and regeneration entry point
│   │   ├── physics.worker.ts          # Frame layout v2 descriptor
│   │   └── frame-buffer.ts            # Contact field access
│   ├── storage/
│   │   ├── database.ts                # Dexie schema version 3 migration
│   │   └── repositories.ts            # replaceSolution() for in-place regeneration
│   ├── features/workbench/
│   │   ├── useWorkbench.ts            # Legacy-run regeneration on load
│   │   └── solve-run.ts               # Model metadata assembly
│   └── rendering/
│       ├── canvas/terrain-profile.ts  # Consume the solver polyline; drop the 6-point schematic
│       ├── canvas/workbench-stage.ts  # Anchor and pitch-sign correction, terrain draw
│       └── geometry/bike-geometry.ts  # Bike-local origin contract
└── tests/
    ├── integration/persistence.test.ts
    └── unit/workbench.test.tsx

tests/
├── contracts/    # compatibility registries, physics-worker frame layout
├── parity/       # native to WASM parity
├── e2e/          # workbench ground-contact journeys
├── visual/       # desktop and tablet stage snapshots
└── fixtures/     # scenarios and expected run results (regenerated)

docs/physics/
├── model.md        # Contact model, anchor definition, tolerances
└── limitations.md  # Retained approximations and validated ranges
```

**Structure Decision**: Retain the existing monorepo layout. Physics correctness lands in
`crates/physics-core`, the shared contract in `packages/schema`, and presentation plus persistence in
`apps/web`. No new package or top-level directory is introduced; this feature is a correction across
existing seams rather than a new subsystem.

## Complexity Tracking

> Filled because the Constitution Check records one documented deviation.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Horizontal speed remains pinned to the scenario entry speed each step (Principle I: motion should follow from forces). | The spec explicitly scopes slope-driven acceleration out of this feature. Removing the pin at the same time as the contact rewrite would change every trajectory and metric at once, making it impossible to attribute regressions to the contact fix. Energy tests account for the speed constraint as external work. | Freeing horizontal speed now would require tyre friction and drivetrain models that the constitution currently excludes, expanding scope far beyond "stop falling through the ground". |
| Rider posture, active movement, and suspension loading remain uncoupled from the rigid contact body (Principle II). | The immediate defect requires honest ground topology and two-wheel support. Adding articulated rider mass transfer and suspension dynamics simultaneously would prevent isolated validation. The project maintainer owns this feature-005-only exception. It expires before any claim that rider or suspension controls affect jump dynamics and is retired by the required follow-up in `docs/architecture/follow-up-features.md`. | Pretending current pose controls affect contact would violate data-source honesty; implementing full coupled dynamics here would turn a bounded contact correction into a separate physics-productionization feature. |
| Frame layout stride grows from 31 to 36 and five version identifiers are bumped together. | Measured contact state cannot be represented in the existing layout, and the terrain command changes the protocol. Solver, model, protocol, frame-layout, and logical persistence identities must remain mutually consistent; scenario schema stays at 1. | Reusing `contactImpulse` alone would hide which wheel is loaded and force the interface to infer clearance, reintroducing exactly the invented-value problem the constitution forbids. |

**Deviation boundary**: The retained horizontal-speed pin MUST be restated in
`docs/physics/limitations.md` as a bounded approximation with its validated range, and MUST NOT be
described as physically derived. It is expected to be removed by a future coupled-dynamics feature.
