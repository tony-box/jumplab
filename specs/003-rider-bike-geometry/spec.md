# Feature Specification: Coherent Rider and Bike Geometry

**Feature Branch**: `[003-rider-bike-geometry]`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "Fix the rider/model geometry so the Pose page displays a rider in a credible human position, add an elbow joint, carry the same pose into the Workbench, and replace the Workbench's triangle-and-wheels representation with recognizable bike geometry."

## Clarifications

### Session 2026-08-26

- Q: Should the elbow angle be calculated automatically to keep the rider's hands on the handlebars, or directly controlled by the user? → A: Calculate the elbow angle automatically from arm lengths and handlebar contact.
- Q: How should the rider's paired arms and legs appear in the side-view model? → A: Draw both arms and legs using the same pose state.
- Q: How should bicycle landmarks such as saddle height, handlebar position, and frame-tube layout be determined when the scenario lacks those dimensions? → A: Use existing dimensions plus documented schematic proportions.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author a Credible Rider Pose (Priority: P1)

As a rider or coach, I can view and adjust an articulated side-view rider whose connected body segments form a credible human posture on the bike, including a visible elbow that follows arm geometry and handlebar contact.

**Why this priority**: A readable human pose is necessary for users to understand what movement they are authoring and how joint changes affect body position.

**Independent Test**: Open the Pose view, select a keyframe, adjust available pose targets through their valid ranges, and verify that the elbow is calculated from the arm lengths and handlebar contact while the connected rider remains finite and anatomically ordered.

**Acceptance Scenarios**:

1. **Given** a valid movement keyframe is selected, **When** the Pose view is displayed, **Then** the rider has recognizable head, torso, pelvis, paired upper-arm, forearm, thigh, lower-leg, hand, and foot geometry connected through the corresponding joints.
2. **Given** the rider's hands and feet are assigned to bike contact points, **When** the user changes an available pose target, **Then** the shoulder, elbow, and hand remain connected, the elbow is recalculated, and the hand maintains its required contact without an impossible limb length.
3. **Given** the requested pose would require an elbow angle or other joint state outside its allowed range, **When** the pose is evaluated, **Then** the displayed pose remains valid and the limiting joint or reach condition is identified.
4. **Given** the user resets the selected keyframe to neutral, **When** the reset completes, **Then** the rider returns to a credible neutral riding stance with bent, connected limbs and valid hand and foot contacts.

---

### User Story 2 - See the Authored Pose in Workbench (Priority: P1)

As a rider or coach, I can move from Pose to Workbench and see the same rider posture at the corresponding movement point so that the movement I authored is the movement I evaluate.

**Why this priority**: A mismatch between authoring and evaluation breaks trust and prevents users from learning through visible cause and effect.

**Independent Test**: Create a visibly bent-elbow pose at a keyframe, apply it to the scenario, open Workbench at that movement point, and compare the rider's joint angles, proportions, orientation, and bike contacts between the two views.

**Acceptance Scenarios**:

1. **Given** a valid pose has been authored for a keyframe, **When** the user opens Workbench and displays the corresponding movement point, **Then** the same joint configuration, body proportions, and contact relationships are shown.
2. **Given** Workbench displays a point between authored keyframes, **When** the movement is advanced or scrubbed, **Then** all represented joints, including the elbow, transition continuously according to the movement's selected interpolation behavior.
3. **Given** the scenario's rider dimensions change, **When** either Pose or Workbench displays the rider, **Then** both views reflect the same updated body proportions without changing the authored joint intent.
4. **Given** a valid pose edit is applied to the active movement, **When** Workbench opens, **Then** the updated rider is shown without silently substituting a neutral or decorative pose.

---

### User Story 3 - Inspect Recognizable Bicycle Geometry (Priority: P2)

As a rider or coach, I can see a recognizable side-view bicycle in Pose and Workbench so that rider posture, contact points, frame dimensions, and motion are understandable in context.

**Why this priority**: Rider posture cannot be judged credibly against an abstract triangle; the bicycle must expose the landmarks that determine fit and contact.

**Independent Test**: Display a scenario in both views and verify that the bike includes two wheels plus a coherent frame, crank/pedal location, saddle, fork, steering and handlebar geometry, with rider contacts aligned to the displayed bike.

**Acceptance Scenarios**:

1. **Given** a valid bike is loaded, **When** Pose or Workbench displays it, **Then** users can distinguish the front and rear wheels, axles, frame, crank and pedals, saddle and seat support, fork, steering axis, and handlebars.
2. **Given** bike dimensions are changed, **When** the bike is redisplayed, **Then** its visible wheel, frame, steering, saddle, crank, and contact landmarks remain mutually connected and reflect the changed dimensions while unspecified landmarks follow the documented schematic proportions.
3. **Given** the rider is displayed on the bike, **When** the scene is inspected, **Then** hands meet the handlebar contacts and feet meet the pedal contacts without unexplained gaps or attachment to empty space.
4. **Given** a supported suspension or steering orientation changes during a run, **When** Workbench displays that frame, **Then** affected bicycle parts remain connected and the rider contacts follow the corresponding bike landmarks.

### Edge Cases

- The requested posture cannot satisfy joint limits and both hand and foot contacts at the same time.
- A rider's proportions are near the minimum or maximum supported values for the selected bicycle.
- The elbow is fully flexed or extended at its valid limit.
- A limb or bicycle dimension is missing, non-finite, or outside its valid range.
- A movement point falls before the first keyframe, after the last keyframe, or exactly on a keyframe.
- Interpolation crosses a joint-angle boundary where an equivalent angle could otherwise cause a limb to flip direction.
- A scenario declares a joint limit whose sign contradicts its authored flexion target.
- A previously solved run does not contain the rider state that this feature added.
- The bicycle is shown with rigid, hardtail, or full-suspension geometry.
- The canvas is resized or displayed at a supported tablet viewport; the rider and bicycle must remain framed and readable without distortion, clipping, or overlap with controls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Pose and Workbench MUST use one shared definition of rider body proportions, joint meanings, joint limits, and bicycle contact relationships for the active scenario.
- **FR-002**: The displayed rider MUST include connected geometry for the head, torso, pelvis, both upper and lower arms, both upper and lower legs, hands, and feet, with visible shoulder, elbow, hip, knee, and ankle articulation. Each paired set of limbs MUST use the same side-plane pose state and MUST NOT imply independent limb controls or physical state.
- **FR-003**: The pose evaluation MUST calculate the elbow angle from the rider's arm lengths, shoulder position, and required handlebar contact; movement keyframes MUST NOT require an independently authored elbow target.
- **FR-004**: Wherever achieved joint states are presented, the calculated elbow value, valid range, and limiting state MUST remain synchronized with the selected keyframe and displayed pose.
- **FR-005**: Rider dimensions and joint targets MUST determine the displayed segment lengths and orientations; the product MUST NOT substitute a decorative posture that disagrees with the active scenario or movement point.
- **FR-006**: The pose representation MUST preserve connected body segments, valid segment lengths, finite positions, anatomically ordered joints, and required bike contacts for every accepted edit.
- **FR-007**: When a requested pose cannot satisfy all joint, reach, and contact constraints, the product MUST display a valid constrained result and identify the limiting condition rather than drawing disconnected, inverted, or non-finite anatomy.
- **FR-008**: The neutral pose MUST represent a credible riding stance with bent arms and legs, a forward-oriented head and torso, and valid hand and foot contacts for supported rider and bike dimensions.
- **FR-009**: Workbench MUST display the active movement pose that corresponds to its current movement point, including all represented joints and the elbow, rather than a fixed rider silhouette.
- **FR-010**: At an authored keyframe, Pose and Workbench MUST agree on joint configuration, rider proportions, rider orientation relative to the bicycle, and hand and foot contact locations within the documented comparison tolerances.
- **FR-011**: Between authored keyframes, Workbench MUST show continuous joint movement according to the selected interpolation behavior and MUST avoid unintended limb flips, discontinuities, or changes in segment length.
- **FR-012**: Pose and Workbench MUST display recognizable bicycle geometry consisting of two wheels and connected frame, crank/pedal, saddle/seat support, fork, steering, and handlebar landmarks. Landmarks without corresponding scenario dimensions MUST use documented, deterministic schematic proportions derived from the available bike dimensions.
- **FR-013**: Displayed bicycle landmarks MUST be derived from the active bike's physical dimensions and state wherever those quantities are available. Schematic proportions MUST be visually and descriptively treated as representative geometry, and unavailable physical behavior MUST remain explicitly unavailable rather than being invented as measured motion.
- **FR-014**: Rider hand and foot contacts MUST align with the displayed handlebars and pedals and remain aligned as the supported bike state or rider pose changes.
- **FR-015**: Supported frame and suspension configurations MUST remain visually coherent, with wheels, frame members, steering assembly, saddle, crank, and contact points connected throughout displayed motion.
- **FR-016**: Existing valid scenarios and movement presets MUST produce a calculated elbow state when loaded without requiring migration or changing their authored pose targets.
- **FR-017**: Saved, duplicated, imported, and exported scenarios and movements MUST preserve the rider dimensions, bike dimensions, contact relationships, and authored pose targets needed to reproduce the calculated elbow and displayed geometry.
- **FR-018**: Geometry changes MUST preserve existing Pose and Workbench workflows, keyboard operation, accessible names, selected and limiting states, and designated primary actions.
- **FR-019**: Both stages MUST keep stable dimensions and frame the complete relevant rider and bicycle at supported desktop and tablet viewports without incoherent overlap, clipping, or distortion.
- **FR-020**: Deterministic visual checkpoints MUST cover neutral, authored, constrained, interpolated, and supported suspension states in both Pose and Workbench, including a cross-view comparison of the same authored keyframe.
- **FR-021**: The product MUST define and document one canonical meaning and sign for every represented rider joint, and MUST apply the active scenario's joint limits when producing achieved pose values. A one-time correction of bundled scenario and preset joint limits that contradict their authored flexion targets is permitted; that correction MUST preserve authored pose targets, MUST NOT change the scenario schema version or require user-data migration, and MUST be disclosed as a known change.
- **FR-022**: When a previously solved run lacks the rider state introduced by this feature, the product MUST identify that run's rider posture as unavailable and MUST NOT substitute current scenario edits, a guessed posture, or a decorative neutral pose. All other outputs of that run MUST remain available and unchanged.

### Scope Boundaries

**Included**:

- Improving the side-view rider from an abstract stick or malformed pose into a connected, proportionate articulated human figure.
- Displaying both arms and both legs from the shared side-plane pose state.
- Adding elbow calculation, constraints, and display wherever achieved rider joints are represented.
- Using the same active movement pose and rider proportions in Pose and Workbench.
- Replacing abstract bicycle presentation with recognizable geometry tied to the active bike dimensions and state.
- Keeping rider hands and feet aligned to visible bicycle contact points.
- Compatibility behavior for existing scenarios and movement presets that predate displayed elbow state.

**Out of Scope**:

- Photorealistic illustration, clothing, facial detail, rider musculature, or branding.
- Front, rear, three-dimensional, steering-turn, or lateral rider and bicycle views.
- New aerodynamic, tire-friction, steering, or lateral-motion physics.
- Claiming biomechanical coaching correctness or real-world safety from visual plausibility alone.
- Adding new bicycle setup controls unless an existing physical quantity is required to produce coherent geometry.

### Key Entities

- **Rider Geometry**: The rider's dimensions and connected body landmarks, including segment lengths and the relationship among head, torso, pelvis, arms, and legs.
- **Joint State**: A target and, when available, achieved position for a rider joint. The elbow has a calculated achieved position, valid range, and any limiting condition but no independently authored target.
- **Rider Pose**: The complete joint configuration and body orientation at one movement point, constrained by rider dimensions and bicycle contacts.
- **Bicycle Geometry**: The wheels, frame, crank/pedals, saddle, fork, steering, handlebars, and suspension landmarks derived from the active bike configuration, with documented schematic proportions supplying landmarks that lack scenario dimensions.
- **Contact Relationship**: The required attachment between rider hands and handlebars and between rider feet and pedals at a displayed movement point.
- **Movement Keyframe**: An authored distance-relative set of pose targets that contributes to the rider pose, including its calculated elbow state, displayed in both Pose and Workbench.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all approved neutral, authored, constrained, and boundary-pose checks, 100% of required rider segments remain connected and 100% of required hand and foot contacts meet their displayed bicycle landmarks within the documented comparison tolerances.
- **SC-002**: At every tested authored keyframe, Pose and Workbench produce matching joint configuration, rider proportions, orientation, and contact locations within the documented comparison tolerances.
- **SC-003**: In a structured review with at least eight representative riders or coaches, each shown the unlabeled side view and asked to name what they see, at least 90% identify the figure as a human in a riding posture and identify the bicycle's frame, pedals, saddle, fork, and handlebars.
- **SC-004**: Users can select a keyframe, make a pose adjustment, apply the movement, and verify the same calculated bent-elbow posture in Workbench in under 60 seconds during usability testing.
- **SC-005**: Across the full supported range of rider dimensions, bike dimensions, joint limits, movement points, and supported viewport sizes, automated geometry checks report zero non-finite coordinates, disconnected required parts, unintended limb flips, or unexplained stage clipping.
- **SC-006**: Existing valid scenarios and movement presets load successfully with a credible calculated elbow state in 100% of compatibility tests and preserve all previously authored pose targets.

## Assumptions

- The learning objective is to let users understand how an authored body position fits the bicycle and carries into run visualization; visual plausibility supports comprehension but is not biomechanical validation.
- The feature remains a focused side-view two-dimensional representation. Both arms and both legs share the same pose state; paired limbs may overlap or use a small visual separation for readability, but they do not have independent controls or physical meaning in this scope.
- Existing rider dimensions, bike dimensions, movement keyframes, and supported bike states remain authoritative; this feature improves their coherent representation rather than introducing decorative substitutes. Joint limits also remain authoritative once the bundled limit-sign correction in FR-021 is applied.
- Some bundled scenario and preset data currently declares joint limits whose sign contradicts its authored flexion targets, which is why FR-021 permits a one-time correction of that bundled data.
- Bicycle landmarks not represented by an existing physical dimension use deterministic schematic proportions based on available dimensions; these proportions are representative display geometry, not measured setup values or new physical controls.
- Hands and feet are the required rider-to-bike visual contacts for this scope. Seat contact may be shown when implied by the pose but is not required for every dynamic riding posture.
- Elbow state is calculated rather than authored, so older movement data requires no elbow-target default or data migration.
- Comparison tolerances are documented in the geometry contract and validated consistently across both views.
- The existing Pose and Workbench wireframes continue to govern page structure, controls, stable region identifiers, accessibility, and responsive behavior.
