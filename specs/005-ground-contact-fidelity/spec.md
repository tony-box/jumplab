# Feature Specification: Ground Contact Fidelity

**Feature Branch**: `005-ground-contact-fidelity`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "We need to fix the workbench animation. Right now the bicycle doesn't respect the ground. It just falls through the ground like nothing is there."

## Clarifications

### Session 2026-08-26

- Q: When a user opens a run saved with the old ground-contact behavior, what should the workbench do? → A: Automatically regenerate and store the run's solution with the corrected solver while preserving its saved scenario inputs.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - The bike rides on the ground instead of through it (Priority: P1)

A user loads a scenario in the workbench and plays the run. Through the approach, up the takeoff
transition, and along the rollout, the bike's wheels stay on the ground surface. The bike never
sinks into, clips through, or passes beneath the terrain that is drawn on the stage.

**Why this priority**: This is the reported defect and the single most damaging credibility problem
in the product — a physics teaching tool whose bike ignores the ground cannot be trusted for
anything else. Fixing only this already restores a believable, inspectable run.

**Independent Test**: Play any bundled scenario end to end in the workbench and confirm that at
every moment where the run reports the bike is not airborne, both wheels sit on the rendered ground
line, and at no moment does any part of a wheel appear below that line.

**Acceptance Scenarios**:

1. **Given** a table-top scenario is loaded, **When** the run plays from entry through the approach,
   **Then** the wheels remain in contact with the approach surface and never dip below it.
2. **Given** the bike is rolling along flat ground, **When** the run advances, **Then** the bike's
   height above the ground stays constant within a documented tolerance rather than drifting
   downward.
3. **Given** the bike is climbing the takeoff transition, **When** the run advances, **Then** the
   wheels follow the curved lip surface rather than cutting a straight line through it.
4. **Given** the run has completed, **When** the user scrubs backwards and forwards through the
   timeline, **Then** the same ground-respecting positions are shown at the same timeline positions
   every time.

---

### User Story 2 - Landing is a real contact event (Priority: P2)

A user watches the bike come down from flight and wants to see it actually land: the wheels meet the
landing surface, the ground pushes back, and the bike continues along the landing slope and rollout
on top of the surface.

**Why this priority**: Landing is the moment users most want to study, and it is where "falling
through the ground" is most visible. It depends on User Story 1's contact behaviour existing first,
but it is separately demonstrable and separately valuable.

**Independent Test**: Play a scenario with a real gap and confirm the bike touches down on the
landing surface, the reported contact force rises from zero at touchdown, and the bike finishes the
run resting on the rollout surface rather than below it.

**Acceptance Scenarios**:

1. **Given** the bike is airborne, **When** its wheels reach the landing surface, **Then** the run
   reports a touchdown at that moment and the reported ground contact force rises from zero.
2. **Given** the bike has touched down, **When** the run continues to the end, **Then** the bike
   travels along the landing slope and rollout on the surface without sinking through it.
3. **Given** the bike is airborne with no surface beneath it, **When** the run advances, **Then** the
   reported ground contact force is zero for those frames.
4. **Given** a scenario whose flight path falls short of the landing, **When** the bike meets the
   near side of the gap or the landing face, **Then** it contacts that surface instead of passing
   through it.

---

### User Story 3 - The drawn ground is the simulated ground (Priority: P3)

A user compares what they see on the workbench stage with the numbers reported for the run and finds
that the ground line they are looking at is exactly the surface the simulation used, including the
curved takeoff lip.

**Why this priority**: Even perfect contact behaviour still looks broken if the stage draws a
different, simplified ground line than the one the simulation resolved against. This closes the gap
between "the physics is right" and "the user can see that the physics is right", but it has no value
until contact behaviour itself is correct.

**Independent Test**: Load a scenario with a pronounced curved lip and confirm the drawn ground
profile matches the simulated ground profile at every sampled point, and that the bike's wheels rest
on that drawn line during contact.

**Acceptance Scenarios**:

1. **Given** a scenario with a curved takeoff lip, **When** the workbench stage draws the terrain,
   **Then** the drawn profile reproduces the same curvature and heights the simulation used, not a
   straight-line approximation.
2. **Given** the run reports the bike is in contact with the ground, **When** the stage renders that
   frame, **Then** the rendered wheels touch the rendered ground line within a documented pixel
   tolerance.
3. **Given** a scenario is changed (different lip height, gap, or landing angle), **When** it is
   re-simulated and re-drawn, **Then** the drawn ground and the simulated ground change together and
   stay in agreement.

---

### Edge Cases

- What happens when entry speed is too low to leave the ground at all? The bike must roll over the
  lip and down the far side following the surface, never becoming airborne and never penetrating.
- What happens on a step-down where the ground drops away sharply? The bike must separate cleanly at
  the edge and travel ballistically, rather than being dragged down into the surface or snapped to
  it.
- What happens on a gap scenario where the bike falls into the gap? It must contact whatever surface
  exists at that location and stop penetrating there; the run must remain valid and reportable.
- What happens at very high speed or a coarse time step where the bike could pass through thin
  terrain between updates? The system must either prevent the pass-through or flag the configuration
  as outside its validated operating range rather than silently producing a run that ignores the
  ground.
- What happens when the front wheel is on the lip and the rear wheel is still on the flat? Both
  contact points must be respected simultaneously, and the bike's orientation must reflect the
  surface beneath both wheels.
- What happens at the exact crest of the lip, where the surface slope changes abruptly? Contact must
  transition without the bike jittering, sticking, or dropping through the crest.
- What happens when a saved scenario or run recorded under the previous behaviour is reopened? It
  automatically regenerates and stores its derived solution with the corrected solver while keeping
  its saved scenario inputs unchanged. If required inputs are missing or invalid, the workbench must
  report that regeneration cannot proceed and must not replay the known-invalid legacy solution.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The simulation MUST prevent the bike's contact points from penetrating the ground
  surface by more than a documented tolerance at every reported frame of every valid scenario.
- **FR-002**: Ground contact MUST produce a physically valid normal response that only ever pushes
  the bike away from the surface, and that response MUST fall to zero when the simulation determines
  the bike has separated from the surface.
- **FR-003**: Both the front and rear contact points MUST be resolved against the ground so that the
  bike's reported orientation responds to the slope of the surface it is riding on.
- **FR-004**: The airborne/grounded state reported for each frame MUST be derived from the actual
  resolved supporting contact impulse using a documented positive threshold rather than from a
  geometric clearance guess or the mere existence of a zero-impulse contact manifold.
- **FR-005**: The reported ground contact force MUST be the force actually produced by the contact
  response, MUST be zero whenever the bike is airborne, and MUST NOT be a substitute value derived
  from how far the bike has sunk into the ground.
- **FR-006**: The ground profile drawn on the workbench stage MUST reproduce the same segmented
  ground profile the simulation resolved against, including approach coverage from the scenario
  entry, takeoff transition curvature, intentional voids such as gaps, landing faces and slopes, and
  rollout, within a documented tolerance. Neither simulation nor rendering may connect separate
  surface segments across a void.
- **FR-007**: The rendered rider and bike MUST be placed so that, in every frame the run reports as
  grounded, the rendered wheels rest on the rendered ground line within a documented tolerance, and
  no rendered wheel extends below that line.
- **FR-008**: Rendering MUST represent the simulation's reported state only; it MUST NOT clamp,
  snap, offset, or otherwise correct the bike's position to hide penetration.
- **FR-009**: The system MUST detect and report when a scenario's simulation settings cannot
  reliably resolve ground contact for that geometry and speed, instead of producing a run that
  silently ignores the ground.
- **FR-010**: Corrected ground behaviour MUST be reproducible: identical scenario inputs and
  simulation settings MUST produce identical contact results within the documented tolerance across
  repeated runs.
- **FR-011**: Each ground-contact defect fixed by this feature MUST be captured as a minimal, stored
  regression scenario that fails against the previous behaviour and passes against the corrected
  behaviour.
- **FR-012**: The workbench MUST expose deterministic, inspectable checkpoints for contact
  state — at minimum, per-frame grounded/airborne state and the smallest clearance between the bike
  and the ground — so automated tests can assert ground behaviour without relying on elapsed time.
- **FR-013**: Published documentation of the physics model and its limitations MUST be updated to
  describe how ground contact is now resolved, the penetration tolerance, and what remains
  unmodelled.
- **FR-014**: The solver version identifier associated with runs MUST change, so runs produced
  before and after this correction are distinguishable.
- **FR-015**: When a run produced by an older solver version is opened, the workbench MUST
  automatically regenerate and store its derived solution with the corrected solver while
  preserving its saved scenario inputs. If required inputs are missing or invalid, the workbench
  MUST report that regeneration cannot proceed and MUST NOT replay the legacy solution.

### Affected Physical Quantities

- Wheel-to-surface clearance and penetration depth.
- Rear-wheel, front-wheel, and total supporting normal impulse and force.
- Grounded/airborne contact state and takeoff/touchdown transitions.
- Bike translation, pitch, angular velocity, and mechanical-energy accounting.
- Terrain segment geometry, including approach extent, takeoff curvature, intentional gaps,
  landing faces and slopes, and rollout.

### Key Entities

- **Ground Profile**: The single authoritative set of discontinuous side-view surface segments for a
  scenario — approach, takeoff transition and lip, optional table deck, intentional void, landing
  face and slope, and rollout — expressed in metres and shared by both the simulation and the stage
  drawing.
- **Contact State**: Per-frame record of whether the bike is touching the ground, which contact
  points are touching, the resulting normal force, and the clearance between each contact point and
  the surface.
- **Run Frame**: The reported per-frame state of a run — time, position, velocity, orientation,
  contact state — that the workbench draws and that reports and tests read.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Across every bundled scenario, the deepest penetration of any bike contact point into
  the ground is no worse than 0.01 m at any reported frame, in 100% of runs.
- **SC-002**: In 100% of frames reported as grounded, the ground contact force is greater than zero;
  in 100% of frames reported as airborne, it is exactly zero.
- **SC-003**: On the workbench stage at every supported desktop and tablet viewport, no part of a
  rendered wheel appears below the rendered ground line by more than 2 pixels in any grounded frame,
  across every bundled scenario.
- **SC-004**: 100% of scenarios listed in the canonical ground-contact scenario manifest finish with
  the bike resting on a ground surface rather than below it or in free fall past the end of the
  profile.
- **SC-005**: Re-running any scenario with unchanged inputs reproduces identical contact states and
  positions within the documented tolerance, 100% of the time.
- **SC-006**: A user watching any bundled scenario play can identify the moment of touchdown from
  the animation alone, without consulting numeric readouts.
- **SC-007**: Simulation and playback performance is not degraded: the standard scenario benchmark
  stays within its existing budget and workbench playback holds at least 55 frames per second with
  zero dropped frames in the standard interaction benchmark.
- **SC-008**: In 100% of legacy-run compatibility tests with complete valid inputs, opening a legacy
  run automatically replaces its derived solution with a corrected result and current solver
  version while leaving its saved scenario inputs unchanged; tests with missing or invalid inputs
  report the regeneration failure and never replay the legacy solution.

## Assumptions

- "Respecting the ground" means non-penetration plus a valid normal response, as required by the
  project's simulation constraints. It does not introduce tyre friction, rolling resistance, or
  aerodynamic drag, which remain explicitly out of scope for the physics model.
- The existing fixed horizontal entry-speed treatment stays as-is for this feature; correcting
  slope-driven acceleration and deceleration is a separate fidelity concern and is not required to
  stop the bike falling through the ground.
- Full suspension travel dynamics and an articulated rider transmitting load into the contact points
  are not required by this feature. This is an approved temporary exception to Constitution
  Principle II, owned by the project maintainer and limited to feature 005. The bike and rider may
  be treated as one rigid mass with two wheel contacts only to correct non-penetration, measured
  contact, and terrain agreement. The exception expires before rider posture, body movement,
  suspension setup, or bike frame type may be claimed to affect takeoff, flight, landing, or contact
  loading. A required follow-up specification MUST model rider position, rider weight transfer and
  active movement, suspension compression and rebound, and how those coupled dynamics affect
  takeoff, airborne rotation, landing, and ground loads.
- A wheel is "grounded" only when its solved supporting normal impulse exceeds the documented
  `CONTACT_IMPULSE_EPSILON`; a zero-impulse contact manifold does not count as grounded. The bike is
  airborne only when neither wheel is grounded under that definition.
- The 0.01 m penetration tolerance and 2 pixel rendering tolerance are working defaults chosen to be
  imperceptible at the workbench's default framing; they may be tightened during planning but must
  not be loosened without documented justification.
- Existing scenario definitions do not need to change shape; the ground profile they already
  describe is sufficient input for correct contact resolution. Terrain generation must use
  `entry.startX` to cover the complete approach and must represent gaps as true absence of surface,
  not as interpolation between the lip and landing.
- "Canonical ground-contact scenario manifest" means the checked-in manifest under
  `tests/fixtures/scenarios/ground-contact/`; every entry is included in SC-001, SC-002, SC-004, and
  SC-005 acceptance runs.
- Previously saved runs produced under the old behaviour are migrated in place by replacing only
  their derived solution and solver version; saved scenario inputs and run identity remain
  unchanged. Stored current-version fixture expectations will need regeneration.
- The workbench camera behaviour introduced previously is unaffected; this feature changes what is
  drawn and simulated, not how the view is framed.
