# Implementation Plan: Bike and Pose Designer

**Branch**: `006-bike-pose-designer` | **Date**: 2026-09-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-bike-pose-designer/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Replace the Pose destination with a Bike and Pose Designer that edits measured, scenario-level
bicycle geometry beside the existing pose-keyframe workflow. Introduce scenario schema v3, migrate
legacy schematic proportions into explicit dimensions, and move bicycle landmarks, rider contacts,
protected shapes, geometry closure, and representative mass properties into one deterministic Rust
model exposed through the existing worker/WASM gateway. Validate rider-to-bike clearance only at
authored keyframes, constrain direct pose edits along the last-valid-to-requested path, list all
keyframes invalidated by a valid bicycle edit, and block solving until the active design passes.

## Technical Context

**Language/Version**: TypeScript 7; Rust 1.98.0, edition 2024

**Primary Dependencies**: React, React Router, Zod, Dexie/IndexedDB, Vite, Web Workers,
`wasm-bindgen`, Rapier 2D 0.35.2, Serde

**Storage**: Versioned scenario JSON and content hashes in IndexedDB; downloadable scenario JSON

**Testing**: Vitest and Testing Library; Playwright desktop/tablet, visual, accessibility, parity,
and offline projects; `cargo test` for geometry, pose, solver, determinism, and WASM contracts

**Target Platform**: Offline-capable modern desktop and tablet browsers with deterministic native
Rust and `wasm32-unknown-unknown` parity

**Project Type**: npm-workspace browser application with a shared schema package and Rust/WASM
physics library

**Performance Goals**: At least 95% of Designer preview and validation updates visible within 100
ms; existing playback target of at least 55 frames per second and zero interaction-benchmark drops

**Constraints**: Side-view 2D only; authored bike geometry is static per scenario; at most 64 pose
keys; no external geometry import; no silent pose-target rewriting; deterministic 1 mm
non-penetration tolerance; rendering must consume physics-owned landmarks rather than independently
reconstructing geometry

**Scale/Scope**: One Designer route, approximately 15 measured bike inputs, one shared bike/rider
preview, batch validation of up to 64 authored pose keys, schema v2-to-v3 compatibility, and native,
WASM, persistence, browser, and visual validation

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Design Gate

- **I. Physics Fidelity Is Verifiable: PASS**. Geometry uses SI units and one Rust-owned derivation.
  Geometry closure, protected envelopes, tolerance, representative mass distribution, center of
  gravity, and inertia are documented and covered by analytical and deterministic tests. Rendering
  consumes model output and cannot repair invalid geometry.
- **II. Rider and Bike Form One Dynamic System: PASS**. Every new geometry input changes a model
  landmark, rider contact, protected boundary, or mass property. Authored total bike mass remains
  independent; representative bike mass properties and pose-dependent rider mass properties feed
  the same rigid-body solve. No decorative-only input is exposed.
- **III. Teach Through Visible Cause and Effect: PASS**. Designer presents names, units, ranges,
  derived values, and validation reasons. Approximate mass distribution and collision validity are
  labeled as model assumptions, not safety or fit advice.
- **IV. Simulations Are Deterministic and Reproducible: PASS**. Scenario schema, model, and solver
  versions change; v2 migration is deterministic; geometry inspection and keyframe validation are
  byte-stable; fixture and golden hashes are regenerated.
- **V. Focused 2D Experience: PASS**. Work remains in the existing side-view authoring workflow and
  adds only physically meaningful dimensions. Batch validation is bounded by 64 keys and runs off
  the main thread.
- **VI. Wireframes Are the UX Contract: PASS**. The Pose sheet and rendered prototype are revised
  into Designer before implementation. Existing stable pose region IDs remain aliases where needed,
  new bike/conflict regions receive stable IDs, and desktop/tablet Playwright coverage verifies the
  changed workflow and canvas.

No constitution exception is required.

### Post-Design Re-check

Phase 1 keeps all gates passing: the data model separates structural scenario parsing from semantic
design validity; the contracts assign all physical derivation to Rust; the UI contract preserves the
primary Apply to Run workflow and legacy `/pose` entry; and the quickstart requires native/WASM
parity, deterministic checkpoints, physics regression, accessibility, responsive, and visual gates.

## Project Structure

### Documentation (this feature)

```text
specs/006-bike-pose-designer/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── bike-geometry-contract.md
│   ├── designer-ui-contract.md
│   └── physics-gateway-contract.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/schema/
├── src/
│   ├── scenario.ts
│   ├── run-result.ts
│   ├── canonical.ts
│   └── migrations/
└── tests/

crates/physics-core/
├── src/
│   ├── scenario.rs
│   ├── geometry.rs
│   ├── bike.rs
│   ├── pose.rs
│   ├── solver.rs
│   ├── lib.rs
│   └── version.rs
└── tests/

apps/web/
├── src/
│   ├── App.tsx
│   ├── components/ui/AppShell.tsx
│   ├── features/designer/
│   ├── rendering/geometry/
│   ├── solver/
│   ├── storage/
│   └── test-hooks.ts
└── tests/

ui_wireframes/
├── designer.html
└── rendered_html/designer.html

tests/
├── contracts/
├── e2e/
├── fixtures/
├── parity/
└── visual/
```

**Structure Decision**: Extend the existing schema, Rust physics, worker gateway, and web feature
boundaries. Rename the user-facing feature folder to `designer` while preserving compatibility at
the route and stable-region boundaries. Do not add a second geometry implementation or a new runtime
dependency.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution violations require justification.
