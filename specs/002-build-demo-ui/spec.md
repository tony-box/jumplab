# Feature Specification: Demoable Workbench UI

**Feature Branch**: `[002-build-demo-ui]`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Build a full demoable and usable web application from the UI wireframe artifacts, with the UI and necessary functional connection points ready for future physics and product features without requiring every feature to work now."

## Clarifications

### Session 2026-08-25

- Q: How should edited physical controls affect run results in this UI-focused feature? → A: Existing solver drives supported quantities; unsupported capabilities are explicitly limited.
- Q: When should two runs be eligible for numeric baseline comparisons? → A: Schema and physical assumptions must match; solver-version differences are allowed with a visible warning.
- Q: What should happen to unapplied Pose Editor changes when the user navigates away? → A: Automatically apply every edit to the scenario's active movement.
- Q: When a user opens an old run in the Workbench, which scenario state should be loaded? → A: Load an editable copy of the run's exact scenario snapshot.
- Q: What should the app do when a remembered scenario, run, baseline, or selection is no longer available? → A: Keep the unavailable reference disabled until the user explicitly clears or replaces it.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Explore and Solve a Jump Scenario (Priority: P1)

As a rider or coach, I can open the workbench, inspect a complete jump scenario, adjust the jump, rider, bike, and entry controls, initiate a run, and use playback and overlays to understand the intended simulation workflow. The experience must remain honest about which displayed outputs are representative demo data, estimates, measured results, or unavailable pending future work.

**Why this priority**: The workbench is the product's central learning experience and the clearest demonstration that the separate screens form a usable application rather than a collection of mockups.

**Independent Test**: Load a representative scenario, change at least one physical input, initiate a run, scrub and replay its frames, toggle visualization layers, and verify that metrics and unavailable values are labeled by source without requiring any other authoring screen.

**Acceptance Scenarios**:

1. **Given** a representative scenario is loaded, **When** the user inspects its inputs, **Then** each solver-supported input is editable with its current value, unit, valid range, and changed state, while unsupported physical inputs are read-only or disabled and labeled as awaiting core capability.
2. **Given** a scenario contains valid supported inputs, **When** the user initiates a run, **Then** the existing solver computes the supported quantities, the interface shows a bounded in-progress state, prevents duplicate initiation, and transitions to a replayable result or an actionable error state.
3. **Given** a run result is available, **When** the user plays, pauses, steps, changes playback speed, or scrubs the timeline, **Then** the stage, phase, time, frame, and available metrics remain synchronized.
4. **Given** a run is displayed, **When** the user toggles an overlay, **Then** only the corresponding visible layer changes and the underlying result remains unchanged.
5. **Given** no baseline is pinned, **When** the result is viewed, **Then** comparison values remain blank; **When** the user pins the run as a baseline, **Then** later compatible runs can show signed comparisons without presenting unavailable comparisons as zero.

---

### User Story 2 - Find and Load a Starting Scenario (Priority: P1)

As a rider or coach, I can browse and search a scenario library, understand the defining properties of each jump, rider, bike, or movement preset, and load or duplicate one as a starting point for experimentation.

**Why this priority**: A useful demo needs an immediate entry path that avoids requiring users to construct a valid scenario from scratch.

**Independent Test**: Search and filter the library, inspect each category, load one preset into the workbench, and verify the empty-result and no-viable-window states.

**Acceptance Scenarios**:

1. **Given** the library contains representative presets, **When** the user selects a category or enters a query, **Then** the visible results and category counts reflect matching names, tags, and notes.
2. **Given** a matching preset is visible, **When** the user loads it, **Then** the workbench opens with the preset's scenario inputs populated and clearly identified.
3. **Given** a preset is duplicated, **When** the copy opens, **Then** edits affect the copy without changing the original preset.
4. **Given** no presets match a query, **When** the empty state appears, **Then** it names the query and offers both clearing the filter and creating a scenario.
5. **Given** a jump has no available entry-speed guidance, **When** its card is shown, **Then** the card states that no viable guidance is available rather than displaying a zero-width or invented range.

---

### User Story 3 - Author a Rider Movement (Priority: P2)

As a rider or coach, I can edit a distance-relative rider movement using keyframes, direct manipulation, and joint controls, with each valid edit immediately updating the current scenario for later evaluation.

**Why this priority**: Rider movement is the application's distinguishing learning control and must be represented by a complete, credible authoring workflow even while advanced physical responses remain future work.

**Independent Test**: Add, select, move, edit, and remove keyframes; change interpolation; manipulate a pose; encounter a joint or reach constraint; verify each valid edit persists in the scenario; and return to the Workbench.

**Acceptance Scenarios**:

1. **Given** a movement is open, **When** the user navigates its keyframes by pointer or keyboard, **Then** one keyframe is selected and the pose, distance track, joint targets, and summary all describe that selection.
2. **Given** a keyframe is selected, **When** the user changes a joint target or drags an available body handle, **Then** the target pose and affected values update continuously without focus loss or unrelated layout movement.
3. **Given** a requested pose exceeds a joint or reach constraint, **When** the edit is applied, **Then** the pose remains valid, the limiting condition is named, and no invalid numeric values appear.
4. **Given** the minimum allowed keyframes remain, **When** the user inspects deletion controls, **Then** deletion is unavailable and the reason is accessible.
5. **Given** the user makes a valid movement edit, **When** the edit occurs, **Then** the scenario's active movement updates immediately and any displayed run becomes stale; **When** the user selects Apply to Run, **Then** the Workbench opens with the updated movement without initiating a solve.

---

### User Story 4 - Inspect and Compare Run Outcomes (Priority: P2)

As a rider or coach, I can open a readable report for a run, compare it with a compatible baseline, inspect charts and tables, understand accuracy bounds, and return the run's scenario to the workbench.

**Why this priority**: The report turns the visual replay into an inspectable learning artifact and demonstrates how future measured outputs will be consumed.

**Independent Test**: Open a representative run, switch the run and baseline selections, inspect all headline values, charts, source labels, and accuracy notes, then reopen the scenario in the workbench.

**Acceptance Scenarios**:

1. **Given** a run exists, **When** its report opens, **Then** the page identifies the scenario and run conditions and presents airtime, apex, distance, and landing attitude with units and data-source honesty.
2. **Given** a baseline with matching schema, physical assumptions, units, and metric definitions is selected, **When** the report is viewed, **Then** charts and tables distinguish run from baseline and show signed deltas where comparison is meaningful; if solver versions differ, the version difference is visibly identified alongside the comparison.
3. **Given** no baseline or the same run is selected for both sides, **When** the report is viewed, **Then** deltas remain blank and the interface explains why rather than showing misleading zeroes.
4. **Given** a metric is unavailable or estimated, **When** its row or chart is shown, **Then** its source is labeled as awaiting future capability or estimate and its layout remains stable.
5. **Given** the user opens a run in the Workbench, **When** navigation completes, **Then** a new editable working copy contains the exact scenario snapshot used by that run, retains its relationship to the historical run, and leaves the immutable run unchanged.

---

### User Story 5 - Review Validation Readiness (Priority: P3)

As a maintainer or evaluator, I can run and inspect a validation presentation that separates available checks from pending gates, shows tolerances and convergence evidence, and never treats a visual demo as proof of physical correctness.

**Why this priority**: The demo must establish a trustworthy place for future validation while clearly bounding what this UI-focused feature proves today.

**Independent Test**: Initiate the representative validation suite, inspect progress and summary states, review analytical, convergence, determinism, and pending-gate sections, and verify that pending capabilities are not marked as passing.

**Acceptance Scenarios**:

1. **Given** the validation view is idle, **When** the user initiates the suite, **Then** progress is visible, duplicate initiation is prevented, and completed rows appear with measured, tolerance, margin, trace, and status information where available.
2. **Given** checks complete, **When** the summary appears, **Then** total, passing, failing, awaiting capability, and elapsed-time counts reconcile with the detailed rows.
3. **Given** a check depends on future solver or review work, **When** it is displayed, **Then** it is marked as awaiting capability with its owner and blocked gate rather than simulated as passing.
4. **Given** repeated-run evidence is shown, **When** the user inspects it on a narrow viewport, **Then** identifiers remain readable and do not clip outside their region.

### Edge Cases

- No scenario is loaded, or a remembered scenario, run, baseline, or selection is no longer available; the unavailable reference remains visible and disabled with an inline explanation and explicit clear or replace actions, while unrelated session state remains intact.
- A run initiation fails, takes longer than the demo's bounded waiting period, or returns only some expected outputs.
- A metric is null, unavailable, estimated, or incompatible with the baseline source; unavailable values display as unavailable and optional comparisons remain blank, never as numeric zero.
- A movement edit requests an unreachable pose, exceeds a joint limit, or would leave fewer than the minimum keyframes.
- Search filters remove every item in one or all library categories.
- A jump has no viable entry-speed guidance for the represented geometry.
- The current run cannot be found because demo runs are session-scoped.
- A validation check fails, exceeds its runtime budget, or is blocked on a future capability.
- Long labels, translated text, large numeric values, reduced viewport width, zoom, and keyboard-only navigation must not hide primary actions or cause incoherent overlap.
- Canvas or chart content cannot be drawn; the region retains its dimensions and presents a readable fallback rather than a blank unexplained surface.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The product MUST provide a coherent shared application shell with direct navigation among Workbench, Pose, Report, Library, and Validation views, a visible current location, contextual status, and exactly one designated primary action per view.
- **FR-002**: Each view MUST preserve the structure, content hierarchy, control inventory, interaction intent, and stable region identifiers defined by its corresponding wireframe artifact; the rendered artifact governs visual presentation where it differs from the structural sheet.
- **FR-003**: The demo MUST provide representative scenarios, movements, solver-produced runs for supported quantities, baselines, and validation records sufficient to complete every acceptance journey without a network service or user account; representative records MUST NOT substitute for solver output in response to physical input edits.
- **FR-004**: Every displayed output MUST identify or unambiguously convey whether it is measured, estimated, representative demo data, or awaiting a future capability; the product MUST NOT present representative values as validated physical results.
- **FR-005**: The Workbench MUST expose grouped controls for jump, landing, entry, rider, and bike inputs with a label, current value, unit, and valid range for every solver-supported editable physical quantity; unsupported physical controls required by the wireframes MUST remain visible but read-only or disabled and labeled as awaiting core capability.
- **FR-006**: The Workbench MUST provide a side-view stage with defined loading, unsolved, solved, and error states plus controls for grid, center-of-mass path, forces, velocity, joint torques, suspension, baseline, framing, and tracking as specified by the wireframes.
- **FR-007**: The Workbench MUST provide frame-consistent play, pause, step, speed, scrub, phase, time, and frame controls that change the displayed frame without changing the immutable underlying run result or invoking the solver; changing a supported physical input marks the displayed result as stale, and only the designated Solve Run action computes its replacement.
- **FR-008**: The Workbench MUST organize available outcomes into takeoff, air, landing, and energy sections and preserve explicit unavailable states for outputs not yet supplied by functional components.
- **FR-009**: Users MUST be able to pin one available run as a session baseline and see signed comparisons when both runs share the same scenario schema, physical-model assumptions, unit system, and metric definitions. Solver-version differences MAY be compared but MUST produce a visible version warning; no-baseline and otherwise incompatible comparisons MUST remain visibly blank.
- **FR-010**: The Scenario Library MUST provide searchable, category-filtered views of jump, rider, bike, and movement presets with result counts and keyboard-accessible search clearing.
- **FR-011**: Each jump preset MUST present its defining parameters, coaching note, scenario-derived thumbnail region, and entry-speed guidance state, including a worded no-guidance state.
- **FR-012**: Users MUST be able to load, duplicate, and create a scenario from the Library, with the resulting editable scenario opening in the Workbench.
- **FR-013**: The Pose view MUST present distance-relative keyframes in sorted order, support single selection and keyboard navigation, and provide add, move, and guarded delete behavior.
- **FR-014**: The Pose view MUST keep its pose stage, distance track, target controls, achieved values, errors, limits, and movement summary synchronized with the selected keyframe.
- **FR-015**: The Pose view MUST support the demonstrated direct-manipulation and target-editing interactions, maintain valid contact constraints, and visibly identify saturation or unreachable requests without producing invalid values.
- **FR-016**: Users MUST be able to choose among the wireframe-defined interpolation behaviors and reset a pose to neutral. Every valid Pose Editor change MUST immediately update the scenario's active movement and mark any displayed run stale; Apply to Run MUST navigate to the Workbench with that movement without invoking the solver.
- **FR-017**: The Report MUST identify the selected run and conditions, support run and baseline selection, and present the four wireframe-defined headline outcomes, four analysis chart regions, metric and energy tables, and accuracy-bound explanations.
- **FR-018**: Report comparisons MUST account for each metric's meaning, omit meaningless comparisons and comparisons whose schema, physical assumptions, units, or metric definitions differ, remain understandable without color, identify estimated or unavailable sources, and visibly identify any solver-version difference permitted by FR-009.
- **FR-019**: Users MUST be able to request the available run-frame export and open the selected run in the Workbench. Opening a run MUST create an editable working copy with a distinct session identity from the run's exact scenario snapshot, retain provenance to the historical run, and neither mutate nor recompute that run; unavailable export data MUST produce an actionable explanation.
- **FR-020**: The Validation view MUST allow the user to select an available timestep presentation and initiate a bounded suite with visible idle, running, completed, failed, and budget-exceeded states.
- **FR-021**: Validation results MUST present reconciled summary counts and sections for analytical checks, timestep convergence, determinism, and pending gates; future checks MUST remain awaiting capability and name an owner and blocked gate.
- **FR-022**: The application MUST maintain session-scoped continuity for the active scenario, movement, available runs, pinned baseline, library category, and report selections. When a remembered item is unavailable, its reference MUST remain visible and disabled in the affected context, dependent actions MUST be unavailable, and an inline explanation MUST provide explicit clear or replace actions; unrelated session state MUST remain intact until the user chooses a recovery action.
- **FR-023**: All primary journeys MUST be operable by keyboard, expose meaningful accessible names and current/selected/pressed states, provide visible focus, and offer equivalent readable information for visual charts and stages.
- **FR-024**: Interactive targets MUST remain usable on touch-oriented tablet viewports, and controls, tables, labels, charts, stages, and primary actions MUST not overlap, clip, or force page-wide horizontal scrolling at supported desktop and tablet widths.
- **FR-025**: Workbench and Pose MUST adapt their multi-region layouts into a usable single-column reading order on constrained widths; Library, Report, and Validation MUST adapt cards, charts, and tables within their content regions.
- **FR-026**: The application MUST preserve stable dimensions for stages, charts, toolbars, transport controls, status regions, and dynamic values so loading, selection, hover, and data changes do not cause disruptive layout shifts.
- **FR-027**: Every primary action MUST have disabled, in-progress, success, and failure feedback appropriate to its workflow, and errors MUST offer a recovery action without discarding unrelated user edits.
- **FR-028**: The demo MUST expose replaceable functional boundaries for scenario loading and editing, movement authoring, run initiation and frames, baseline comparison, report data, export, and validation results so later features can supply real behavior without changing the user-facing contracts in this specification.
- **FR-029**: The product MUST disclose that the experience is a focused two-dimensional educational model and MUST identify excluded physical effects and pending validation where users inspect simulation or accuracy claims.
- **FR-030**: Browser-level acceptance coverage MUST verify each view's primary journey, keyboard states, supported responsive layouts, stable region identifiers, and deterministic visible checkpoints for every animated stage or chart-bearing workflow.

### Scope Boundaries

**Included**:

- Complete shared shell and navigation across all wireframe-defined product views.
- Visually faithful, responsive, accessible UI states and interactions for every primary journey.
- Representative, session-scoped setup data and deterministic demo behavior sufficient for stakeholder demonstrations and usability evaluation, with computed run outcomes limited to quantities supplied by the existing solver.
- Functional boundaries and honest unavailable states for future scenario, movement, solver, report, export, persistence, and validation capabilities.
- Basic local continuity among the Library, Workbench, Pose, Report, and Validation journeys.

**Out of Scope**:

- Proving physics fidelity, solver parity, collision accuracy, energy accounting, or coaching correctness from representative UI data.
- Completing contact impulse, wheel-load decomposition, per-joint power, continuous-collision, or native-parity capabilities.
- Durable cloud storage, accounts, authentication, collaboration, sharing, or cross-device continuity.
- Video capture, external rider tracking, sensor ingestion, real-world safety certification, or claims of technique mastery.
- Expanding beyond the focused side-view two-dimensional experience or adding physical effects currently excluded by project governance.

### Learning Objective and Physical Quantities

- **Learning objective**: Enable riders and coaches to understand the intended cause-and-effect workflow for changing jump geometry, entry conditions, bike setup, and rider movement, then inspecting takeoff, airborne, landing, and energy outcomes without mistaking a UI demonstration for validated coaching evidence.
- **Affected inputs**: Jump type and geometry, landing geometry, entry speed and position, rider dimensions and mass, bike geometry and mass, suspension setup, joint targets, movement keyframe distance, interpolation, and control limits.
- **Presented outcomes**: Takeoff state, airtime, apex, travel distance, velocity, pitch or attitude, landing state, suspension travel, center-of-mass path, forces, torques, and energy balance, subject to explicit source and availability labels.
- **Deliberately excluded effects**: Aerodynamic drag, tire friction, steering, lateral motion, and any other effect excluded by current project governance.

### Key Entities

- **Scenario**: The editable experiment, including identity, version, jump, landing, entry, rider, bike, movement, and run settings. A working copy opened from a historical run has a distinct session identity and retains provenance to that run.
- **Jump Configuration**: The jump and landing feature type, dimensions, angles, transition, gap, and rollout that shape the experiment.
- **Rider Profile**: Rider dimensions, mass, proportions, strength, and movement-control limits.
- **Bike Configuration**: Wheel and frame geometry, mass, frame type, and inspectable suspension properties.
- **Movement Clip**: The scenario's active ordered set of distance-relative pose keyframes, interpolation choice, joint targets, and constraints; valid edits replace the active movement immediately rather than creating a separate draft.
- **Run Result**: An immutable session result containing the exact scenario snapshot used to compute it, replay frames, phase information, available outcomes, source labels, schema and model versions, and run settings.
- **Baseline**: A pinned run used for comparisons without changing either run; numeric deltas require matching schema, physical assumptions, units, and metric definitions, while solver-version differences are permitted only with a visible warning.
- **Preset**: A read-only starting configuration for a jump, rider, bike, or movement that may be loaded or duplicated.
- **Validation Check**: A named piece of evidence with measured result, tolerance, margin, trace, ownership, gate, and pass, fail, or awaiting-capability status.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: At least 90% of first-time evaluators can load a preset, change an input, initiate a run, replay it, and locate its report in under 5 minutes without assistance.
- **SC-002**: 100% of the five primary views expose their designated primary action, expected navigation, and all stable wireframe regions at supported desktop and tablet viewport widths.
- **SC-003**: Every primary journey in this specification can be completed using representative session data, and 100% of unavailable future outputs are visibly labeled rather than populated with invented numeric results.
- **SC-004**: At least 90% of evaluators correctly distinguish representative, measured, estimated, and awaiting-capability values when asked after completing a run-and-report journey.
- **SC-005**: Users can find and load a named preset from any library category in under 60 seconds, including recovery from a no-results search.
- **SC-006**: Users can add and modify a movement keyframe, recognize a constrained edit, verify that the scenario reflects the edit, and return to the Workbench in under 3 minutes.
- **SC-007**: 100% of designated primary workflows are completable by keyboard alone with visible focus and announced control state, and all charts have an equivalent readable description or table.
- **SC-008**: Across the supported desktop and tablet review matrix, no primary action, control label, value, chart, stage, or table content overlaps incoherently, clips essential information, or causes page-wide horizontal scrolling.
- **SC-009**: Dynamic state changes in stages, reports, validation rows, and status regions produce no disruptive movement of surrounding controls during the five primary workflow checks.
- **SC-010**: Validation summaries reconcile exactly with detailed check statuses, and zero pending checks are represented as passing before their named evidence exists.
- **SC-011**: A stakeholder can demonstrate the complete Library-to-Workbench-to-Pose-to-Workbench-to-Report journey and inspect Validation in a single 10-minute session without encountering a dead-end navigation path.
- **SC-012**: All automated browser acceptance checks for primary journeys, keyboard behavior, supported layouts, stable regions, and deterministic visible checkpoints pass before the feature is accepted.

## Assumptions

- The primary audience is riders, coaches, maintainers, and stakeholders evaluating an educational jump-simulation workflow rather than receiving real-world safety advice.
- The rendered wireframe artifacts are the visual authority, while the corresponding wireframe sheets remain the authority for behavior, data meaning, and required regions.
- The supported scope prioritizes desktop and tablet use; narrow phone layouts should remain readable but do not need to preserve dense authoring efficiency.
- Representative presets and session data may drive non-physical presentation states, but they do not replace solver output produced in response to physical edits; unavailable physical controls and outcomes remain visibly awaiting core capability.
- Session-scoped continuity is sufficient for this feature; durable persistence and identity will be specified separately.
- Existing scenario and physics work may supply some real values, but this feature does not expand or validate the underlying physical model.
- Future functional features will honor the user-facing states, entities, source distinctions, and interaction contracts established here.

## Dependencies

- The six source wireframe sheets and their rendered artifacts remain available as the acceptance authority during planning, implementation, and review.
- The project maintains a valid scenario vocabulary and representative presets for the controls and entities shown by the wireframes.
- Existing solver and functional components must drive every physical control and outcome they currently support when their outputs satisfy source-honesty and reproducibility requirements; otherwise the control is read-only or disabled and the defined awaiting-capability state is used.
- Future solver, persistence, export, and validation features will provide data through the replaceable boundaries identified in this specification.
