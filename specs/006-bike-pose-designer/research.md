# Research: Bike and Pose Designer

## Decision 1: Make Rust the Canonical Geometry Authority

**Decision**: Add one bike-local geometry model in `physics-core` that derives bicycle landmarks,
rider contacts, protected shapes, geometry validity, center of gravity, and inertia. Expose the
result through the existing worker/WASM boundary. The web renderer draws returned landmarks and
shapes; it does not repeat the formulas.

**Rationale**: Rust currently derives pedal and handlebar contacts from fixed constants while the
web renderer independently derives frame landmarks from another constant registry. A single owner
prevents visible geometry, pose constraints, and physics inputs from drifting and gives native/WASM
parity one testable contract.

**Alternatives considered**:

- Keep geometry in TypeScript and pass contacts into Rust: rejected because physics and validation
  would trust UI-derived physical inputs.
- Maintain matching Rust and TypeScript formulas: rejected because duplicated geometry already
  drifted and requires synchronization for every change.
- Add a third-party collision library: rejected because deterministic segment, capsule, and circle
  operations are small, bounded, and fit the existing core.

## Decision 2: Introduce Scenario Schema Version 3

**Decision**: Preserve existing `bike` fields and add a required nested `geometry` object containing
measured fit and steering dimensions. Bump scenario and scenario-file schemas from v2 to v3. The
v2-to-v3 migration populates geometry from the documented v2 schematic constants, preserves all
pose targets, updates the envelope version, and produces stable canonical hashes.

**Rationale**: Explicit persisted fields are required for editing, reproducibility, and import/export
round trips. A nested object keeps new measured values distinct from frame type, mass, and suspension
configuration while avoiding renames of established fields.

**Alternatives considered**:

- Optional geometry overrides: rejected because runs could continue depending on hidden defaults.
- Flatten all new fields into `bike`: rejected because it obscures the measured-geometry boundary.
- Replace wheelbase, chainstay, and bottom-bracket height: rejected because it creates unnecessary
  migration churn.

## Decision 3: Use Industry Measurement Conventions and Closure Validation

**Decision**: Store SI values using common side-view definitions: angles from forward horizontal,
reach/stack from bottom bracket to head-tube top, fork length axle-to-crown, fork offset perpendicular
to the steering axis, saddle height from bottom bracket, and saddle setback rearward from the seat
axis. Rear and front axles remain fixed by wheelbase; bottom bracket is fixed by chainstay and height.
The steering assembly must close on the front axle within a documented 10 mm input/rounding
tolerance. Applied canonical landmarks use the exact axle and report the closure residual.

**Rationale**: These conventions correspond to recognizable bicycle geometry tables and let each
dimension be explained. Closure validation catches combinations that individually pass ranges but
cannot form a connected bike. The 10 mm closure tolerance accommodates rounded source measurements
and is separate from rider non-penetration tolerance.

**Alternatives considered**:

- Derive wheelbase and make it read-only: rejected because wheelbase is already an editable input.
- Silently adjust a dependent field: rejected because it changes measured user data.
- Permit disconnected steering geometry: rejected because rendering and physics would disagree.

## Decision 4: Validate Finite Envelopes at Authored Keys Only

**Decision**: Represent rider limbs and torso as height-scaled capsules, the head as a circle, frame
and steering members as capsules, and wheels/crank/saddle/handlebar as circles, capsules, or convex
segments. Use signed closest separation with `CLEARANCE_EPSILON_M = 0.001`. Separation at or above
`-epsilon` is valid, so boundary touching is allowed; deeper overlap is invalid. Exempt only the
designated hand, foot, and geometry-inferred upper saddle contact surfaces. Evaluate authored
keyframes only, never interpolated samples.

**Rationale**: Centerline tests allow visibly thick body parts through tubes. Finite envelopes match
the side-view drawing, are deterministic, and keep 64-key batch validation within the interaction
budget. One millimetre matches project coordinate precision without adding a visible safety gap.

**Alternatives considered**:

- Landmark point tests: rejected because segments can cross while endpoints remain clear.
- Full rigid-body collision during authoring: rejected because static keyframe validation needs no
  impulses or integration.
- Validate interpolation: rejected by clarification; only authored keys gate calculation.

## Decision 5: Resolve Direct Pose Edits Along a Deterministic Path

**Decision**: Validate a requested target vector against its accepted baseline. If invalid, perform
a fixed-iteration bisection along that target-space segment and return the furthest valid target plus
all limiting reasons at the request. Batch validation after a bicycle edit reports conflicts for
every authored key without rewriting targets. Legacy invalid keys receive no automatic correction.

**Rationale**: This preserves the existing nearest-valid editing behavior without a general
optimization solver or non-deterministic search. It separates interactive correction from the
explicit no-silent-rewrite rule for existing keys.

**Alternatives considered**:

- Reject every invalid direct edit completely: rejected because it gives poor boundary feedback.
- Optimize all joints for Euclidean nearest pose: rejected because weighting and local solutions are
  opaque.
- Rewrite invalid keys after bike edits: rejected by the specification.

## Decision 6: Keep Total Bike Mass Authored and Derive Mass Properties

**Decision**: Keep `bike.mass` as total bike mass. Use a versioned representative component
distribution whose ratios sum to one across frame, wheels, fork/steering, cockpit, drivetrain,
saddle/post, and rear hardware. Place components on canonical landmarks, calculate bike center of
gravity and planar inertia with the parallel-axis theorem, combine them with existing rider segment
masses at sampled pose landmarks, and apply the result to the simulated body instead of assigning
all mass uniformly to two wheel colliders.

**Rationale**: Geometry cannot determine total mass without materials and component weights, but it
can determine where declared mass acts. A versioned approximation makes geometry physically
meaningful while keeping assumptions inspectable and deterministic.

**Alternatives considered**:

- Infer total mass from tube lengths: rejected because material and components are unknown.
- Keep the two-wheel density model: rejected because geometry would not affect CoG or inertia.
- Add component mass controls: rejected as unnecessary scope for this release.

## Decision 7: Separate Structural Parsing, Drafts, and Solve Eligibility

**Decision**: Zod and Serde parse structurally valid v3 scenarios. Invalid in-progress bicycle
combinations remain in a web-only `DesignerDraft` and are not applied. A semantically valid bike may
be applied even when it invalidates pose keys; conflicts remain derived Designer state, the scenario
remains saveable, and solver submission is blocked by Rust design validation.

**Rationale**: Users need to correct invalid combinations without corrupting the active scenario and
must preserve authored pose targets while fitting a new valid bike. Derived validation results cannot
become stale persisted data.

**Alternatives considered**:

- Put draft validity into the scenario schema: rejected because transient UI state is not physics.
- Reject valid bike changes that conflict with poses: rejected because it hides correction work.
- Persist conflict lists: rejected because they derive deterministically from scenario inputs.

## Decision 8: Rename Canonically and Preserve Compatibility

**Decision**: Make `/designer` canonical, redirect `/pose` with replacement navigation, rename all
user-facing and accessible labels, and preserve established pose region IDs as compatibility aliases
while adding stable bike-control and conflict-summary IDs. Revise the wireframe sheet and rendered
prototype before the application page.

**Rationale**: The new name reflects the combined workflow. Redirecting protects bookmarks, while
stable IDs avoid unrelated integration churn.

**Alternatives considered**:

- Keep `/pose` canonical: rejected because product terminology and URLs would diverge.
- Remove `/pose`: rejected because bookmark compatibility is required.
- Rename every existing test ID: rejected because those regions retain pose-authoring meaning.

## Decision 9: Extend the Existing Worker Without Changing Frame Layout

**Decision**: Add geometry inspection, single-edit resolution, and complete design-validation
commands to the existing solver worker/gateway. Return typed JSON validated by the shared schema.
Keep geometry scenario-level and do not add it to every run frame. Bump scenario, model, and solver
versions; bump frame layout only if new mass-property telemetry is added to recorded frames.

**Rationale**: Geometry does not need per-frame duplication, and worker execution protects the UI
budget. Existing request IDs and cancellation patterns handle stale rapid-edit results.

**Alternatives considered**:

- Validate synchronously in React: rejected because it duplicates authority and can block editing.
- Add geometry landmarks to every frame: rejected because rigid transforms place static local data.
- Create a second worker: rejected because WASM initialization and cancellation already exist.
