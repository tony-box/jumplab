# Feature Specification: Bike and Pose Designer

**Feature Branch**: `[006-bike-pose-designer]`

**Created**: 2026-09-01

**Status**: Draft

**Input**: User description: "Introduce editable bicycle geometry, prevent authored rider poses from obstructing the bicycle, and replace the Pose page with a Designer page for both bike and pose design. Bicycle geometry remains static throughout a physics calculation and does not need a timeline."

## Clarifications

### Session 2026-09-01

- Q: Must rider-to-bike clearance remain valid throughout the interpolated movement between pose keyframes? → A: Validate authored pose keyframes only; interpolated states are not a clearance gate.
- Q: How should pelvis-to-saddle contact be determined for each pose keyframe? → A: Infer contact automatically from geometry.
- Q: When bicycle dimensions change, how should they affect the bicycle's mass properties? → A: Keep an independently authored total bike mass and estimate center of gravity and rotational inertia from geometry using documented representative mass distributions.
- Q: How should geometry from 99spokes or similar databases enter Designer? → A: Use manual geometry entry only for this release.
- Q: At non-designated contact points, may rider geometry touch protected bicycle geometry as long as it does not pass through it? → A: Allow boundary touching within numerical tolerance but prohibit overlap.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author Poses That Fit the Bike (Priority: P1)

As a rider or coach, I can adjust each rider pose against the active bicycle and know that every
accepted pose remains outside the bicycle without passing through protected parts.

**Why this priority**: Pose editing is not trustworthy when the rider can pass through the frame or
controls. Preventing impossible rider-to-bike overlap is the essential behavior of this feature.

**Independent Test**: Load a bicycle and movement, attempt to move the pelvis through the top tube
and the torso or limbs through the steering assembly, and verify that the accepted pose remains
outside the protected bicycle geometry while the limiting part and reason are identified.

**Acceptance Scenarios**:

1. **Given** a valid bike and pose keyframe, **When** the user adjusts a rider joint within the
   available clearance, **Then** the pose updates while preserving valid hand, foot, and applicable
   saddle contacts.
2. **Given** a pose edit would move the pelvis below the top-tube clearance boundary within the
   frame span, **When** the user attempts the edit, **Then** the accepted pelvis position stops at
   the nearest valid position and the top-tube conflict is identified.
3. **Given** a pose edit would move the rider through a wheel, crank, fork, steering assembly,
  saddle, handlebar, or a non-exempt rider/frame pairing, **When** the user attempts the edit,
  **Then** the accepted pose is constrained to the nearest valid state and the conflicting rider
  and bicycle parts are identified. Projected limb crossings of central frame tubes are exempt
  because those shapes occupy separate lateral planes in the side-view model.
4. **Given** a rider hand, foot, or seated pelvis is at its designated bicycle contact, **When** pose
   clearance is evaluated, **Then** that intended contact is permitted without permitting the same
   body part to pass through the bicycle component.
5. **Given** no valid pose can satisfy clearance, contact, reach, and joint limits simultaneously,
   **When** the pose is evaluated, **Then** the last valid accepted pose is preserved and the user is
   told which constraints prevent the requested pose.

---

### User Story 2 - Design the Bicycle Geometry (Priority: P2)

As a rider or coach, I can change the bicycle's fit-critical dimensions and immediately inspect the
resulting bicycle, contact points, and rider clearance so that the scenario represents the bicycle I
want to study.

**Why this priority**: Collision-aware poses require explicit bicycle geometry, and editable
geometry lets users compare how bicycle fit changes posture and simulated motion.

**Independent Test**: Start from a valid bicycle, change wheel, frame, crank, saddle, fork, and
handlebar dimensions, and verify that the preview remains connected, dimensions are reported in
clear units, all pose keyframes are re-evaluated, and the applied geometry is preserved with the
scenario.

**Acceptance Scenarios**:

1. **Given** a valid bicycle is loaded, **When** the user changes a supported dimension within its
   valid range, **Then** the bicycle preview, named landmarks, rider contact points, and dimension
   readouts update together.
2. **Given** a geometry edit would create disconnected, inverted, intersecting, or otherwise
   impossible bicycle parts, **When** the user attempts to apply it, **Then** the invalid geometry is
   not applied and each blocking dimension or relationship is identified.
3. **Given** a valid geometry change makes one or more existing pose keyframes invalid, **When** the
   change is previewed, **Then** every affected keyframe and conflict is listed without silently
   changing authored pose targets.
4. **Given** unresolved pose conflicts remain after a geometry change, **When** the user attempts to
   calculate a run, **Then** calculation is blocked until every pose keyframe is valid for the
   applied bicycle.
5. **Given** a valid bicycle design and valid poses, **When** the scenario is saved, duplicated,
   exported, imported, or reopened, **Then** the same dimensions, landmarks, contacts, and clearance
   relationships are reproduced.

---

### User Story 3 - Design Bike and Movement in One Place (Priority: P3)

As a rider or coach, I can use one Designer page to edit the bicycle and the rider's movement while
seeing both in a shared side-view preview.

**Why this priority**: A unified workflow makes the dependency between bicycle fit and rider pose
visible and removes the false separation created by a pose-only page.

**Independent Test**: Open Designer from primary navigation, edit bicycle dimensions and pose
keyframes in the same workflow, and verify that only pose controls use the movement timeline.

**Acceptance Scenarios**:

1. **Given** the user opens the former Pose destination, **When** the page loads, **Then** its
   navigation label, page title, accessible name, and primary workflow identify it as Designer.
2. **Given** Designer is open, **When** the user switches between bicycle and pose controls, **Then**
   both control sets operate on the same scenario and shared rider-and-bike preview.
3. **Given** the pose timeline is visible, **When** the user selects or edits a keyframe, **Then**
   only pose values vary by keyframe and the displayed bicycle geometry remains unchanged.
4. **Given** a user follows an existing bookmark or in-product link to the Pose destination,
   **When** navigation completes, **Then** Designer opens without losing the active scenario or
   movement.

### Edge Cases

- Rider dimensions are too large or too small to fit the selected bicycle while preserving required
  contacts and joint limits.
- A valid individual bike dimension becomes invalid in combination with other dimensions.
- A bicycle dimension is missing, non-finite, outside its supported range, or uses an unsupported
  unit.
- A rider segment starts inside protected bicycle geometry because the scenario predates clearance
  validation.
- A geometry change invalidates the selected pose, a non-selected pose, or every pose keyframe.
- A pose lies exactly on a permitted contact or non-penetration boundary.
- The top tube is sloped, interrupted, or absent for a supported frame configuration.
- Suspension state changes the displayed component positions during playback even though the
  bicycle's authored base geometry remains static.
- A bicycle preset lacks one or more newly explicit fit dimensions that were previously schematic.
- The Designer is resized or displayed at a supported tablet viewport while long dimension values
  and conflict messages are visible.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The product MUST replace the user-facing Pose destination with a Designer destination
  that supports both bicycle geometry and rider pose authoring against one active scenario and one
  shared side-view preview.
- **FR-002**: Existing bookmarks, in-product links, and saved workflows that target the former Pose
  destination MUST continue to open the corresponding Designer workflow without data loss.
- **FR-003**: Designer MUST clearly separate bicycle controls from pose controls while keeping the
  dependency between them visible in the shared preview and validation state.
- **FR-004**: Designer MUST expose the physical dimensions needed to determine wheel and axle
  placement, frame layout, bottom bracket and crank placement, saddle placement, fork and steering
  layout, handlebar placement, and rider contact points. Each editable value MUST have a name, unit,
  valid range, and explanation of the physical quantity it controls. Users MUST enter these bicycle
  dimensions manually in this release.
- **FR-005**: At minimum, users MUST be able to configure wheel size, wheelbase, chainstay length,
  bottom-bracket position, crank length, seat-tube length and angle, saddle position, frame reach and
  stack or equivalent top-tube placement, head-tube angle, fork length and offset, and handlebar
  position for supported bicycle configurations.
- **FR-006**: Bicycle dimensions and their relationships MUST produce finite, connected,
  non-inverted geometry without unintended self-intersection. Invalid combinations MUST NOT be
  applied and MUST identify every blocking value or relationship.
- **FR-007**: The displayed bicycle and all collision boundaries MUST derive from the same active
  bicycle dimensions used to define rider contacts and physical calculation; decorative geometry
  MUST NOT substitute different dimensions or contact locations.
- **FR-008**: Bicycle edits MUST update the preview, dimension readouts, contact points, clearance
  boundaries, and validation results together so the user never sees mutually inconsistent states.
- **FR-009**: Bicycle geometry MUST be a single scenario-level configuration. It MUST NOT have
  keyframes or a bicycle timeline, and its authored values MUST remain constant throughout one
  physics calculation.
- **FR-010**: Dynamic positions caused by the calculated bicycle state, including supported
  suspension motion and whole-bike translation or rotation, MUST remain distinct from authored base
  geometry and MUST NOT create editable bicycle keyframes.
- **FR-011**: Pose keyframes MUST continue to define rider movement over the run, and each keyframe
  MUST be evaluated against the same active bicycle geometry before the scenario can be calculated.
  Interpolated states between valid authored keyframes MUST NOT be evaluated as rider-to-bicycle
  clearance gates and MUST NOT block calculation solely because of an intermediate clearance.
- **FR-012**: Every accepted authored pose keyframe MUST preserve joint limits, rider segment
  lengths, required rider contacts, and a documented zero-penetration tolerance against protected
  bicycle geometry after documented collision-layer exemptions are applied. Rider geometry MAY
  touch a protected boundary within that tolerance at a non-designated contact point but MUST NOT
  overlap or pass through it unless FR-014 explicitly classifies the projected pair as occupying
  separate lateral planes.
- **FR-013**: Protected bicycle geometry MUST include the wheels and tires, frame members, crank and
  non-contact pedal regions, saddle and seat support, fork and steering assembly, and handlebars.
- **FR-014**: Within the horizontal span of the frame, the accepted pelvis position MUST NOT cross
  below the top-tube clearance boundary. The rider's pelvis, torso, head, and non-contact portions of
  the limbs MUST NOT pass through wheels, crank or non-designated pedals, fork, head or steering
  assembly, handlebar except the designated hand, or saddle except inferred pelvis contact. In the
  side-view model, thigh, shank, upper-arm, and forearm capsules occupy lateral rider planes while
  the top tube, down tube, seat tube, chainstay, and seatstay occupy the bicycle center plane;
  projected crossings only between those limb capsules and central frame tubes MUST NOT be treated
  as collisions.
- **FR-015**: Designated hand-to-handlebar, foot-to-pedal, and applicable pelvis-to-saddle contacts
  MUST be permitted while still preventing the contacting body segment from passing through the
  associated bicycle part. Pelvis-to-saddle contact MUST be inferred from geometry when the pelvis
  reaches the saddle's permitted contact surface; it MUST NOT require an authored seated-state
  control.
- **FR-016**: When a pose edit requests an invalid state, Designer MUST preserve the nearest valid
  accepted state, identify the conflicting rider and bicycle parts, and distinguish clearance
  limits from reach limits and joint limits.
- **FR-017**: A bicycle geometry edit MUST re-evaluate every pose keyframe. Designer MUST identify
  all newly invalid keyframes and MUST NOT silently alter their authored pose targets.
- **FR-018**: A scenario with invalid bicycle geometry or any invalid pose keyframe MUST NOT be
  submitted for physical calculation. The blocking geometry, keyframes, and conflicts MUST remain
  available for correction.
- **FR-019**: Valid bicycle geometry MUST affect the physical quantities it defines, including
  contact locations, rider attachment points, mass placement, rotational response, and supported
  suspension relationships. An editable geometry value MUST NOT be presented as a physical control
  if it has no effect on the calculated model. Total bicycle mass MUST remain an independently
  authored input; the model MUST estimate bicycle center of gravity and rotational inertia from the
  active geometry, frame configuration, and documented representative mass distributions rather
  than calculating total mass from dimensions alone.
- **FR-020**: Saved, duplicated, imported, exported, and reopened scenarios MUST preserve the
  complete bicycle design, geometry validity, rider contacts, and authored pose targets needed to
  reproduce the same Designer state and calculation inputs.
- **FR-021**: Existing valid scenarios and presets that predate the explicit bicycle dimensions MUST
  open with documented compatible values derived from their existing bicycle configuration. This
  compatibility behavior MUST preserve existing authored pose targets and identify any pose that
  cannot satisfy the new clearance rules.
- **FR-022**: Geometry and pose validation MUST be deterministic: identical bicycle, rider, and pose
  inputs MUST produce identical accepted geometry, clearance results, and limiting reasons within
  documented tolerances.
- **FR-023**: Designer MUST preserve keyboard operation, accessible labels, visible focus,
  designated primary actions, stable layout regions, and readable validation feedback at supported
  desktop and tablet viewports.
- **FR-024**: The shared preview MUST keep the complete relevant rider and bicycle readable without
  clipping, distortion, incoherent overlap with controls, or layout shift as dimensions, poses, and
  validation messages change.
- **FR-025**: Published model documentation MUST distinguish authored static bicycle geometry from
  dynamic calculated bicycle state and document supported geometry ranges, clearance rules,
  tolerances, compatibility derivations, and effects on the physical model.

### Scope Boundaries

**Included**:

- Renaming and expanding the Pose destination into a unified Bike and Pose Designer.
- Editing fit- and calculation-relevant side-view bicycle dimensions with immediate visual and
  validation feedback.
- Preventing rider geometry from intersecting protected bicycle geometry while allowing intended
  rider contacts and the documented lateral-plane projection exception.
- Re-evaluating all pose keyframes when bicycle or rider dimensions change.
- Keeping bicycle geometry static across the pose timeline and one physics calculation.
- Preserving and upgrading existing scenarios, presets, links, and pose-authoring workflows.

**Out of Scope**:

- Bicycle geometry keyframes, frame-shape animation, or a bicycle timeline.
- Three-dimensional frame design, steering turns, lateral fit, manufacturing drawings, structural
  frame analysis, or component compatibility certification.
- Automatic bike-sizing recommendations, coaching prescriptions, or claims that a valid pose is
  safe or optimal in the real world.
- Rider-to-bicycle clearance guarantees for interpolated states between authored pose keyframes.
- Rider self-collision or collision with terrain during pose authoring unless required by an
  existing model constraint.
- Three-dimensional lateral-clearance measurement beyond the fixed rider-plane versus bicycle-center-plane
  collision-layer assumption.
- New aerodynamic drag, tire friction, steering, or lateral-motion physics.
- Decorative bicycle options that do not affect comprehension or the calculated model.
- Importing bicycle geometry from 99spokes or any other external geometry database. Existing
  whole-scenario import and export remain included.

### Affected Physical Quantities

- Wheel radius and front/rear axle separation and placement.
- Frame, bottom-bracket, crank, pedal, saddle, steering, handlebar, and rider contact locations.
- Rider segment positions, joint feasibility, rider-to-bicycle clearance, and supported contacts.
- Combined rider-and-bike mass placement, center of mass, rotational response, and inertia.
- Supported suspension attachment relationships and dynamic travel around the authored base
  geometry.
- Deterministic scenario inputs and the resulting run calculation.

### Key Entities

- **Bicycle Design**: The scenario-level set of authored dimensions and configuration choices that
  defines the bicycle's base side-view geometry and total mass and remains constant throughout one
  calculation.
- **Bicycle Landmark**: A named point or member derived from the bicycle design, such as an axle,
  bottom bracket, pedal, saddle, frame junction, steering point, or handlebar contact.
- **Protected Bicycle Geometry**: The bicycle members and component boundaries that rider geometry
  may contact only where a designated contact relationship allows it.
- **Rider Pose**: The complete rider joint and landmark state at a movement keyframe, evaluated
  against rider dimensions, bicycle contacts, joint limits, and bicycle clearances.
- **Clearance Result**: The deterministic validity outcome for one pose, including minimum
  separation, conflicting rider and bicycle parts, the limiting rule, and any nearest valid state.
- **Contact Relationship**: A designated permitted connection between a rider body part and a
  bicycle landmark, including hand-to-handlebar, foot-to-pedal, and geometry-inferred
  pelvis-to-saddle contact.
- **Designer Draft**: Bicycle or pose edits currently being previewed, including unresolved
  validation conflicts, before the scenario is eligible for calculation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In 100% of approved boundary and adversarial pose checks, every accepted authored pose
  keyframe has zero protected rider-to-bicycle intersections, preserves all required contacts, and
  meets the documented zero-penetration tolerance.
- **SC-002**: In 100% of bicycle geometry range and combination checks, applied designs produce
  finite, connected, non-inverted bicycle geometry and consistent landmarks, contacts, readouts, and
  clearance boundaries.
- **SC-003**: After any valid bicycle geometry change, 100% of pose keyframes are re-evaluated and
  every invalid keyframe is identified before calculation can begin.
- **SC-004**: Users can open Designer, modify a bicycle dimension, adjust a pose keyframe, resolve a
  deliberate clearance conflict, and apply a calculable scenario in under three minutes during
  usability testing; at least 90% complete the workflow without assistance.
- **SC-005**: Across every supported movement, the authored bicycle dimensions remain identical at
  every pose keyframe and calculated frame in 100% of inspected runs, while supported calculated
  translation, rotation, and suspension state remain available.
- **SC-006**: Existing scenarios, presets, bookmarks, and in-product links open in Designer without
  loss of authored pose targets in 100% of compatibility checks; any new geometry or clearance
  conflict is explicitly identified.
- **SC-007**: Identical bicycle, rider, and pose inputs reproduce identical geometry, accepted pose,
  conflict classification, and calculation inputs within documented tolerances in 100% of repeated
  checks.
- **SC-008**: At supported desktop and tablet sizes, 100% of Designer workflow checks complete with
  no clipped controls, unreadable values, incoherent overlap, unexpected horizontal scrolling, or
  blank and incorrectly framed previews.
- **SC-009**: During continuous dimension and pose adjustment, at least 95% of user-visible preview
  and validation updates appear within 100 milliseconds of input.

## Assumptions

- "Obstruct" means that rider body geometry intersects or crosses to a prohibited side of a
  protected bicycle boundary. It does not mean the rider must stay vertically above every bicycle
  landmark regardless of horizontal position.
- At non-designated contact points, rider geometry may touch a protected bicycle boundary within
  the documented numerical tolerance but may not overlap or pass through it. No additional visible
  safety gap is required, except that side-view projections of thigh, shank, upper arm, or forearm
  across top tube, down tube, seat tube, chainstay, or seatstay are not collisions because the model
  places those shapes in separate lateral planes.
- The lateral-plane exception does not apply to pelvis, torso, head, hands, or feet, and it does not
  exempt any limb or body collision with wheels, crank or non-designated pedals, fork, head or
  steering assembly, handlebar except the designated hand, or saddle except inferred pelvis contact.
- The pelvis remains above the top-tube clearance boundary while it is horizontally over the frame;
  a pelvis may be lower elsewhere only when it remains clear of protected bicycle geometry and all
  other pose constraints.
- Invalid direct pose edits follow the existing constrained-pose behavior by preserving the nearest
  valid accepted state and exposing the limiting reason.
- Clearance validation applies to authored pose keyframes only. Interpolated states between valid
  keyframes are not re-evaluated for rider-to-bicycle clearance and do not block calculation.
- Pelvis-to-saddle contact is inferred when the pelvis reaches the saddle's permitted contact
  surface. The pelvis may touch or rest on that surface but may not pass through the saddle.
- Valid bike edits may be previewed while they expose conflicts in existing poses, but the scenario
  cannot be calculated until all pose conflicts are resolved. Existing pose targets are never
  silently rewritten to make a new bicycle fit.
- The bicycle's authored base dimensions are static during a calculation. Whole-bike motion,
  orientation, wheel rotation, and supported suspension response are calculated state rather than
  bicycle design keyframes.
- Bicycle dimensions alone do not determine total mass. Users author total bicycle mass separately,
  while center of gravity and rotational inertia use documented representative mass distributions
  derived from the active geometry and frame configuration.
- Existing frame types and suspension configurations remain supported. A frame member that is absent
  by design has no collision boundary, while all present members use documented clearance envelopes.
- Existing scenarios with previously schematic saddle, frame, fork, or handlebar landmarks receive
  deterministic compatible dimensions derived from their current configuration.
- This release supports manual bicycle geometry entry only. Direct integrations and user-supplied
  geometry imports from external bicycle databases are deferred.
- A valid collision-free result is a model validity check, not a claim of biomechanical quality,
  riding safety, frame structural integrity, or real-world component compatibility.
