# Implementation Plan: Technology Stack Evaluation

**Branch**: `001-stack-evaluation` | **Date**: 2026-08-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-stack-evaluation/spec.md`

## Summary

Select and validate a technology stack for the offline-first 2D mountain-bike jump teaching
application. The selected architecture is a client-only React/TypeScript application built by Vite,
with native Canvas 2D rendering, SVG charts, IndexedDB persistence, and a dedicated worker hosting a
Rust/Rapier deterministic physics kernel compiled to WebAssembly. The plan treats cross-platform
physics determinism, measured solver behavior, wireframe conformance, offline operation, accessible
alternatives, and browser-rendered Playwright evidence as non-compensating release gates.

Before later production features are specified, bounded physics and browser/offline spikes MUST prove
native/WASM/browser parity, articulated rider and suspension behavior, metric availability, worker
cancellation, cached WASM operation, wireframe rendering, and the five-second benchmark. Failed hard
gates reopen the relevant stack decision; this feature does not implement the complete application.

## Technical Context

**Language/Version**: TypeScript 7.0.2 in strict mode; React 19.2.8; Rust 1.98.0 with
edition 2024; Node.js 24 LTS; HTML5 and modern CSS

**Primary Dependencies**: Vite 8.2.2, React Router 8.3.0, Zustand 5.0.15, Zod 4.4.3, Dexie 4.4.5,
Vite PWA 1.3.0, Rapier 2D 0.35.2 with `enhanced-determinism`, `serde-serialize`, and `wasm-bindgen`,
wasm-bindgen 0.2.127, D3 scale/shape, Lucide React

**Storage**: IndexedDB through Dexie for scenarios and run records; versioned JSON files for portable
import/export; `localStorage` only for small wireframe-defined UI preferences; Cache Storage through a
service worker for the offline application shell, worker, WASM, fonts, and presets

**Testing**: Vitest for TypeScript units/integrations; native Rust unit, analytical, convergence,
regression, and determinism tests; native/WASM parity tests; Playwright across Chromium, Firefox,
WebKit, Chrome, Edge, and tablet profiles; screenshot and canvas-pixel checks; axe-core accessibility;
real Safari/iPadOS release smoke tests

**Target Platform**: Static HTTPS browser application supporting the latest two stable Chrome, Edge,
Firefox, and Safari desktop releases, Safari on iPadOS tablets, and Chrome on Android tablets; core
workflows operate offline after first successful load; no runtime backend

**Project Type**: npm workspace containing one browser application, one shared TypeScript contract
package, and one Rust physics crate compiled to WASM

**Performance Goals**: Standard 10-second scenario solve p95 under 5 seconds on a recorded 2022-era
mainstream laptop; cancellation p95 under 250 ms; 95% of direct controls show feedback under 100 ms;
60 frames/s replay; deterministic output independent of display frame rate

**Constraints**: Side-view 2D only; fixed physics timestep (default `1/960 s`); SI units and radians at
boundaries; bit-level native/WASM/browser determinism from canonical inputs; no `simd8`; all geometry
derivation, pose interpolation, speed-window analysis, and physics initialization math in Rust using
deterministic nalgebra operations; zero aerodynamic drag, zero tire/terrain friction, and zero
unmodeled linear/angular damping; immutable run frames; accessible DOM equivalents for canvas/chart
information; import validates before mutation; application assets and local workflows available
offline; dependency versions pinned; `ui_wireframes/rendered_html/` governs visual presentation and
demonstrated interaction feel but its mock values and local scripts are never implementation evidence

**Scale/Scope**: Two representative spike routes covering the highest-risk workbench and pose-editor
regions plus one chart/table sample; six wireframe sheets remain normative references; one active user,
four jump types, three bike frame types, up to 12 dynamic bodies and 11 joints in the standard
scenario, up to 64 pose keys, 10 simulated seconds per standard run, 240 Hz output sampling, and local
scenario/run history only. Complete production screens and coaching content are deferred.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-Research Gate

| Principle or gate | Plan evidence | Status |
| --- | --- | --- |
| I. Verifiable Newtonian physics | Proven Rapier core plus analytical, convergence, and energy tests; assumptions and omissions remain documented | Pass |
| II. Coupled rider and bike | 2D rigid bodies, revolute/prismatic joints, PD motors, joint limits, bounded torque, suspension, and contact in one solver | Pass |
| III. Visible cause and effect | Machine-readable input contracts with units/ranges/explanations, metric source field, force/COM overlays, accessible tables, and unavailable metrics kept blank | Pass |
| IV. Deterministic/reproducible | Rust `enhanced-determinism`, deterministic math, canonical insertion order, exact versions, hashes, immutable frames, parity tests | Pass |
| V. Focused 2D experience | Canvas 2D side view, frame replay, responsive editing, no 3D/GPU framework | Pass |
| VI. Wireframes as UX contract | Rendered HTML visual references, sheet-defined behavior, stable region IDs, CSS tokens/layout, Playwright workflows, and rendered checks | Pass |
| Simulation constraints | Fixed timestep, contact separation, explicit suspension, zero drag/friction/unmodeled damping, schema versions, and rendering isolated from solver | Pass |
| Development quality gates | Rust/TypeScript/browser test layers, release evidence, known limitations, and review gates planned | Pass |

No constitution violation requires a complexity exception. The Rust/WASM crate is justified by the
constitution's determinism and validation mandates rather than optional architectural layering.

### Post-Design Gate

| Design artifact | Gate confirmation | Status |
| --- | --- | --- |
| [research.md](research.md) | Every stack area has a selection, alternatives, hard-gate result, risks, primary evidence, and revisit triggers | Pass |
| [data-model.md](data-model.md) | Units, versions, identities, immutable runs, metric provenance, and deterministic ordering are explicit | Pass |
| [worker-protocol.md](contracts/worker-protocol.md) | Solving is isolated, versioned, validated, cancellable, progressive, and stale-safe | Pass |
| [scenario-file.schema.json](contracts/scenario-file.schema.json) | Portable files are strict, versioned, bounded, validated before mutation, and migration-ready | Pass |
| [validation-matrix.md](contracts/validation-matrix.md) | Constitution and wireframe requirements map to executable native, WASM, browser, visual, accessibility, offline, and benchmark gates | Pass |
| [quickstart.md](quickstart.md) | End-to-end validation commands and expected outcomes cover all mandatory release evidence | Pass |

Phase 1 introduces no new violation. All technical uncertainties are resolved.

## Project Structure

### Documentation (this feature)

```text
specs/001-stack-evaluation/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── scenario-file.schema.json
│   ├── validation-matrix.md
│   └── worker-protocol.md
├── checklists/
│   └── requirements.md
└── tasks.md                 # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/
└── web/
   ├── public/
   │   ├── icons/
   │   └── fonts/
   ├── src/
   │   ├── app/
   │   │   ├── App.tsx
   │   │   ├── router.tsx
   │   │   └── providers.tsx
   │   ├── components/
   │   │   ├── controls/
   │   │   ├── data/
   │   │   ├── layout/
   │   │   └── stage/
  │   ├── features/
  │   │   └── stack-spike/
  │   │       ├── workbench/
  │   │       ├── pose/
  │   │       └── report-sample/
   │   ├── rendering/
   │   │   ├── canvas/
   │   │   └── charts/
   │   ├── solver/
   │   │   ├── controller.ts
   │   │   ├── frame-buffer.ts
   │   │   └── physics.worker.ts
   │   ├── state/
   │   ├── storage/
   │   ├── styles/
   │   └── main.tsx
   └── tests/
      ├── component/
      └── integration/

packages/
└── schema/
   ├── src/
   │   ├── scenario.ts
   │   ├── run-result.ts
   │   ├── worker-protocol.ts
   │   ├── migrations/
   │   └── presets/
   └── tests/

crates/
└── physics-core/
   ├── src/
  │   ├── geometry.rs
  │   ├── analysis.rs
  │   ├── pose.rs
  │   ├── rider.rs
   │   ├── bike.rs
   │   ├── scenario.rs
   │   ├── solver.rs
   │   ├── telemetry.rs
   │   └── lib.rs
   ├── tests/
   │   ├── analytical/
   │   ├── convergence/
   │   ├── determinism/
   │   └── regression/
   └── pkg/                   # Generated WASM/npm output; drift-checked

tests/
├── benchmarks/
├── contracts/
├── e2e/
├── fixtures/
│   ├── scenarios/
│   └── run-results/
├── offline/
├── parity/
└── visual/

ui_wireframes/                 # Existing normative design and behavior contract
└── rendered_html/             # Interactive non-functional pixel/interaction references
```

**Structure Decision**: Use a three-boundary workspace without a backend. `apps/web` owns only the
representative spike routes, accessible DOM, interaction, painting, and worker lifecycle.
`packages/schema` owns runtime-validated TypeScript contracts, preset inputs, input-control metadata,
and file migrations; it MUST NOT calculate physical outcomes. `crates/physics-core` owns every
calculation that can affect simulation meaning, including geometry derivation, anthropometry, pose
interpolation, entry-speed-window analysis, joint construction, fixed stepping, and telemetry; it
builds native tests and the generated WASM package. Root tests exercise boundaries and bounded spike
workflows. Full production route implementation belongs to later feature specifications.

## Implementation Sequence

1. Scaffold the workspace, exact toolchains, shared contracts, Rust crate, generated WASM build, and
   verification scripts.
2. Complete the stack rubric and obtain maintainer provisional approval before implementing the
   selected-stack spikes.
3. Execute the bounded physics spike and native/WASM/browser parity gates. Stop and revisit the engine
   if determinism, articulated dynamics, exclusions, telemetry honesty, or performance cannot pass.
4. Implement representative workbench, pose-authoring, and chart/table surfaces from the wireframes;
   execute the browser/offline spike with fixture and production workers, persistence, import/export,
   deterministic visuals compared to `ui_wireframes/rendered_html/`, accessibility, and
   interaction-performance measurements. Replace every prototype mock with validated contracts or
   explicit pending states; never reuse prototype calculations as solver evidence.
5. Complete cross-browser and real Safari/iPadOS checks, dependency/license/security evidence, timed
   independent review, compatibility policy, and final approval. Create separate feature
   specifications for production screens only after all stack gates pass.
