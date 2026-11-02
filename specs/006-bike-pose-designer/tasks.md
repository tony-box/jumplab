---
description: "Implementation tasks for Bike and Pose Designer"
---

# Tasks: Bike and Pose Designer

**Input**: Design documents from `/specs/006-bike-pose-designer/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required. The constitution mandates equation, constraint, analytical, deterministic,
native/WASM parity, browser workflow, accessibility, responsive, and rendered-canvas coverage. Write
each failing test before its paired implementation task.

**Organization**: Tasks are grouped by user story. Shared scenario v3, canonical geometry, and worker
contracts are foundational because every story must consume the same physical bicycle.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other marked tasks in the same phase because it changes different
  files and has no dependency on unfinished work.
- **[Story]**: Maps work to User Story 1, 2, or 3 from `spec.md`.
- Every task names the exact file or directory it changes.

---

## Phase 1: Setup (Version, Fixture, and UX Baseline)

**Purpose**: Establish version identities, legacy evidence, and the governing Designer wireframe
before model or application behavior changes.

- [X] T001 [P] Rename and revise the Pose sheet into the Bike and Pose Designer UX contract, including Bike/Pose modes, manual dimension groups, shared preview, conflict summary, static-bike behavior, keyboard states, and tablet layout, and update the governing route table, Designer region IDs, and preserved pose aliases in `ui_wireframes/designer.html`, `ui_wireframes/index.html`, and `specs/002-build-demo-ui/contracts/ui-regions.md`
- [X] T002 [P] Rename and revise the interactive Pose prototype into the Designer visual baseline with the same controls, states, naming, stable regions, artifact metadata, and cross-links in `ui_wireframes/rendered_html/designer.html` and `ui_wireframes/rendered_html/`
- [X] T003 [P] Add immutable v2 migration inputs and expected v3 measured-geometry values without changing current standard fixtures in `tests/fixtures/scenarios/geometry-v2/`
- [X] T004 [P] Define the next `SCENARIO_SCHEMA_VERSION` in `crates/physics-core/src/scenario.rs` and the next `MODEL_VERSION` and `SOLVER_VERSION` for geometry model 1 and mass-distribution model 1 in `crates/physics-core/src/version.rs`
- [X] T005 [P] Define matching scenario, app-protocol, model, and solver identities while retaining frame layout 2 in `apps/web/src/app/version-manifest.ts`
- [X] T006 Update version compatibility expectations for scenario v2-to-v3 migration, unchanged frame layout, and the new app protocol in `packages/schema/src/migrations/compatibility.ts` and `tests/contracts/compatibility.test.ts`

---

## Phase 2: Foundational (Canonical Geometry and Browser Contract)

**Purpose**: Land one versioned, deterministic geometry authority and make it reachable through the
existing worker before any story-specific behavior is built.

**Critical**: Complete this phase before any user-story implementation.

### Tests for the foundation

- [X] T007 [P] Add failing schema tests for every `BikeGeometrySpec` field/range, strict object parsing, v2-to-v3 migration, scenario-file migration, pose-target preservation, and stable canonical hashing in `packages/schema/tests/application-contracts.test.ts`
- [X] T008 [P] Add failing analytical geometry tests for axle/BB construction, reach/stack landmarks, seat and steering axes, 10 mm front-axle closure, frame-member connection, and rigid/hardtail/full member presence in `crates/physics-core/tests/analytical/bike_geometry.rs` and register them in `crates/physics-core/tests/analytical.rs`
- [X] T009 [P] Add failing worker contract tests for `inspect-bike-geometry`, `resolve-pose-edit`, and `validate-design` request/response validation, stale request IDs, typed errors, protocol version, and unchanged frame layout in `tests/contracts/physics-worker.test.ts`
- [X] T010 [P] Add failing native/WASM parity and repeated-call determinism cases for canonical landmarks, closure residual, issue ordering, CoG, and inertia in `tests/parity/physics-parity.spec.ts`

### Foundational implementation

- [X] T011 Add strict shared schemas and exported types for `BikeGeometrySpec`, canonical landmarks/members/shapes, geometry issues, mass properties, contacts, design conflicts, key validation, edit resolution, and aggregate design validation in `packages/schema/src/scenario.ts`, `packages/schema/src/run-result.ts`, and `packages/schema/src/index.ts`
- [X] T012 Implement deterministic v2-to-v3 scenario and scenario-file migration using documented v2 proportions and a closing derived fork length while preserving identifiers, existing bike values, and pose targets in `packages/schema/src/migrations/index.ts`
- [X] T013 Add `BikeGeometrySpec`, geometry model version, and matching structural/range validation to Rust scenario deserialization in `crates/physics-core/src/scenario.rs`
- [X] T014 Implement canonical bike-local landmarks, connected frame members, steering closure residual, stable geometry issue ordering, and protected-shape generation for supported frame types in `crates/physics-core/src/geometry.rs`
- [X] T015 Implement representative component shares, weighted bicycle CoG, and planar inertia with the parallel-axis theorem while preserving authored total bike mass in `crates/physics-core/src/bike.rs`
- [X] T016 Add serializable geometry inspection, issue, shape, and mass-property outputs plus `inspectBikeGeometry` in `crates/physics-core/src/lib.rs`
- [X] T017 Add worker-protocol commands, events, strict response schemas, and typed error codes for geometry inspection, pose edit resolution, and complete design validation in `packages/schema/src/worker-protocol.ts`
- [X] T018 Handle geometry inspection and its cancellation/error paths through the existing WASM worker in `apps/web/src/solver/physics.worker.ts` and `apps/web/src/solver/fixture.worker.ts`
- [X] T019 Expose request-ID-safe `inspectBikeGeometry`, `resolvePoseEdit`, and `validateDesign` operations through `SolverGateway` in `apps/web/src/app/services.ts`, `apps/web/src/app/AppProviders.tsx`, and `apps/web/src/solver/gateway.ts`
- [X] T020 Migrate bundled scenarios, bike presets, demo factories, and expected scenario-file envelopes to explicit v3 geometry in `tests/fixtures/scenarios/`, `tests/fixtures/presets/catalog-v1.json`, and `tests/fixtures/ui/demo-fixtures.ts`

**Checkpoint**: One Rust model produces the bicycle used by schema validation, worker responses, future
clearance, rendering, and mass properties; migrated v2 scenarios reproduce documented geometry.

---

## Phase 3: User Story 1 - Author Poses That Fit the Bike (Priority: P1) MVP

**Goal**: Every accepted authored keyframe remains outside protected bicycle geometry except at
permitted hand, foot, and inferred saddle contacts, with deterministic nearest-valid direct edits.

**Independent Test**: On the existing authoring surface, attempt pelvis/top-tube, torso/handlebar,
limb/frame, wheel, crank, fork, and saddle penetrations; verify accepted targets remain valid, named
parts and constraint kinds are reported, all authored keys gate solving, and interpolation is not
clearance-validated.

### Tests for User Story 1

- [x] T021 [P] [US1] Add failing capsule/circle/ring signed-separation reference cases at exact touch, `-0.001 m`, and deeper overlap boundaries in `crates/physics-core/tests/analytical/pose_clearance.rs` and register them in `crates/physics-core/tests/analytical.rs`
- [x] T022 [P] [US1] Add failing keyframe regressions for pelvis/top-tube direction, torso/handlebar, limbs/frame/wheels/crank/fork, designated hand/foot contacts, inferred saddle-top contact, absent members, extreme rider sizes, and stable conflict ordering in `crates/physics-core/tests/regression/pose_clearance.rs` and register them in `crates/physics-core/tests/regression.rs`
- [x] T023 [P] [US1] Add failing resolver tests proving valid requests pass unchanged, invalid requests bisect only baseline-to-request, invalid baselines fail, legacy keys are not rewritten, and interpolation is never inspected in `crates/physics-core/tests/regression/pose_edit.rs` and register them in `crates/physics-core/tests/regression.rs`
- [x] T024 [P] [US1] Add failing worker and gateway contract tests for key validation, complete 64-key validation, edit resolution, `design-invalid` solve refusal, cancellation, and native/WASM result parity in `tests/contracts/physics-worker.test.ts` and `tests/parity/physics-parity.spec.ts`
- [X] T025 [P] [US1] Add failing component tests for last-valid pose preservation, constrained target commits, selected-key reasons, all-key conflict summaries, stale response rejection, and disabled Apply to Run in `apps/web/tests/unit/pose-editor.test.tsx`
- [X] T026 [P] [US1] Add failing desktop/tablet authoring checks for each conflict class, focusable key conflicts, permitted contacts, nonblank correctly framed canvas, no clipping/overlap, and no solve dispatch while invalid in `tests/e2e/pose.spec.ts`

### Implementation for User Story 1

- [x] T027 [US1] Implement finite rider envelopes and deterministic signed closest-distance tests against canonical bike protected shapes, including part ordering and the 1 mm zero-penetration tolerance, in `crates/physics-core/src/geometry.rs`
- [x] T028 [US1] Implement designated hand/foot exemptions, inferred one-sided saddle contact, pelvis-above-top-tube direction, reach/joint/clearance classification, and `PoseKeyValidation` in `crates/physics-core/src/pose.rs`
- [x] T029 [US1] Implement fixed-iteration baseline-to-request bisection returning `PoseEditResolution` without searching unrelated target states in `crates/physics-core/src/pose.rs`
- [x] T030 [US1] Implement complete authored-key validation and enforce the `design-invalid` gate before every Rust solve entry point without sampling interpolated poses in `crates/physics-core/src/scenario.rs`, `crates/physics-core/src/solver.rs`, and `crates/physics-core/src/lib.rs`
- [X] T031 [US1] Wire pose sampling, direct edits, reset, key creation/movement, and Apply to Run through core edit/design validation while preserving last-valid accepted targets and rejecting stale requests in `apps/web/src/features/pose/usePoseEditor.ts`
- [X] T032 [US1] Present selected-key clearance/contact state, grouped all-key conflicts, limiting rider/bike parts, and explicit disabled-apply reasons in `apps/web/src/features/pose/PosePage.tsx`, `apps/web/src/features/pose/JointRail.tsx`, and `apps/web/src/features/pose/PoseStage.tsx`
- [X] T033 [US1] Expose deterministic clearance, inferred saddle-contact, accepted-target, conflict-code, and affected-key checkpoints while retaining existing drag helpers in `apps/web/src/test-hooks.ts`

**Checkpoint**: User Story 1 is independently functional on the current authoring route and forms the
MVP: authored keyframes cannot penetrate the active bicycle and invalid designs cannot be solved.

---

## Phase 4: User Story 2 - Design the Bicycle Geometry (Priority: P2)

**Goal**: Users manually edit fit-critical geometry with immediate canonical preview, honest invalid
drafts, all-key revalidation, persistent v3 round trips, and geometry-dependent physical mass
properties.

**Independent Test**: Change each supported dimension across rigid, hardtail, and full-suspension
bikes; verify connected canonical geometry, units/ranges, invalid-combination feedback, preserved pose
targets, all-key conflicts, scenario round trips, static geometry, and reproducible CoG/inertia/run
changes.

### Tests for User Story 2

- [X] T034 [P] [US2] Add failing Rust regressions for every editable dimension, combined-invalid geometry, closure residual, present/absent suspension members, unchanged total bike mass, geometry-dependent CoG/inertia, and deterministic run changes in `crates/physics-core/tests/regression/bike_designer.rs` and register them in `crates/physics-core/tests/regression.rs`
- [X] T035 [P] [US2] Add failing persistence tests for v3 save, duplicate, whole-scenario export/import, reopen, canonical hash, derived-conflict non-persistence, and legacy v2 preservation in `apps/web/tests/integration/persistence.test.ts`
- [X] T036 [P] [US2] Add failing editor tests for SI/display conversion, field/range metadata, pending and invalid drafts, atomic valid bike application, stale inspection rejection, revalidation after bicycle and rider dimension changes, and no bike keyframes in `apps/web/tests/unit/bike-designer.test.tsx`
- [X] T037 [P] [US2] Replace rendering tests with failing assertions that all bike members, contacts, protected envelopes, and CoG consume core-returned canonical geometry without TypeScript reconstruction in `apps/web/tests/unit/bike-geometry.test.ts`
- [X] T038 [P] [US2] Add failing desktop/tablet workflow checks for manual edits, invalid closure recovery, pose-conflict links, static bike values across key selection, supported frame types, input accessibility, stable canvas dimensions, and no overflow in `tests/e2e/pose.spec.ts`

### Implementation for User Story 2

- [X] T039 [P] [US2] Add grouped measured-geometry control metadata, mm/degree conversion, numeric steps, units, ranges, and physical descriptions in `apps/web/src/features/pose/bike-dimensions.ts`
- [X] T040 [P] [US2] Implement the manual geometry, mass, frame-type, and existing suspension controls with field-linked issue rendering in `apps/web/src/features/pose/BikeGeometryRail.tsx`
- [X] T041 [P] [US2] Implement closure, derived landmark, CoG, inertia, and representative-model readouts in `apps/web/src/features/pose/BikeDerivedRail.tsx`
- [X] T042 [US2] Implement `DesignerDraft` state, structural input parsing, debounced/request-ID inspection, invalid-draft retention, atomic valid bike writes, and complete pose-key revalidation after any bicycle or rider dimension change in `apps/web/src/features/pose/useBikeDesigner.ts`
- [X] T043 [US2] Integrate Bike/Pose mode switching, bike rails, shared conflict summary, and mode-dependent timeline visibility while retaining one scenario and preview in `apps/web/src/features/pose/PosePage.tsx`
- [X] T044 [US2] Replace TypeScript landmark reconstruction with core-returned canonical members, contacts, protected envelopes, and mass centers in `apps/web/src/rendering/geometry/bike-geometry.ts`, `apps/web/src/rendering/geometry/draw-bike.ts`, and `apps/web/src/rendering/canvas/pose-stage.ts`
- [X] T045 [US2] Consume the same canonical bike geometry in Workbench transforms and drawing without duplicating scenario geometry per frame in `apps/web/src/rendering/canvas/workbench-stage.ts`
- [X] T046 [US2] Apply combined bike and pose-dependent rider mass properties to the simulated body instead of uniform two-wheel density while retaining wheel contact colliders in `crates/physics-core/src/bike.rs` and `crates/physics-core/src/solver.rs`
- [X] T047 [US2] Update scenario catalog preset merging, storage hashing, scenario files, and run staleness/regeneration handling for v3 geometry and changed model/solver identity in `apps/web/src/features/library/scenario-catalog.ts`, `apps/web/src/storage/scenario-files.ts`, `apps/web/src/storage/repositories.ts`, and `apps/web/src/features/workbench/useWorkbench.ts`
- [X] T048 [US2] Regenerate standard run outputs and determinism hashes only after geometry and mass behavior pass, updating `tests/fixtures/run-results/standard-v1.json` and `crates/physics-core/tests/determinism/golden.rs`

**Checkpoint**: User Story 2 is independently testable through the combined authoring component: users
can design a valid static bicycle, understand invalid combinations, and preserve/reproduce it.

---

## Phase 5: User Story 3 - Design Bike and Movement in One Place (Priority: P3)

**Goal**: Complete the user-facing Designer destination, canonical route, navigation, naming,
responsive composition, and legacy `/pose` compatibility around the Bike and Pose workflows.

**Independent Test**: Open Designer from navigation and an old `/pose` bookmark, switch Bike/Pose
modes, edit both against one preview/scenario, verify only Pose has a timeline, apply a valid design to
Workbench, and confirm accessible desktop/tablet behavior.

### Tests for User Story 3

- [X] T049 [P] [US3] Add failing route and session-continuity tests proving `/designer` is canonical, `/pose` replaces to it, and active scenario/movement state survives in `apps/web/tests/unit/ui-components.test.tsx` and `apps/web/tests/integration/session-continuity.test.ts`
- [X] T050 [P] [US3] Add failing desktop/tablet end-to-end coverage for navigation naming, mode switching, one shared preview, pose-only timeline, conflict recovery, final Apply to Run, stable regions, and old-bookmark continuity in `tests/e2e/designer.spec.ts`
- [X] T051 [P] [US3] Add failing accessibility coverage for the route, segmented radio behavior, numeric fields, live validation summary, conflict focus, keyframe keyboard isolation, and disabled-action reasons in `tests/e2e/accessibility.spec.ts`
- [X] T052 [P] [US3] Add failing desktop/tablet visual checks for Bike-valid, Bike-invalid, Pose-valid, Pose-constrained, and multi-key-conflict checkpoints with nonblank canvas, no clipping/overlap/scroll/layout shift in `tests/visual/designer.spec.ts`

### Implementation for User Story 3

- [X] T053 [US3] Rename the feature module and exported symbols from `apps/web/src/features/pose/` to `apps/web/src/features/designer/`, update imports in `apps/web/tests/unit/`, and preserve established pose-specific stable region IDs inside the unified page
- [X] T054 [US3] Add canonical `/designer`, replacement `/pose` redirect, and `DesignerPage` routing while preserving in-memory scenario state, and update view-test script paths in `apps/web/src/App.tsx` and `package.json`
- [X] T055 [US3] Rename primary navigation, shell context, page title, loading/error copy, canvas accessible name, and user-facing Pose-editor references to Designer in `apps/web/src/components/ui/AppShell.tsx` and `apps/web/src/features/designer/`
- [X] T056 [US3] Implement the final responsive Designer layout, fixed preview sizing, rail stacking/collapse behavior, wrapped conflict content, visible focus, and no horizontal page overflow in `apps/web/src/styles.css`
- [X] T057 [US3] Rename and extend Designer test controls while keeping compatibility aliases for existing pose drag/checkpoint consumers in `apps/web/src/test-hooks.ts`
- [X] T058 [US3] Update Workbench, Report, Library, and Validation links/copy to target Designer without changing scenario or run semantics in `apps/web/src/features/workbench/`, `apps/web/src/features/report/`, `apps/web/src/features/library/`, and `apps/web/src/features/validation/`

**Checkpoint**: All three stories are integrated in the canonical Designer while old bookmarks and
existing pose automation continue to work.

---

## Phase 6: Polish and Cross-Cutting Concerns

**Purpose**: Publish assumptions, refresh visual evidence, verify performance, and execute the complete
release gate.

- [X] T059 [P] Document measured geometry conventions, closure tolerance, protected/rider envelopes, 1 mm non-penetration tolerance, keyframe-only clearance, static authored geometry, representative mass shares, CoG, inertia, and excluded safety/fit claims in `docs/physics/model.md` and `docs/physics/limitations.md`
- [X] T060 [P] Update scenario v3, model/solver identifiers, Designer route, and compatibility evidence in `README.md`, `docs/architecture/ADR-002-evolution-policy.md`, and `docs/architecture/evidence/`
- [X] T061 [P] Update offline precache and route coverage so `/designer` works offline and `/pose` redirects without network access in `apps/web/vite.config.ts` and `tests/offline/`
- [X] T062 Replace Pose visual baselines with reviewed Designer desktop/tablet snapshots in `tests/visual/designer.spec.ts-snapshots/`, update pinned image digests in `tests/fixtures/upgrade-baseline-v1.json`, and rerun parity after snapshot regeneration
- [X] T063 Extend the interaction benchmark with continuous bike-dimension edits, 64-key validation, stale-request cancellation, and Bike/Pose switching in `tests/benchmarks/interaction.bench.ts` and confirm at least 95% of updates complete within 100 ms
- [X] T064 Run `npm.cmd run build:physics`, `cargo test -p physics-core -- --test-threads=1`, `npm.cmd run test:schema`, `npm.cmd run test:worker`, `npm.cmd run test:parity`, and focused Designer unit/persistence suites from `specs/006-bike-pose-designer/quickstart.md`
- [X] T065 Verify no process is already listening on ports 4173/4174, then run Designer desktop/tablet end-to-end, accessibility, visual, and offline Playwright checks from `specs/006-bike-pose-designer/quickstart.md`
- [X] T066 Run `npm.cmd run benchmark:interaction`, `npm.cmd run check`, and `npm.cmd run verify`, then format regenerated evidence and rerun `npm.cmd run check` as the final release gate in `specs/006-bike-pose-designer/quickstart.md`

---

## Dependencies and Execution Order

### Phase dependencies

| Phase | Depends on | Blocks |
| --- | --- | --- |
| Phase 1 Setup | none | Phase 2 and final visual review |
| Phase 2 Foundational | Phase 1 versions and fixtures | All user stories |
| Phase 3 User Story 1 | Phase 2 | Solve eligibility and US2 pose-conflict behavior |
| Phase 4 User Story 2 | Phase 2; uses US1 validation for complete workflow | US3 integrated page |
| Phase 5 User Story 3 | Phases 3 and 4 | Final browser and visual gates |
| Phase 6 Polish | All desired stories | Release completion |

### User story dependencies

- **User Story 1 (P1)**: Starts after Phase 2. It is independently demonstrable on the existing
  authoring route and is the suggested MVP.
- **User Story 2 (P2)**: Core geometry editing can start after Phase 2, but all-key conflict and solve
  behavior depend on US1 validation. It remains independently testable through the combined
  authoring component before the route rename.
- **User Story 3 (P3)**: Depends on the working Bike and Pose modes from US1/US2; it supplies canonical
  routing, product-wide naming, responsive integration, and compatibility rather than new physics.

### Within each phase

- Write and run each phase's failing tests before its implementation tasks.
- T011 and T012 precede T020 because fixtures must parse under scenario v3.
- T014 and T015 precede T016; T016 and T017 precede T018; T018 and T019 complete worker access.
- T027 and T028 precede T029 and T030; T030 precedes any enabled Apply to Run path.
- T039 through T041 may run in parallel; T042 precedes T043.
- T044 precedes T045 so both stages consume the same core-owned shape.
- T046 and T047 must complete before T048 regenerates golden results.
- T053 precedes T054 through T058 so imports and paths change once.
- T062 runs only after all intended visual changes and before the final parity run.

### Parallel opportunities

- Phase 1: T001 through T005 touch independent files or fixture directories; T006 follows version
  choices.
- Phase 2 tests: T007 through T010 run in parallel.
- Phase 2 implementation: T013, shared-schema work in T011, and migration work in T012 can begin in
  parallel; worker tasks serialize after their contracts exist.
- User Story 1 tests: T021 through T026 run in parallel.
- User Story 2 tests: T034 through T038 run in parallel; T039 through T041 run in parallel.
- User Story 3 tests: T049 through T052 run in parallel.
- Polish: T059 through T061 run in parallel while snapshot and benchmark tasks remain sequential.

---

## Parallel Examples

### User Story 1

```text
Task T021: Add analytical finite-envelope tolerance tests.
Task T022: Add rider/bike conflict regression fixtures.
Task T024: Add worker, solve-gate, and parity contracts.
Task T025: Add pose editor state tests.
Task T026: Add desktop/tablet authoring checks.
```

### User Story 2

```text
Task T034: Add bike geometry and mass-property regressions.
Task T035: Add persistence and import/export tests.
Task T036: Add bike Designer state tests.
Task T037: Add canonical rendering tests.
Task T038: Add manual-edit browser workflows.
```

### User Story 3

```text
Task T049: Add route/session tests.
Task T050: Add canonical Designer end-to-end tests.
Task T051: Add accessibility tests.
Task T052: Add visual checkpoints.
```

---

## Implementation Strategy

### MVP scope

Phases 1 through 3 constitute the MVP. At the Phase 3 checkpoint, the existing authoring surface
prevents invalid rider-to-bike clearances at every authored keyframe, gives deterministic constrained
edits, and blocks invalid solves. This resolves the highest-priority trust issue before the larger bike
control surface and rename land.

### Incremental delivery

1. **Phases 1 and 2**: Versioned scenario v3, canonical geometry, migration, and worker contracts.
2. **Phase 3 (MVP)**: Keyframe clearance, permitted contacts, constrained edits, and solve gate.
3. **Phase 4**: Manual bike design, canonical rendering, persistence, CoG/inertia, and all-key
   revalidation.
4. **Phase 5**: Canonical Designer route, unified responsive page, naming, accessibility, and legacy
   bookmark compatibility.
5. **Phase 6**: Documentation, snapshots, offline behavior, performance, and complete release gate.

### Review guidance

- Review schema/migration changes and canonical geometry equations before UI controls are added.
- Keep test-first tasks separate from implementation so failures demonstrate missing behavior.
- Review T048 golden regeneration and T062 visual/digest regeneration independently from logic.
- Do not add 99spokes or other external geometry import work; manual entry is the explicit release
  boundary.

## Notes

- `[P]` tasks use different files and have no unfinished dependency in their phase.
- `[US1]`, `[US2]`, and `[US3]` map directly to prioritized stories in `spec.md`.
- Run the focused validation named by each task before advancing within a story.
- Preserve existing user changes and unrelated generated outputs during implementation.
- `SC-004` is a moderated usability outcome measured after implementation; it has no build task.
