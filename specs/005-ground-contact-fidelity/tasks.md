---
description: "Implementation tasks for Ground Contact Fidelity"
---

# Tasks: Ground Contact Fidelity

**Input**: Design documents from `/specs/005-ground-contact-fidelity/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required. The project constitution mandates unit tests for equations and constraints,
analytical reference cases, and regression scenarios captured **before** correction, plus Playwright
coverage of every changed canvas workflow. Write each failing test before its implementation task.

**Organization**: Tasks are grouped by user story so each increment is testable at its phase
boundary. Contract details live in `contracts/frame-layout-v2.md`, `contracts/terrain-profile.md`,
and `contracts/run-regeneration.md`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other marked tasks in the same phase because it changes different
  files and has no dependency on unfinished work.
- **[Story]**: Maps work to User Story 1, 2, or 3 from `spec.md`.
- Every task names the exact file or directory it changes.

## Story Sequencing Note

User Story 1 delivers correct contact physics and the corrected bike anchor, verified through
deterministic solver checkpoints. User Story 3 delivers agreement between the drawn ground and the
simulated ground, which completes the on-screen claim. The terrain export plumbing sits in the
foundational phase because both the solver and the renderer consume it, so User Story 1 can assert
wheel position against real terrain data before User Story 3 changes what is painted.

---

## Phase 1: Setup (Version and Contract Baseline)

**Purpose**: Establish the new version identities so every later change is attributable and old runs
are detectable.

- [X] T001 [P] Bump `SOLVER_VERSION`, `MODEL_VERSION`, `PROTOCOL_VERSION`, and `FRAME_LAYOUT_VERSION` to their new values in `crates/physics-core/src/version.rs`
- [X] T002 [P] Bump `frameLayout` to 2, `persistence` to 2, and the `solver` and `model` identifiers in `apps/web/src/app/version-manifest.ts`
- [X] T003 [P] Add `terrainSampleStep` to `modelMetadataSchema` in `packages/schema/src/application.ts`
- [X] T004 Register version 2 as current for `protocol`, `frame-layout`, and `persistence`, keeping version 1 resolvable through a migration path and `scenario` at version 1, in `packages/schema/src/migrations/compatibility.ts`
- [X] T005 Update boundary-version and migration-path expectations for all four domains in `tests/contracts/compatibility.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Capture the defect as regression scenarios before correcting it, then land the shared
contact geometry, frame layout, and terrain export that every user story depends on.

**Critical**: Complete this phase before any user-story implementation.

### Tests for the foundation

- [X] T006 [P] Add a canonical scenario manifest plus minimal fixtures covering every bundled scenario, flat roll, curved lip climb, true gap void, step-down edge, low-speed no-takeoff, drive-into-landing-face, entry-before-existing-terrain, renderer/solver anchor mismatch, and heuristic/proxy contact output in `tests/fixtures/scenarios/ground-contact/`
- [X] T007 [P] Add a failing parameterized regression harness asserting frame-zero approach support, no phantom gap collider, per-frame contact invariants, and grounded final state for every canonical manifest entry in `crates/physics-core/tests/regression/ground_contact.rs` and register the module in `crates/physics-core/tests/regression.rs`
- [X] T008 [P] Add failing frame-layout v2 assertions for stride 36, field names and offsets, and advertised protocol version 2 in `tests/contracts/physics-worker.test.ts`
- [X] T009 [P] Add failing native-versus-WebAssembly terrain export parity and repeated-call byte-determinism assertions in `tests/parity/physics-parity.spec.ts`

### Foundational implementation

- [X] T010 Implement discontinuous `GroundSegment` generation from the complete scenario, approach coverage through `entry.startX - wheelbase / 2 - wheelRadius`, table-only deck segments, separate landing faces, one collider input per segment, and void-aware nearest-distance queries in `crates/physics-core/src/geometry.rs`
- [X] T011 Extend `Frame` with `grounded_rear`, `grounded_front`, `normal_force_rear`, `normal_force_front`, and `min_clearance`, and set `FRAME_STRIDE_FLOAT32` to 36 in `crates/physics-core/src/solver.rs`
- [X] T012 [P] Add the `terrainProfileJson` export returning segments, `approachStartX`, `lipX`, `landingStartX`, and `sampleStep` in `crates/physics-core/src/lib.rs`
- [X] T013 [P] Add segmented terrain profile schemas plus the `terrain` command request and response shapes in `packages/schema/src/worker-protocol.ts`
- [X] T014 [P] Add the five contact field descriptors to the frame-layout contract in `packages/schema/src/run-result.ts`
- [X] T015 Handle the `terrain` command, advertise protocol version 2, and declare the stride-36 frame layout descriptor in `apps/web/src/solver/physics.worker.ts`
- [X] T016 Expose `terrain(scenario, step)` with scenario-hash and step keyed caching in `apps/web/src/solver/gateway.ts`
- [X] T017 [P] Add typed accessors for the five contact fields in `apps/web/src/solver/frame-buffer.ts`

**Checkpoint**: The four root causes are captured by failing tests, terrain covers the initial wheels
without spanning gaps, the frame layout exists, and solver and client obtain identical segments.

---

## Phase 3: User Story 1 - The Bike Rides on the Ground Instead of Through It (Priority: P1) MVP

**Goal**: Wheels stay on the surface through approach, curved lip, and rollout, with non-penetration
enforced by a real normal response and orientation following the terrain.

**Independent Test**: Play any bundled scenario end to end and confirm that every frame reported as
grounded has positive contact force and `minClearance >= -0.01` m, that height stays constant on flat
ground, that the wheels follow the curved lip rather than cutting through it, and that scrubbing
reproduces identical positions.

### Tests for User Story 1

- [X] T018 [P] [US1] Add analytical cases for resting equilibrium, ballistic separation, constant-slope pitch, deterministic airborne rotation, and bounded energy residual accounting for `W_speed_constraint` and `W_contact` in `crates/physics-core/tests/analytical/contact.rs` and register the module in `crates/physics-core/tests/analytical.rs`
- [X] T019 [P] [US1] Extend regressions with approach, curved-lip following, constant flat height, rollout, lip-crest angular stability, and passing assertions for every fixture captured by T006/T007 in `crates/physics-core/tests/regression/ground_contact.rs`
- [X] T020 [P] [US1] Add anchor and pitch-sign contract tests asserting axle and lowest-wheel heights for zero pitch and front axle above rear axle for positive pitch in `apps/web/tests/unit/workbench-anchor.test.ts`
- [X] T021 [P] [US1] Add desktop/tablet deterministic checkpoints across approach, lip, and rollout asserting stable `data-od-id` regions, accessibility state, nonblank canvas, correct framing, no overlap or clipping, no overflow or layout shift, and wheel pixels matching contact state in `tests/e2e/workbench.spec.ts`

### Implementation for User Story 1

- [X] T022 [US1] Replace the single-ball model with combined rider/bike rigid mass properties and one body carrying rear and front wheel colliders, keeping friction and restitution at zero and rotation free, in `crates/physics-core/src/bike.rs` and `crates/physics-core/src/solver.rs`
- [X] T023 [US1] Measure touching and supporting contact separately, normalize impulses at or below `CONTACT_IMPULSE_EPSILON` to zero, and emit grounded flags, normal forces, total `contactImpulse`, and nearest-segment `minClearance` in `crates/physics-core/src/solver.rs`
- [X] T024 [US1] Derive `airborne` from contact flags only and report the body-frame origin anchor plus measured body rotation, deleting the pose-derived pitch, in `crates/physics-core/src/solver.rs`
- [X] T025 [US1] Apply the horizontal-speed pin to the linear `x` component only, leaving vertical and angular motion free, in `crates/physics-core/src/solver.rs`
- [X] T026 [US1] Insert one static collider per terrain segment, add the validated-range guard rejecting solves whose per-substep displacement reaches the wheel radius, and wire CCD when `scenario.solver.ccd` is set in `crates/physics-core/src/solver.rs`
- [X] T027 [P] [US1] Correct the bike rotation to `+frame.pitch` per the anchor contract in `apps/web/src/rendering/canvas/workbench-stage.ts`
- [X] T028 [P] [US1] Expose `groundedRear`, `groundedFront`, `minClearance`, and nearest terrain-segment sampling as deterministic checkpoints in `apps/web/src/test-hooks.ts`, and label current rider posture and suspension controls as not coupled to jump dynamics in `apps/web/src/features/workbench/WorkbenchPage.tsx`
- [X] T029 [US1] Verify all T006/T007 regression fixtures pass, regenerate golden determinism hashes in `crates/physics-core/tests/determinism/`, and refresh expected run results in `tests/fixtures/run-results/standard-v1.json`

**Checkpoint**: The bike physically respects the ground through approach, lip, and rollout, and the
corrected anchor places it where the simulation says it is.

---

## Phase 4: User Story 2 - Landing Is a Real Contact Event (Priority: P2)

**Goal**: The bike touches down on the landing surface with contact force rising from zero, then
travels the landing slope and rollout on the surface.

**Independent Test**: Play a scenario with a real gap and confirm touchdown is reported at the frame
the wheels reach the landing, contact force rises from zero at that moment, airborne frames report
exactly zero force, and the run finishes resting on the rollout surface.

### Tests for User Story 2

- [X] T030 [P] [US2] Add landing regression assertions for touchdown frame, force rising from zero, finishing on the rollout, short-landing contact with the near face, and clean step-down separation in `crates/physics-core/tests/regression/ground_contact.rs`
- [X] T031 [P] [US2] Add deterministic last-airborne and first-grounded desktop/tablet checkpoints asserting force transition, wheel-to-landing pixels, and touchdown-indicator visibility in `tests/e2e/workbench.spec.ts` and `tests/visual/workbench.spec.ts`

### Implementation for User Story 2

- [X] T032 [US2] Emit `approach`, `takeoff`, `flight`, `landing`, and `rollout` phase intervals from contact transitions, omitting takeoff and flight when the bike never leaves the ground, in `crates/physics-core/src/solver.rs`
- [X] T033 [US2] Surface measured contact force and the touchdown frame in workbench readouts in `apps/web/src/features/workbench/useWorkbench.ts` and `apps/web/src/features/workbench/WorkbenchStage.tsx`
- [X] T034 [US2] Draw a touchdown indicator at the landing frame in `apps/web/src/rendering/canvas/workbench-stage.ts`

**Checkpoint**: Landing is a measured, visible contact event rather than an inferred frame index.

---

## Phase 5: User Story 3 - The Drawn Ground Is the Simulated Ground (Priority: P3)

**Goal**: The stage paints the exact polyline the solver resolved against, including the curved lip
and the real landing slope.

**Independent Test**: Load a scenario with a pronounced curved lip and confirm the drawn profile
matches the solver profile vertex for vertex, the wheels rest on that drawn line during contact, and
changing jump geometry changes both together.

### Tests for User Story 3

- [X] T035 [P] [US3] Add failing assertions that rendered segment and vertex counts equal solver output, no line spans a void, and sampled points agree within `1e-6` m in `apps/web/tests/unit/terrain-profile.test.ts`
- [X] T036 [P] [US3] Add desktop/tablet pixel and snapshot checks across varied geometry asserting nonblank correctly framed output, no overlap, clipping, overflow, or layout shifts, no line across gaps, wheels within 2 px of grounded segments, and touchdown visible only at the first-grounded checkpoint in `tests/visual/workbench.spec.ts`

### Implementation for User Story 3

- [X] T037 [US3] Replace the six-point schematic with solver-provided discontinuous segments in `apps/web/src/rendering/canvas/terrain-profile.ts`
- [X] T038 [US3] Draw each returned segment verbatim before the bike without connecting segments, resampling, clamping, or position correction in `apps/web/src/rendering/canvas/workbench-stage.ts`
- [X] T039 [US3] Request the terrain through the gateway using the run's `terrainSampleStep` in `apps/web/src/features/workbench/useWorkbench.ts`
- [X] T040 [US3] Refresh and review the desktop and tablet snapshots in `tests/visual/workbench.spec.ts-snapshots/`

**Checkpoint**: All three user stories are independently functional and the reported defect is fully
resolved on screen.

---

## Phase 6: Legacy Run Regeneration (Cross-Cutting, FR-015)

**Purpose**: Guarantee no solution produced by the superseded solver ever reaches the stage, a report,
or a baseline comparison.

### Tests for regeneration

- [X] T041 [P] Add failing tests for every regeneration case in `contracts/run-regeneration.md`, including Dexie transaction rollback, malformed/current-version frame stride, registered scenario-schema migration, original-version hash verification, and idempotence in `apps/web/tests/integration/persistence.test.ts`
- [X] T042 [P] Add a failing e2e test opening a legacy run and asserting the corrected animation in `tests/e2e/workbench.spec.ts`

### Implementation for regeneration

- [X] T043 [P] Add the transactional `replaceSolution(runId, derivedSolution)` operation that writes derived fields only in `apps/web/src/storage/repositories.ts`
- [X] T044 [P] Add Dexie schema version 3 for logical persistence contract v2 metadata and detection fields without redefining the existing version-2 upgrade in `apps/web/src/storage/database.ts`
- [X] T045 Persist `terrainSampleStep` and the active solver and model versions during artifact assembly in `apps/web/src/features/workbench/solve-run.ts`
- [X] T046 Implement inspect/regenerate states, frame-stride corruption detection, original-schema hash verification, registered scenario migration, and refusal to replay invalid legacy solutions in `apps/web/src/features/workbench/useWorkbench.ts`
- [X] T047 Present the regenerated notice and the blocked `regeneration-unavailable` and `regeneration-failed` states with playback disabled in `apps/web/src/features/workbench/WorkbenchPage.tsx`
- [X] T048 Stop emitting `version-warning` for regenerated runs and resolve baselines by `runId` in `apps/web/src/features/report/report-service.ts`

**Checkpoint**: Opening any stored run yields either a current solution or an explicit, honest refusal.

---

## Phase 7: Polish and Cross-Cutting Concerns

- [X] T049 [P] Document segmented terrain, the two-wheel contact model, support epsilon, anchor/pitch definitions, measured outputs, energy equation and residual bound, and penetration tolerance in `docs/physics/model.md`
- [X] T050 [P] Restate the horizontal-speed pin as externally supplied work, document the temporary Principle II exception and required coupled rider/suspension follow-up, and update excluded effects and validated ranges in `docs/physics/limitations.md`
- [X] T051 [P] Verify accessible names, keyboard behaviour, stable region IDs, and data-source-honesty text for regeneration, touchdown, rider posture, and suspension states in `tests/e2e/accessibility.spec.ts`
- [X] T052 Confirm the standard scenario and interaction benchmarks stay within budget in `tests/benchmarks/standard-scenario.bench.ts` and `tests/benchmarks/interaction.bench.ts`
- [x] T053 Run `npm run verify`, then run Prettier over the regenerated evidence JSON before the final `npm run check`
- [x] T054 Execute every validation in `specs/005-ground-contact-fidelity/quickstart.md` and confirm the manual workbench inspection passes

---

## Dependencies and Execution Order

### Phase dependencies

| Phase | Depends on | Blocks |
| --- | --- | --- |
| Phase 1 Setup | none | Phases 2 to 7 |
| Phase 2 Foundational | Phase 1 | All user stories |
| Phase 3 User Story 1 | Phase 2 | Phases 4 and 5 in practice |
| Phase 4 User Story 2 | Phase 3 | none |
| Phase 5 User Story 3 | Phase 2, and Phase 3 for meaningful visual assertions | none |
| Phase 6 Regeneration | Phase 1 for versions, Phase 3 for a corrected solver | none |
| Phase 7 Polish | All desired stories complete | none |

### Within each phase

- Write the failing tests listed at the top of the phase before the implementation tasks below them.
- In Phase 2, T010 and T011 precede all solver behaviour work; T015 depends on T012, T013, and T014.
- In Phase 3, T022 through T026 all modify `crates/physics-core/src/solver.rs` and MUST run in order.
- T029 runs only after T022 through T026 are complete, because it regenerates golden values.
- In Phase 6, T043, T044, and T045 all depend on T003; all three MUST complete before T046.

### Parallel opportunities

- Phase 1: T001, T002, and T003 are independent files; T004 precedes T005.
- Phase 2 tests: T006, T007, T008, and T009 run together.
- Phase 2 implementation: T012, T013, T014, and T017 run together after the segmented terrain shape
  from T010 is fixed; T010 and T011 are sequential because both alter the core contract surface.
- Phase 3 tests: T018, T019, T020, and T021 run together.
- Phase 3 implementation: T027 and T028 run together and are independent of the solver sequence.
- Phase 5: T035 and T036 run together; T037 precedes T038.
- Phase 6: T041 and T042 run together; T043 and T044 run together.
- Phase 7: T049, T050, and T051 run together.

---

## Implementation Strategy

### MVP scope

Phases 1 through 3 constitute the MVP. At the Phase 3 checkpoint the bike physically respects the
ground and is drawn where the simulation places it, which resolves the core of the reported defect.

### Incremental delivery

1. **Phases 1 and 2**: versions, captured failing regressions, contact geometry, terrain export.
2. **Phase 3 (MVP)**: real contact constraint, measured contact outputs, corrected anchor.
3. **Phase 4**: landing becomes a measured, visible event.
4. **Phase 5**: the painted ground matches the simulated ground, completing the visual claim.
5. **Phase 6**: stored runs regenerate so no legacy solution is ever shown.
6. **Phase 7**: documentation, performance confirmation, and full gate.

### Review guidance

Land Phase 1 as its own commit so the version bump is reviewable in isolation. Land T029 and T040
(golden and snapshot regeneration) as separate commits so reviewers can distinguish expected
regeneration from unexpected behaviour change.
