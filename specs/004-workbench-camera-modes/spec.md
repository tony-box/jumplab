# Feature Specification: Workbench Camera Modes

**Feature Branch**: `004-workbench-camera-modes`

**Created**: 2026-08-26

**Status**: Draft

**Input**: User description: "I want to fix the workbench view of the app. Right now it is super zoomed out from the bike/model. Let's introduce camera modes so the user can easily see the model. The default should be a follow mode. Then the alternate should be a pan and zoom mode. There should be a reset view that switches back to follow and the default zoom. The default zoom should capture the bike/model and the beginning of the jump. That means we don't need such a long approach or run out after the jump."

## Clarifications

### Session 2026-08-26

- Q: How should Follow mode compose the view after the bike passes the jump takeoff? → A: Keep the bike left-of-center and show terrain ahead.
- Q: How much of the stage height should the complete rider-and-bike model occupy at the default Follow zoom? → A: 28–36% of stage height, targeting 32%.
- Q: Should Pan & Zoom support keyboard controls in addition to pointer, touch, wheel, and pinch gestures? → A: Arrow keys pan; plus and minus keys zoom.
- Q: What zoom range should Pan & Zoom allow relative to the default Follow zoom? → A: 0.5×–3× the default Follow zoom.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the bike clearly by default (Priority: P1)

A user opens the workbench to inspect a run and, without touching any view controls, sees the
rider and bike model rendered large enough to actually study its posture and geometry, framed
around the bike's current position and the start of the jump rather than the entire approach,
landing, and rollout.

**Why this priority**: This is the core complaint driving the feature — the stage is currently so
zoomed out that the model is hard to see. Fixing the default view delivers value even if no other
capability ships.

**Independent Test**: Load any scenario in the workbench and confirm, with no user interaction,
that the rider/bike model appears clearly visible and appropriately framed, and that the camera
keeps the bike framed as the run plays.

**Acceptance Scenarios**:

1. **Given** a scenario is loaded and playback has not started, **When** the workbench stage
   renders, **Then** the camera is in Follow mode and the view is framed on the bike/model and the
   beginning of the jump, not the full approach-to-rollout span.
2. **Given** the run is playing in Follow mode, **When** the bike moves through the approach, jump,
  and landing, **Then** the camera keeps the bike clearly visible left-of-center with terrain ahead
  throughout, without the user adjusting anything.
3. **Given** two scenarios with different jump geometry (e.g., different gap or lip height),
   **When** each is loaded, **Then** the default Follow framing adapts so the bike and jump takeoff
  remain visible once each bike enters the near approach.
4. **Given** the camera is in Pan & Zoom mode, **When** a different scenario or run becomes active,
  **Then** the camera resets to Follow mode while preserving the user's chosen zoom.

---

### User Story 2 - Freely inspect the stage with Pan & Zoom (Priority: P2)

A user wants to closely examine a specific moment or region of the jump (for example, the landing
transition or a force overlay at peak height) that the automatic Follow framing doesn't emphasize,
so they switch to a manual Pan & Zoom mode and move/zoom the camera themselves.

**Why this priority**: Builds on the default view by giving users control for detailed inspection,
but is not required for the basic "I can see my bike" fix.

**Independent Test**: Switch the camera mode control to Pan & Zoom, then pan and zoom the stage and
confirm the view responds to user input and stops auto-following the bike.

**Acceptance Scenarios**:

1. **Given** the workbench is in Follow mode, **When** the user selects Pan & Zoom mode, **Then**
   the camera stops automatically recentering on the bike and instead holds its current position
   and zoom.
2. **Given** Pan & Zoom mode is active, **When** the user pans (drags) or zooms (scrolls/pinches)
   the stage, **Then** the visible framing updates accordingly and stays exactly as set.
3. **Given** Pan & Zoom mode is active, **When** the user presses an arrow key or the plus or minus
  key, **Then** the view pans in the corresponding direction or zooms in or out.
4. **Given** Pan & Zoom mode is active and the user does nothing further, **When** the simulation
   continues playing or is scrubbed, **Then** the camera framing does not change on its own.
5. **Given** Pan & Zoom mode is active, **When** the user zooms in or out repeatedly, **Then** the
  zoom stops at 0.5× or 3× the default Follow zoom, respectively.
6. **Given** either camera mode is active, **When** the user adjusts the Zoom slider, **Then** the
  view updates to the selected zoom while preserving the active mode.

---

### User Story 3 - Get back to a sane view with Reset (Priority: P3)

After panning and zooming around, a user loses track of the bike or wants to return to a clean,
predictable view without manually re-centering and re-zooming by hand.

**Why this priority**: A convenience/recovery action that depends on the other two modes already
existing; valuable but not the primary fix.

**Independent Test**: While in Pan & Zoom mode with a custom pan/zoom applied, trigger Reset View
and confirm the camera returns to Follow mode at the default zoom framing.

**Acceptance Scenarios**:

1. **Given** the camera is in Pan & Zoom mode with a custom pan/zoom applied, **When** the user
   activates Reset View, **Then** the camera mode switches to Follow and the framing returns to the
   default zoom describing the bike/model and the beginning of the jump.
2. **Given** the camera is already in Follow mode, **When** the user activates Reset View, **Then**
   the view remains in Follow mode at the default zoom (no unexpected change).
3. **Given** Reset View is activated mid-playback, **When** the reset completes, **Then** Follow
   mode resumes tracking the bike's current position at the default zoom rather than jumping back
   to the start of the run.
4. **Given** the user has selected a non-default zoom, **When** the user switches modes, solves a new
  run, changes scenario, plays, pauses, or scrubs, **Then** that zoom remains unchanged until Reset
  View is activated.

---

### Edge Cases

- What happens when the jump geometry is unusually short or long (extreme gap, lip height, or
  landing length)? The default Follow framing must prioritize keeping the complete bike/model at
  28–36% of stage height and 32–38% from the left edge without clipping. The takeoff is shown once
  it enters the resulting forward view; distant takeoffs do not cause the camera to zoom out.
- What happens if the user is mid-pan/zoom when the run finishes or is reset/rewound? Camera state
  (mode, pan, zoom) is not disturbed by playback events other than an explicit mode switch or Reset
  View.
- What happens if a different scenario or run becomes active while the user is in Pan & Zoom?
  Camera mode resets to Follow and manual pan is cleared, but the chosen zoom is preserved.
- What happens if the user zooms out as far as allowed and then pans in Pan & Zoom mode? The bike
  may move outside the visible frame — this is expected manual-mode behavior, not an error.
- What happens on very small (tablet) viewports? Follow and Pan & Zoom must both remain usable,
  consistent with the product's desktop and tablet support.
- What happens when switching directly from Follow to Pan & Zoom (not via Reset)? Pan & Zoom starts
  from whatever framing Follow was last showing, rather than jumping to some other default.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The workbench stage MUST support two camera modes: Follow and Pan & Zoom.
- **FR-002**: The workbench MUST start in Follow mode at 1× zoom on initial application load. When
  the active scenario or run identity changes, it MUST reset mode to Follow and clear manual pan
  while preserving the user's chosen zoom.
- **FR-003**: In Follow mode, the camera MUST automatically keep the bike/rider model framed in the
  visible stage with its horizontal reference point 32–38% from the left edge and more terrain
  visible ahead than behind as the simulation plays or is scrubbed, with no user input required.
- **FR-004**: In Follow mode, the default zoom MUST frame the bike/rider model together with the
  beginning/takeoff area of the jump once it enters the camera's forward view, then show terrain
  ahead after the bike passes the takeoff. The complete rider-and-bike model MUST occupy 28–36% of
  the stage height, targeting 32%; this model-size requirement and FR-003 positioning take
  precedence over showing a distant takeoff. The view MUST NOT require showing the full approach runway or the full
  post-landing rollout distance when they are not near the bike's current position.
- **FR-005**: The default Follow framing MUST adapt to each scenario's specific jump geometry (e.g.,
  gap, lip height, entry position) while preserving FR-003 and FR-004; the jump takeoff MUST become
  visible when it naturally enters the forward view and MUST NOT force a wider zoom before then.
- **FR-006**: The system MUST provide a visible, discoverable control for the user to switch between
  Follow and Pan & Zoom modes.
- **FR-007**: In Pan & Zoom mode, the user MUST be able to manually pan (move) and zoom the visible
  framing using standard pointer/touch drag for panning, scroll or pinch gestures for zooming,
  arrow keys for panning, and plus and minus keys for zooming. An always-available Zoom slider MUST
  set the zoom directly in both Follow and Pan & Zoom modes.
- **FR-008**: In Pan & Zoom mode, the camera MUST NOT automatically recenter on the bike; the
  framing MUST remain exactly as the user set it while the simulation plays, is scrubbed, or is
  paused.
- **FR-009**: Pan & Zoom mode MUST constrain the zoom level to 0.5×–3× the default Follow zoom.
- **FR-010**: The system MUST provide a Reset View action that is accessible regardless of the
  current camera mode.
- **FR-011**: Activating Reset View MUST switch the camera mode to Follow and restore the default
  1× zoom framing described in FR-004, centered on the bike's current position. No other in-session
  action, including mode changes, scenario/run identity changes, solves, playback, or scrubbing, may
  reset the chosen zoom.
- **FR-012**: Camera mode, panning, and zooming MUST be purely a display concern — they MUST NOT
  alter the underlying physics simulation results or recorded run data in any way.
- **FR-013**: The current camera mode MUST be clearly and continuously indicated to the user.

### Key Entities

- **Camera View State**: The current camera mode (Follow or Pan & Zoom) plus, when in Pan & Zoom,
  the user's chosen pan offset and zoom level for the workbench stage. Scoped to the active
  workbench session; not part of the physics simulation or run data.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On first render of any scenario at each supported desktop and tablet viewport, the
  complete rider-and-bike model occupies 28–36% of the workbench stage height without clipping and
  with no manual adjustment required.
- **SC-002**: Users can switch between Follow and Pan & Zoom modes in a single interaction.
- **SC-003**: Users can return from any pan/zoom state to the default framed Follow view in a
  single interaction.
- **SC-004**: While in Pan & Zoom mode, the chosen framing remains unchanged through playback,
  scrubbing, and pausing in 100% of cases, until the user changes it or resets.
- **SC-005**: Across scenarios with varied jump geometry, the default Follow view keeps the bike
  32–38% from the left edge without clipping and shows the relevant terrain ahead, including the
  jump takeoff once it enters the forward view, eliminating the need to manually zoom out
  immediately after loading a scenario.
- **SC-006**: Repeated camera interactions maintain input-to-paint p95 at or below 100 ms, at least
  55 frames per second, zero dropped frames in the standard interaction benchmark, and zero solver
  dispatches caused by presentation-only camera actions.

## Assumptions

- The existing full-scenario "Fit" camera option is superseded by this feature's default Follow
  framing; Follow becomes the sole default entry-point view and Fit is not required as a separate
  third mode.
- Pan & Zoom interactions follow standard, platform-conventional gestures (pointer/touch drag or
  arrow keys to pan; scroll wheel, pinch, or plus and minus keys to zoom), consistent with the
  product's desktop-and-tablet focus.
- Camera mode and any pan/zoom adjustments are session-only: they are not persisted across page
  reloads and are not saved as part of a run artifact.
- "Beginning of the jump" means the takeoff/lip area rather than the landing or rollout; the exact
  visible margin around the lip is an implementation detail left to design/plan. On long approaches,
  model size and left-of-center composition take priority until the lip enters the forward view.
- Switching camera modes or resetting the view does not pause, restart, or otherwise affect
  simulation playback.
