# Implementation Plan: Coherent Rider and Bike Geometry

**Branch**: `003-rider-bike-geometry` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-rider-bike-geometry/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Replace the independently drawn Pose and Workbench figures with one deterministic rider/bicycle geometry contract. The Rust pose sampler becomes authoritative for interpolated and clamped joint targets, pedal-anchored leg kinematics, handlebar-constrained shoulder/elbow reach, and achieved bike-local rider/contact landmarks. Solver frame telemetry appends the sampled targets and landmarks so immutable runs are self-contained for replay. Shared TypeScript rendering modules consume those landmarks and derive only the remaining representative bicycle frame paths from documented schematic proportions. Numeric physics/geometry contracts, worker compatibility tests, browser workflows, canvas pixel checks, and desktop/tablet snapshots verify connected anatomy, contacts, cross-view parity, source honesty, and framing.

## Technical Context

**Language/Version**: TypeScript 7.0.2, React 19.2.8, Rust 1.98.0 (edition 2024), WebAssembly target `wasm32-unknown-unknown`

**Primary Dependencies**: Existing React Router 8.3.0, Zustand 5.0.15, Zod 4.4.3, Rapier2D 0.35.2, `@bike-jumper/schema`, Canvas 2D viewport utilities, Lucide React 0.554.0

**Storage**: Existing session-scoped Zustand state and Dexie run/scenario artifacts; no new store or migration

**Testing**: Cargo unit/regression tests, Vitest schema/contract/component tests, Playwright browser and visual tests with canvas pixel checks

**Target Platform**: Offline-capable modern desktop and tablet browsers; deterministic native Rust tests and browser WebAssembly execution

**Project Type**: Monorepo browser application with shared TypeScript schemas and a Rust/WebAssembly physics core

**Performance Goals**: Preserve responsive pose editing and playback at the existing display rate; pure landmark derivation remains linear in a constant number of rider/bike points and adds no solver invocation during render, scrub, resize, or navigation

**Constraints**: Focused side-view 2D; deterministic and finite coordinates; visuals consume rather than repair solver state; no new physical controls; no network dependency; frame readers remain compatible with older name-based layouts that omit pose-target fields; stable stage dimensions and no page-wide overflow at supported viewports

**Scale/Scope**: One extended Rust pose-kinematics result, two Canvas stages, one additive solver frame contract, one shared web drawing/representative-bike model, existing scenarios/presets/runs, three frame configurations, and neutral/authored/constrained/interpolated checkpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

| Principle / Gate | Plan Evidence | Status |
| ---------------- | ------------- | ------ |
| I. Physics fidelity is verifiable | Rust `sample_pose` owns interpolation, clamping, full rider kinematics, contacts, and derived arm angles; frame telemetry records sampled targets and achieved landmarks rather than recalculating them in the renderer. Geometry formulas, joint signs, assumptions, units, and tolerances are documented and tested. | PASS |
| II. Rider and bike form one dynamic system | Rider landmarks use scenario dimensions, sampled pose, and explicit hand/pedal contacts. Existing physical fields remain solver-owned; schematic display proportions do not become physical controls. | PASS |
| III. Teach through visible cause and effect | Pose and Workbench consume the same sampled posture. Measured/calculated run values remain distinguishable from representative bike landmarks, and no safety or coaching claim is added. | PASS |
| IV. Deterministic and reproducible | Immutable run frames gain sampled targets and achieved bike-local landmarks needed to reproduce the displayed rider; layout remains versioned and name-addressed. Fixed checkpoints make output reproducible. | PASS |
| V. Focused 2D experience | The design stays side-view 2D, uses constant-size geometry, and does not add ornamental detail or new dimensions. | PASS |
| VI. Wireframes are the UX contract | Existing Workbench/Pose structure, primary actions, `data-od-id` values, keyboard behavior, and responsive layouts remain unchanged; changed canvases receive deterministic Playwright pixel and snapshot coverage. | PASS |
| Development quality gates | Physics/frame changes receive Rust and worker contract tests; UI changes receive unit, E2E, accessibility, desktop/tablet pixel, clipping, and layout checks. | PASS |

No constitution violations or exceptions are required.

## Project Structure

### Documentation (this feature)

```text
specs/003-rider-bike-geometry/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/
│   ├── geometry-contract.md
│   └── validation-matrix.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/src/
├── features/
│   ├── pose/                         # Pose sampling, editor state, stage wrapper
│   └── workbench/                    # Frame playback, frame-field reads, stage wrapper
├── rendering/
│   ├── geometry/                     # Shared landmark adapters, schematic bike paths, drawing
│   └── canvas/
│       ├── pose-stage.ts             # Authored/achieved pose presentation
│       └── workbench-stage.ts        # Run-frame presentation in bike-local coordinates
└── solver/
  ├── physics.worker.ts             # Additive named frame-layout fields
  ├── fixture.worker.ts             # Representative compatibility data
  └── frame-buffer.ts               # Name-based layout reader

packages/schema/
├── src/run-result.ts                 # Existing versioned frame-layout contract
└── tests/                             # Layout and run-result compatibility

crates/physics-core/
├── src/
│   ├── pose.rs                       # Authoritative interpolation and joint clamping
│   ├── geometry.rs                   # Physical segments and full rider/contact kinematics
│   └── solver.rs                     # Self-contained sampled pose targets/landmarks per frame
└── tests/                             # Determinism and pose/frame regression coverage

apps/web/tests/unit/                   # Geometry and component contracts
tests/
├── contracts/                        # Worker/frame-layout compatibility
├── e2e/                              # Pose-to-Workbench and accessibility workflows
└── visual/                           # Deterministic canvas checks and snapshots
```

**Structure Decision**: Extend the existing web/schema/Rust monorepo boundaries. Rust owns sampled physical pose values, joint clamping, rider/contact landmarks, and finite constrained results; the schema owns additive PoseSample and named frame contracts; shared pure web rendering modules adapt those landmarks and own only representative bicycle paths and drawing primitives. Pose and Workbench remain feature wrappers over those shared modules rather than duplicating geometry or kinematics.

### Post-Design Gate

Phase 1 keeps every pre-research gate passing. The data model distinguishes authored targets, calculated solver state, measured run-frame values, and representative visual landmarks. Contracts prohibit render-time solver calls and visual repair, preserve old frame-layout readability, define source honesty, and require deterministic browser evidence at desktop and tablet sizes. No added dependency, persistence migration, new physical control, or constitution exception is introduced.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations require tracking.
