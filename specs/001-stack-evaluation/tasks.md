---

description: "Dependency-ordered tasks for the bounded Bike Jumper stack evaluation"
---

# Tasks: Technology Stack Evaluation

**Input**: Design documents from `specs/001-stack-evaluation/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by the feature specification and constitution. Test tasks precede the behavior
they validate and must initially fail for the expected missing behavior.

**Scope**: This feature implements stack-decision tooling and bounded physics/browser/offline spikes.
Complete production screens and coaching workflows require later feature specifications.
`ui_wireframes/rendered_html/` governs visual presentation and demonstrated interaction feel; its
mock values and local scripts are never implementation or validation evidence.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: May run in parallel after phase prerequisites because it owns different files.
- **[Story]**: Maps to a user story in `spec.md`.
- Every task names an exact file or directory.

## Phase 1: Setup

**Purpose**: Create the exact, pinned TypeScript/Rust workspace and validation entry points.

- [X] T001 Create the npm workspace and top-level script placeholders in `package.json`
- [X] T002 [P] Pin Node.js 24 LTS and npm behavior in `.nvmrc` and `.npmrc`
- [X] T003 [P] Pin Rust 1.98.0 with edition 2024 in `rust-toolchain.toml` and `Cargo.toml`
- [X] T004 [P] Configure strict TypeScript, ESLint, and Prettier in `tsconfig.base.json`, `eslint.config.js`, and `.prettierrc.json`
- [X] T005 [P] Scaffold the representative React/Vite spike package in `apps/web/package.json`, `apps/web/index.html`, and `apps/web/vite.config.ts`
- [X] T006 [P] Scaffold the shared contract package in `packages/schema/package.json` and `packages/schema/tsconfig.json`
- [X] T007 [P] Scaffold the deterministic Rust/WASM crate with pinned Rapier features in `crates/physics-core/Cargo.toml` and `crates/physics-core/src/lib.rs`
- [X] T008 [P] Configure Vitest projects in `vitest.config.ts`
- [X] T009 [P] Configure Playwright engine, branded-browser, tablet, visual, offline, and web-server projects in `playwright.config.ts`
- [X] T010 [P] Configure pinned Node/Rust cache, build, test, and evidence jobs in `.github/workflows/verify.yml`

**Checkpoint**: Empty native, WASM, TypeScript, and browser projects build and discover tests without a
runtime backend.

---

## Phase 2: Foundation

**Purpose**: Implement tested contracts, canonical fixtures, exact build orchestration, and state
skeletons required by every story.

**Critical**: No story implementation begins until this phase passes.

 [x] T060 [P] [US3]
 [x] T061 [P] [US3]
 [x] T062 [P] [US3]
 [x] T063 [P] [US3]
 [x] T064 [P] [US3]
 [x] T065 [P] [US3]
 [x] T066 [P] [US3]
 [x] T067 [P] [US3]
 [x] T068 [P] [US3]
 [x] T069 [P] [US3]
 [x] T070 [P] [US3]
 [x] T071 [P] [US3]
 [x] T072 [P] [US3]
 [x] T073 [P] [US3]
 [x] T074 [US3]
 [x] T075 [P] [US3]
 [x] T076 [US3]
 [x] T077 [P] [US3]
 [x] T078 [P] [US3]
 [x] T079 [US3]
 [x] T080 [P] [US3]
 [x] T081 [US3]
 [x] T082 [US3]
 [x] T083 [P] [US3]
 [x] T084 [US3]
 [x] T085 [P] [US3]
 [x] T086 [P] [US3]
 [x] T087 [US3]
 [x] T088 [US3]
 [x] T089 [P] [US4]
 [x] T090 [P] [US4]
 [x] T091 [P] [US4]
 [x] T092 [US4]
 [x] T093 [US4]
 [x] T094 [P] [US4]
 [x] T095 [P] [US4]
 [x] T096 [US4]
 [x] T097 [US4]
 [x] T098 Run
 [x] T100 [P]
 [x] T101 [P]
 [x] T102 [P]
 [x] T104 Compose
 [x] T105 Execute
 [x] T107 Document
 [x] T108 Document
- [X] T033 [US1] Record maintainer sign-off and transition the selected record to `provisionally-approved` in `docs/architecture/stack-decision.json`

**Stop-Work Gate**: T033 must pass before US2 or US3 implementation tasks begin.

---

## Phase 4: User Story 2 - Validate the Physics Execution Model (Priority: P2)

**Goal**: Prove a deterministic Rust/Rapier kernel can model the coupled rider and bike, own all
physical calculations, exclude out-of-scope forces, and meet worker/performance requirements.

**Independent Test**: Native Rust, WASM, Chromium, Firefox, and WebKit produce matching hashes for the
standard scenario; pose samples and speed windows match across targets; drag, friction, and unmodeled
damping remain zero; progress is monotonic; cancellation p95 is under 250 ms; and 20-run solve p95 is
under five seconds on recorded baseline hardware.

### Tests for User Story 2

- [X] T034 [P] [US2] Add failing deterministic terrain, anthropometry, and canonical-order tests in `crates/physics-core/tests/regression/geometry.rs`
- [X] T035 [P] [US2] Add failing Rust-owned cubic/linear/step pose sampling and constrained-arm tests in `crates/physics-core/tests/regression/pose.rs`
- [X] T036 [P] [US2] Add failing rider joint-limit, PD motor, and torque-cap tests in `crates/physics-core/tests/regression/rider.rs`
- [X] T037 [P] [US2] Add failing rigid, hardtail, full-suspension, contact, CCD, and takeoff tests in `crates/physics-core/tests/regression/bike.rs`
- [X] T038 [P] [US2] Add failing zero-drag, zero-friction, and zero-unmodeled-damping tests in `crates/physics-core/tests/regression/exclusions.rs`
- [X] T039 [P] [US2] Add failing entry-speed-window analysis tests in `crates/physics-core/tests/regression/analysis.rs`
- [X] T040 [P] [US2] Add failing ballistic, acceleration, spring, pendulum, and energy reference tests in `crates/physics-core/tests/analytical/reference_cases.rs`
- [X] T041 [P] [US2] Add failing timestep-halving and observed-order tests in `crates/physics-core/tests/convergence/fixed_step.rs`
- [X] T042 [P] [US2] Add failing repeat-run, snapshot, and canonical hash tests in `crates/physics-core/tests/determinism/golden.rs`
- [X] T043 [P] [US2] Add failing native/WASM/browser result, PoseSample, and EntrySpeedWindow parity tests in `tests/parity/physics-parity.spec.ts`
- [X] T044 [P] [US2] Add failing worker progress, cancellation, stale-result, and malformed-buffer tests in `tests/contracts/physics-worker.test.ts`
- [X] T045 [P] [US2] Add the failing solve, cancellation, and progress benchmark in `tests/benchmarks/standard-scenario.bench.ts`

### Implementation for User Story 2

- [X] T046 [P] [US2] Implement serde scenario DTOs, SI checks, canonical IDs, and version validation in `crates/physics-core/src/scenario.rs`
- [X] T047 [US2] Implement deterministic terrain and anthropometric derivation in `crates/physics-core/src/geometry.rs`
- [X] T048 [US2] Implement authoritative pose interpolation and constrained-arm sampling in `crates/physics-core/src/pose.rs`
- [X] T049 [US2] Implement rider segments, revolute joints, motors, limits, and torque caps in `crates/physics-core/src/rider.rs`
- [X] T050 [US2] Implement rigid, hardtail, and full-suspension bikes with zero-friction wheel contact and CCD in `crates/physics-core/src/bike.rs`
- [X] T051 [US2] Implement versioned entry-speed-window analysis in `crates/physics-core/src/analysis.rs`
- [X] T052 [US2] Implement fixed stepping, canonical insertion, phase detection, output sampling, zero drag/damping invariants, and cancellation points in `crates/physics-core/src/solver.rs`
- [X] T053 [US2] Implement measured contact impulse, motor work, wheel load, suspension, energy residual, warnings, and capabilities in `crates/physics-core/src/telemetry.rs`
- [X] T054 [US2] Export solve, sample-pose, speed-window, and capability functions with packed immutable buffers in `crates/physics-core/src/lib.rs`
- [X] T055 [P] [US2] Implement validated frame and telemetry typed-array views in `apps/web/src/solver/frame-buffer.ts`
- [X] T056 [US2] Implement the dedicated worker with all versioned commands/events, progress, transfer, and cancellation in `apps/web/src/solver/physics.worker.ts`
- [X] T057 [US2] Implement worker lifecycle, forced termination, replacement initialization, and stale-response rejection in `apps/web/src/solver/controller.ts`
- [X] T058 [US2] Implement environment capture, 20-run percentiles, and JSON benchmark evidence in `scripts/run-standard-benchmark.mjs`
- [X] T059 [US2] Run the physics spike and store parity, exclusions, telemetry, convergence, and benchmark evidence in `docs/architecture/evidence/physics-spike.json`

**Stop-Work Gate**: Failed determinism, exclusions, articulated dynamics, source honesty, or performance
reopens the physics decision before browser integration continues.

---

## Phase 5: User Story 3 - Validate the Interactive Teaching Experience (Priority: P3)

**Goal**: Prove the selected stack can support the highest-risk wireframe behavior through a bounded
workbench/pose/report sample with offline persistence, accessibility, and rendered-output evidence.

**Independent Test**: With explicit fixture and production workers, both spike routes support input
editing, solve progress, immutable replay, Rust-owned pose previews, one chart/table pair, local save,
offline reload, export/import, keyboard use, accessible equivalents, nonblank visuals, p95 control
feedback under 100 ms, and sustained 60 FPS replay at desktop and tablet viewports.

### Tests for User Story 3

- [x] T060 [P] [US3] Add failing fixture RunResult and fixture-worker protocol tests in `tests/contracts/fixture-worker.test.ts`
- [x] T061 [P] [US3] Add failing rendered-prototype region inventory plus input unit/range/quantity/explanation tests in `apps/web/tests/component/input-contract.test.tsx`
- [x] T062 [P] [US3] Add failing rendered-prototype shell parity, one-primary-action, stable-region-ID, keyboard, and metric-source tests in `apps/web/tests/component/spike-shell.test.tsx`
- [x] T063 [P] [US3] Add failing frame-index playback and viewport-invariance tests in `apps/web/tests/integration/playback.test.ts`
- [x] T064 [P] [US3] Add failing Dexie, local-save, export/import, migration, and rejection tests in `apps/web/tests/integration/persistence.test.ts`
- [x] T065 [P] [US3] Add failing representative workbench/pose workflows and documented prototype-interaction parity checks in `tests/e2e/stack-spike.spec.ts`
- [x] T066 [P] [US3] Add failing first-load then offline edit/save/solve/replay/export/import tests in `tests/offline/stack-spike.spec.ts`
- [x] T067 [P] [US3] Add failing same-viewport rendered-reference comparisons, deterministic screenshots, and canvas pixel invariants in `tests/visual/stack-spike.spec.ts`
- [x] T068 [P] [US3] Add failing axe, keyboard, focus, chart-label, and canvas-alternative checks in `tests/e2e/accessibility.spec.ts`
- [x] T069 [P] [US3] Add failing input-latency, frame-pacing, dropped-frame, and 60 FPS measurements in `tests/benchmarks/interaction.bench.ts`

### Implementation for User Story 3

- [x] T070 [P] [US3] Create the canonical immutable fixture RunResult in `tests/fixtures/run-results/standard-v1.json`
- [x] T071 [P] [US3] Implement deterministic progress, success, cancellation, and failure fixture behavior in `apps/web/src/solver/fixture.worker.ts`
- [x] T072 [P] [US3] Implement representative control metadata from InputControlContract in `packages/schema/src/input-contracts/spike-controls.ts`
- [x] T073 [P] [US3] Implement prototype-matched tested topbar, Button, Field, SegmentedControl, ChipSet, Tabs, MetricRow, and DataTable primitives in `apps/web/src/components/spike/`
- [x] T074 [US3] Implement scenario/run state actions and transitions on the foundation skeleton in `apps/web/src/state/store.ts`
- [x] T075 [P] [US3] Implement versioned Dexie stores, repositories, persistence requests, and quota errors in `apps/web/src/storage/database.ts` and `apps/web/src/storage/repositories.ts`
- [x] T076 [US3] Implement canonical Blob export/import, migration, hash checking, and validate-before-commit behavior in `apps/web/src/storage/scenario-files.ts`
- [x] T077 [P] [US3] Configure spike-shell, font, worker, fixture, and WASM precaching plus prompt-based updates in `apps/web/vite.config.ts` and `apps/web/src/app/pwa.ts`
- [x] T078 [P] [US3] Implement DPR scaling, camera transforms, ResizeObserver behavior, and stable framing in `apps/web/src/rendering/canvas/viewport.ts`
- [x] T079 [US3] Implement deterministic grid, terrain, rider/bike, path, and force-vector drawing in `apps/web/src/rendering/canvas/draw-stage.ts`
- [x] T080 [P] [US3] Implement immutable-frame playback, interpolation, exact stepping, and index scrubbing in `apps/web/src/features/stack-spike/workbench/usePlayback.ts`
- [x] T081 [US3] Implement rendered-workbench-matched input, solve, progress/cancel, stage, transport, and source-aware fixture/core metrics in `apps/web/src/features/stack-spike/workbench/WorkbenchSpikePage.tsx`
- [x] T082 [US3] Implement rendered-pose-matched distance-key editing and Rust PoseSample preview without prototype or TypeScript authoritative interpolation in `apps/web/src/features/stack-spike/pose/PoseSpikePage.tsx`
- [x] T083 [P] [US3] Implement a rendered-report-matched deterministic SVG chart and accessible fixture/core metric table in `apps/web/src/features/stack-spike/report-sample/ReportSample.tsx`
- [x] T084 [US3] Implement the two spike routes, active navigation, status, primary actions, and error boundaries in `apps/web/src/app/router.tsx` and `apps/web/src/app/App.tsx`
- [x] T085 [P] [US3] Implement rendered-reference desktop/tablet layout, styling, wrapped controls, reduced motion, and 44 px touch targets in `apps/web/src/styles/spike.css`
- [x] T086 [P] [US3] Expose production-disabled frame seeking, animation settling, canvas sampling, and worker selection in `apps/web/src/app/test-hooks.ts`
- [x] T087 [US3] Implement interaction/frame instrumentation and evidence output in `apps/web/src/observability/performance.ts` and `scripts/run-interaction-benchmark.mjs`
- [x] T088 [US3] Run the browser/offline spike and store rendered-reference parity, multi-engine workflows, source provenance, visuals, accessibility, latency, FPS, and cache evidence in `docs/architecture/evidence/browser-offline-spike.json`

**Stop-Work Gate**: Failed worker/WASM loading, offline operation, input-contract coverage,
accessibility, visual framing, latency, or frame pacing reopens the affected decision.

---

## Phase 6: User Story 4 - Revisit Decisions Safely (Priority: P4)

**Goal**: Make dependency and boundary changes auditable without silently changing physics or files.

**Independent Test**: Superseding a fixture decision identifies affected gates, requires fresh
evidence, preserves supported scenario meaning, and rejects incompatible changes before approval.

### Tests for User Story 4

- [x] T089 [P] [US4] Add failing provisional/evidence/approved/superseded lifecycle tests in `tests/contracts/decision-lifecycle.test.ts`
- [x] T090 [P] [US4] Add failing scenario, protocol, frame-layout, and persistence migration tests in `tests/contracts/compatibility.test.ts`
- [x] T091 [P] [US4] Add failing dependency-upgrade hash and visual-regression gate tests in `tests/parity/upgrade-gates.spec.ts`

### Implementation for User Story 4

- [x] T092 [US4] Implement decision supersession, evidence freshness, exception expiry, and approval validation in `scripts/manage-stack-decision.mjs`
- [x] T093 [US4] Implement scenario, persistence, protocol, and frame-layout compatibility registries in `packages/schema/src/migrations/compatibility.ts`
- [x] T094 [P] [US4] Generate app, schema, protocol, model, solver, Rust, and dependency versions in `apps/web/src/app/version-manifest.ts` and `crates/physics-core/src/version.rs`
- [x] T095 [P] [US4] Implement dependency support, vulnerability, license, lockfile, and SBOM checks in `scripts/check-dependencies.mjs`
- [x] T096 [US4] Document ownership, upgrade procedure, fallbacks, and revisit triggers in `docs/architecture/ADR-002-evolution-policy.md`
- [x] T097 [US4] Generate compatibility and migration evidence in `scripts/generate-compatibility-report.mjs` and `docs/architecture/evidence/compatibility-report.json`

---

## Phase 7: Final Evidence and Approval

**Purpose**: Complete remaining evidence, reviewability, security, and final approval without building
production application screens.

- [x] T098 Run the exact-device standard and interaction benchmarks and store raw samples in `docs/architecture/evidence/benchmark-results.json`
- [ ] T099 [P] Execute stable/previous Chrome, Edge, Firefox, Safari, iPadOS Safari, and Android Chrome spike smoke tests in `docs/architecture/evidence/browser-matrix.json`
- [x] T100 [P] Configure vulnerability, license, secret, lockfile, and CycloneDX SBOM release checks in `scripts/security-release-gates.mjs` and `.github/workflows/verify.yml`
- [x] T101 [P] Publish equations, units, exclusions, numerical method, tolerances, and validated range in `docs/physics/model.md` and `docs/physics/limitations.md`
- [x] T102 [P] Add generated inventories for rendered HTML reference regions, normative sheet IDs, every editable input contract, and prohibited prototype-script imports in `tests/contracts/wireframe-input-inventory.test.ts`
- [ ] T103 Add the timed independent-review procedure and record completion duration in `docs/architecture/evidence/reviewer-exercise.json`
- [x] T104 Compose all contract, build, parity, benchmark, browser, audit, and evidence checks in `scripts/verify.mjs` and `package.json`
- [x] T105 Execute the quickstart and record every expected outcome in `docs/architecture/evidence/quickstart-validation.json`
- [ ] T106 Update the DecisionRecord to `evidence-complete`, then `approved` only after all gates and maintainer sign-off pass in `docs/architecture/stack-decision.json`
- [x] T107 Document the selected stack, setup, spike results, supported browsers, and known limitations in `README.md`
- [x] T108 Document recommended follow-up feature boundaries for physics productionization, workbench, pose editor, and reporting/library/validation in `docs/architecture/follow-up-features.md`

**Final Checkpoint**: `npm run verify` passes, the record is approved, and later production features
can consume the selected stack without reopening resolved decisions.

---

## Dependencies and Execution Order

### Phase Dependencies

- Setup has no dependencies.
- Foundation depends on Setup and blocks all stories.
- US1 depends on Foundation and blocks selected-stack implementation until provisional approval.
- US2 and US3 begin after T033; US3 fixture work may proceed in parallel with the physics spike, but
  production-worker integration and final browser evidence depend on US2 outputs.
- US4 begins after Foundation; final compatibility evidence consumes US2/US3 fixtures.
- Final evidence depends on all four stories and both stop-work gates.

### Story Dependency Graph

```text
Setup -> Foundation -> US1 provisional approval
                            |-> US2 physics spike ---------\
                            |-> US3 browser/offline spike --+-> US4 evidence -> Final approval
```

## Parallel Opportunities

- T002-T010 setup tasks own separate files after T001.
- T011-T014 tests and T015-T018 contract implementations can proceed in parallel groups.
- T024-T025 and T026-T028 can proceed in parallel within US1.
- T034-T045 physics tests can be authored in parallel; T055 may proceed alongside Rust modules.
- T060-T069 browser tests can be authored in parallel; fixture, metadata, persistence, rendering, and
  style tasks own separate files.
- T089-T091 and T094-T095 can proceed in parallel in US4.
- T099-T102 final evidence tasks are parallel after story completion.

## Implementation Strategy

1. Complete Setup and Foundation.
2. Complete US1 and stop for provisional maintainer approval.
3. Execute US2 and US3 as bounded, risk-first spikes; stop on any failed hard gate.
4. Complete US4 compatibility policy and final evidence.
5. Approve the stack, then create the separate production feature specifications listed in T108.

## Notes

- `[P]` tasks own different files and have no incomplete same-phase dependency.
- Tests must fail for the intended reason before implementation.
- Rust is authoritative for pose interpolation, constrained arms, speed windows, and all physical
  calculations; TypeScript only edits inputs and visualizes returned values.
- Do not mark T106 complete unless every mandatory evidence artifact passes.
