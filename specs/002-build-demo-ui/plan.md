# Implementation Plan: Demoable Workbench UI

**Branch**: `002-build-demo-ui` | **Date**: 2026-08-25 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-build-demo-ui/spec.md`

## Summary

Turn the existing stack-evaluation pages into one usable, wireframe-faithful Jump Lab application spanning Workbench, Pose, Library, Report, and Validation. Extend the current React/TypeScript client, shared schema package, Rust/WASM worker boundary, Zustand store, Canvas renderers, D3 chart utilities, and browser test suites. Supported physical controls use the real solver; unsupported controls remain visible and capability-gated. Scenario edits are immediate, solver runs are explicit and immutable, historical runs embed exact input snapshots, and all representative or unavailable values remain source-honest.

## Technical Context

**Language/Version**: TypeScript 7.0.2 with React 19.2.8 for the web application; Rust 1.98.0 for the existing `physics-core` compiled to WebAssembly

**Primary Dependencies**: Vite 8.2.2, React Router 8.3.0, Zustand 5.0.15, Zod 4.4.3, Dexie 4.4.5, D3 scale/shape 4.x/3.x, Lucide React 0.554.0, `@bike-jumper/schema`, existing worker and Canvas 2D modules

**Storage**: Zustand for live application state; session-scoped browser storage for route/view continuity; existing Dexie repositories for already-supported local scenarios and run artifacts; no server or cloud storage

**Testing**: Vitest 4.1.11 with Testing Library for unit/integration/contract tests; Playwright 1.62.1 for Chromium, Firefox, WebKit, branded browsers, iPad Pro 11, accessibility, offline, and visual evidence; Cargo tests for physics, convergence, and determinism

**Target Platform**: Browser-based client/PWA on supported desktop engines and the configured tablet viewport; side-view Canvas 2D and responsive document views; offline-capable after application load

**Project Type**: Monorepo web application with shared TypeScript schema package and Rust/WASM physics library; no backend service

**Performance Goals**: Standard solve p95 under 5 seconds on the project baseline device; cancellation p95 under 250 ms; direct-control feedback p95 under 100 ms; replay at 55 fps or better; no solver invocation during playback, overlays, resize, report selection, or baseline selection

**Constraints**: Preserve all authoritative `data-od-id` values and primary actions; use real solver output for supported physical effects; disable/read-only unsupported physical controls; deterministic visible checkpoints; no invented metrics; no new production dependency; no expansion of the physics model; unavailable `wasm-pack` must produce an explicit unavailable result rather than fabricated parity evidence

**Scale/Scope**: Five product routes plus root fallback, sixteen existing physical input contracts with room for wireframe-required additions, two animated Canvas stages, four report charts, one validation convergence chart, session-scoped preset/run/baseline collections, and complete desktop/tablet acceptance coverage

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle or Gate                                  | Plan Evidence                                                                                                                       | Pre-Design Status |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| I. Physics fidelity is verifiable                  | UI reads worker results and source metadata; fixture data is limited to labeled UI-state tests; no solver equations change          | PASS              |
| II. Rider and bike form one dynamic system         | Existing scenario schema and solver remain authoritative; unsupported physical controls are disabled rather than simulated          | PASS              |
| III. Teach through visible cause and effect        | Input contracts retain units, ranges, quantities, explanations, capability state, and metric source labels                          | PASS              |
| IV. Simulations are deterministic and reproducible | Solve is explicit; runs are immutable and include exact scenario snapshots, versions, assumptions, and hashes                       | PASS              |
| V. Focused 2D experience                           | Existing side-view Canvas renderers and desktop/tablet workflows are extended; no 3D or lateral scope                               | PASS              |
| VI. Wireframes are the UX contract                 | Stable region inventory, primary actions, responsive rules, screenshots, and deterministic stage/chart checks are feature contracts | PASS              |
| UI quality gates                                   | Each route receives workflow, keyboard, source-honesty, responsive, nonblank-render, and visual checks                              | PASS              |
| Release honesty                                    | Validation and report surfaces distinguish measured, estimated, representative, pending-core, and unavailable evidence              | PASS              |

**Pre-Design Gate Result**: PASS. Phase 0 research may proceed without exception.

### Post-Design Re-check

- The data model keeps solver-produced run evidence immutable and separates editable working copies from historical artifacts.
- Provider contracts make real versus fixture sources explicit and expose granular capabilities before controls become editable.
- UI contracts preserve wireframe structure, stable IDs, designated primary actions, accessibility states, and responsive behavior.
- Validation contracts require DOM/accessibility assertions plus canvas pixel checks, SVG semantics, deterministic checkpoints, and screenshots.
- No design artifact introduces a new physical effect, hides a pending capability, or treats visual similarity as solver evidence.

**Post-Design Gate Result**: PASS. No constitutional exception or complexity waiver is required.

## Project Structure

### Documentation (this feature)

```text
specs/002-build-demo-ui/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── application-services.md
│   ├── state-transitions.md
│   ├── ui-regions.md
│   └── validation-matrix.md
└── tasks.md                    # Created later by /speckit-tasks
```

### Source Code (repository root)

```text
apps/web/
├── src/
│   ├── app/                    # Router layout, PWA, versioning, session restoration
│   ├── components/ui/          # Shared shell, controls, tables, status, callout primitives
│   ├── features/
│   │   ├── library/            # Presets, search, thumbnails, speed-window states
│   │   ├── pose/               # Keyframes, direct manipulation, sampling, ROM summary
│   │   ├── report/             # Comparison, charts, CSV, snapshot reopening
│   │   ├── validation/         # Suite, convergence, determinism, pending gates
│   │   └── workbench/          # Inputs, solve, stage, playback, overlays, metrics
│   ├── rendering/
│   │   ├── canvas/             # Workbench/Pose deterministic drawing
│   │   └── charts/             # Accessible deterministic SVG charts
│   ├── solver/                 # Worker adapters, controller, capabilities, frame buffer
│   ├── state/                  # Zustand domain/session slices and selectors
│   ├── storage/                # Existing repositories plus snapshot-aware run records
│   └── observability/          # Existing interaction/replay measurements
└── tests/
    ├── integration/            # State, session, repositories, route handoffs
    └── unit/                   # Selectors, compatibility, components, adapters

packages/schema/
├── src/
│   ├── input-contract.ts       # Step and capability-aware controls
│   ├── scenario.ts             # Existing scenario and pose schemas
│   ├── run-result.ts           # Run artifact and comparison metadata
│   └── worker-protocol.ts      # Granular input/output capabilities
└── tests/                      # Schema, migration, protocol tests

crates/physics-core/
├── src/                        # Existing solver and capability producer only
└── tests/                      # Existing fidelity/determinism tests

tests/
├── contracts/                  # Worker, schema, stable-region, provider contracts
├── e2e/                        # Primary workflows and keyboard/source states
├── offline/                    # Reload and unavailable-reference behavior
├── visual/                     # Screenshots, overlap, canvas/SVG checks
└── fixtures/                   # Deterministic, visibly labeled UI adapters
```

**Structure Decision**: Evolve the current monorepo in place. Product pages graduate from `features/stack-spike` into named feature modules while validated primitives move from `components/spike` to `components/ui`. The shared schema package owns cross-boundary data and capability validation; the Rust crate remains the source of physical results; route/view state stays in the web application.

## Implementation Strategy

1. Evolve schema and worker contracts for granular capabilities, run snapshots, source metadata, and compatibility fingerprints, with migration and contract tests before UI adoption.
2. Establish the router-level shell, shared UI primitives, design tokens, stable `data-od-id` inventory, and session restoration behavior.
3. Refactor application state around validated scenario context, immutable run artifacts, stale-result state, baseline compatibility, stale references, and injectable providers.
4. Implement Library and Workbench as the first complete P1 journey, connecting supported controls to the real worker and preserving explicit unavailable states.
5. Implement Pose auto-application and sampling, then Report snapshot reopening/comparison and Validation evidence presentation.
6. Add route-level unit, contract, browser, accessibility, offline, responsive, canvas-pixel, SVG, and screenshot evidence; run the existing physics gates without changing model scope.

## Complexity Tracking

No constitutional violations or additional project-level abstractions require justification.
