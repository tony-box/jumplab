# Phase 0 Research: Workbench Camera Modes

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-08-26

No `NEEDS CLARIFICATION` markers remained in the Technical Context. All four spec clarifications
(Follow composition, default model size, keyboard controls, zoom range) were resolved during
`/speckit-clarify`. This document records the remaining design decisions needed before Phase 1.

## R1: Where camera framing logic lives

**Decision**: Add a new pure module `apps/web/src/rendering/canvas/camera.ts` that maps
`(scenario, frame, cameraState, stageSize)` to a `WorldBounds` rectangle. `viewport.ts` remains an
unchanged generic world-to-CSS mapper that consumes those bounds.

**Rationale**: `workbench-stage.ts` currently hardcodes framing inline, computing `minX` from
`scenario.entry.startX` and `maxX` from gap plus landing plus rollout, with a `cameraShift` applied
only in follow mode. That is the direct cause of the zoomed-out default. Extracting a pure function
makes the 28-36% sizing rule and the 0.5x-3x clamp unit-testable without a canvas or a browser, which
the constitution's quality gates require. `viewport.ts` already derives `scale` from bounds and
letterboxes with padding, so bounds are the correct seam.

**Alternatives considered**: Extending `createCanvasViewport` with camera awareness was rejected
because `pose-stage.ts` also uses it and must not inherit workbench camera policy. Keeping the math in
`workbench-stage.ts` was rejected because canvas drawing code cannot be unit-tested cheaply.

## R2: Deriving the default Follow zoom from the model, not the scenario

**Decision**: Compute the rider-and-bike world-space bounding box for the current frame, take its
height `modelHeight`, and choose the view height so the model occupies a target fraction of stage
height. Target the midpoint of the accepted band (approximately 42%) so normal variation stays inside
28-36%, targeting 32%. View height becomes `modelHeight / targetFraction`, then the view width follows from the stage
aspect ratio.

**Rationale**: SC-001 is expressed as a fraction of stage height, and `createCanvasViewport` already
fits bounds by `Math.min(drawableWidth / worldWidth, drawableHeight / worldHeight)`. Deriving view
height from the model's own extent makes the criterion hold across viewport sizes, rider heights, and
bike geometry, satisfying FR-005 without scenario-specific tuning. `worldRiderGeometry` and
`worldBikeGeometry` in `workbench-stage.ts` already produce the world-space points needed.

**Alternatives considered**: A fixed metres-per-pixel scale was rejected because it cannot hold the
28-36% band across tablet and desktop. Framing from scenario geometry alone was rejected because it
reproduces the current defect, where a large gap or rollout shrinks the model.

**Note**: When `frame.landmarks` is absent (legacy runs), rider geometry is unavailable. The camera
must fall back to the bike bounding box plus a documented rider-height allowance from
`scenario.rider.height` so framing stays stable rather than snapping between frames.

## R3: Follow composition and horizontal bias

**Decision**: Place the bike 32–38% from the left edge of the view rectangle, giving roughly a 2:1
split of terrain ahead versus behind. Preserve the 28–36% model-height band and horizontal position
for all valid approach lengths; show the jump lip once it naturally enters the resulting forward
view rather than widening the view to include a distant lip.

**Rationale**: The clarified answer requires the bike left-of-center with terrain ahead (FR-003),
while FR-004 requires the takeoff once it enters the forward view. A bounded horizontal bias keeps
motion predictable and deterministic for Playwright checkpoints. Giving model size and composition
priority prevents valid long approaches from silently recreating the zoomed-out default.

**Alternatives considered**: Centring the bike was rejected by clarification. Velocity-proportional
lead was rejected as non-deterministic across playback rates and harder to assert at checkpoints.

## R4: Pan and zoom interaction model

**Decision**: Represent Pan & Zoom state as a world-space centre point plus a `zoomFactor` relative to
the current Follow zoom, clamped to `[0.5, 3]`. Switching from Follow to Pan & Zoom seeds the centre
and factor from the live Follow view (factor `1`). Wheel and pinch zoom anchor on the pointer
position; arrow keys pan by a fixed fraction of view width per press; plus and minus keys step the
zoom factor multiplicatively.

**Rationale**: A relative factor makes the clamp meaningful across viewports (plan Complexity
Tracking) and makes Reset trivial: discard the manual state. Seeding from the live Follow view
satisfies the edge case requiring continuity when switching modes directly. Pointer-anchored zoom is
the platform convention users expect and keeps the inspected feature under the cursor.

**Alternatives considered**: Storing absolute pixel offsets was rejected because a resize would
invalidate them. Centre-anchored zoom was rejected as it drifts the point of interest off-screen.

## R5: Camera state location and persistence

**Decision**: Store camera state in the existing Zustand `session.view` slice via `setViewPreference`,
adding `cameraMode` and a nullable manual-camera object. Do not persist to Dexie or `localStorage`.

**Rationale**: `SessionState.view` already holds comparable display preferences (`workbenchTab`,
`playbackRate`, `validationDt`) and is session-scoped, matching the spec assumption that camera state
is not saved to run artifacts and does not survive reload. Reusing the slice avoids a new store and
keeps `useWorkbench`'s current local `useState("fit")` from fragmenting state ownership.

**Alternatives considered**: Persisting mode and zoom, as the wireframe specifies, was rejected in the
plan's Complexity Tracking because a stale zoom can restore the defect being fixed.

## R6: Deterministic verification strategy

**Decision**: Register a camera checkpoint through the existing `test-hooks.ts` mechanism exposing
mode, zoom factor, the resolved view rectangle, and the model's measured fraction of stage height.
Assert framing in Playwright via that checkpoint plus canvas pixel checks and desktop/tablet
snapshots; assert the pure math in Vitest.

**Rationale**: The constitution requires canvas-bearing workflows to expose deterministic checkpoints
so tests assert application state and visible output without relying on wall-clock timing.
`test-hooks.ts` already follows this pattern for pose, report, and validation surfaces, and
`registerPlaybackTestControls` provides frame seeking for stable checkpoints during playback.

**Alternatives considered**: Snapshot-only verification was rejected because it cannot express the
28-36% criterion numerically or prove that Pan & Zoom framing stayed unchanged during playback.

## R7: Reconciling the wireframe contract

**Decision**: Update `ui_wireframes/workbench.html` region 12 and the camera controls in
`ui_wireframes/rendered_html/workbench.html` to describe Follow / Pan & Zoom, the Reset View action,
the relative zoom readout, and session-only scope, citing the approved deviation in the plan.

**Rationale**: Principle VI makes the wireframes the UX contract and requires deviations to be
approved and documented before implementation. Leaving the sheets describing Fit / Lip and
`jumplab.workbench` persistence would leave the contract permanently contradicting shipped behaviour
and would fail future wireframe conformance review.

**Alternatives considered**: Implementing against the stale contract was rejected as it does not fix
the reported defect. Leaving the sheets untouched was rejected as a standing constitution violation.
