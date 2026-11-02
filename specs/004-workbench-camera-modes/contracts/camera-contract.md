# Camera Contract: Workbench Camera Modes

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Data model**: [data-model.md](data-model.md)

Defines the interface contract for the Workbench stage camera. This is a UI/rendering contract for an
application surface; there is no network API. Consumers are `WorkbenchStage.tsx`,
`workbench-stage.ts`, and the Playwright suites.

## C1: Pure camera module

**Module**: `apps/web/src/rendering/canvas/camera.ts`

```text
resolveCameraView(input: {
  scenario: Scenario;
  frame: WorkbenchFrame;
  camera: CameraViewState;
  stageWidth: number;    // CSS px
  stageHeight: number;   // CSS px
}): { view: WorldBounds; zoomFactor: number; modelHeightFraction: number }
```

### Module guarantees

1. **Pure**: no DOM access, no canvas access, no store reads, no solver dispatch, no mutation of
   `scenario`, `frame`, or `camera`.
2. **Deterministic**: identical input yields a bitwise-identical result (Principle IV).
3. **Finite**: every returned coordinate is finite; `maxX > minX` and `maxY > minY` always hold, even
   for degenerate stage sizes or extreme scenario geometry.
4. **Total**: never throws for any schema-valid `Scenario` or any `WorkbenchFrame`, including legacy
   frames with `landmarks === undefined`.

## C2: Follow mode framing

| Rule | Requirement |
| ---- | ----------- |
| Horizontal bias | Bike positioned 32–38% of view width from the left edge, so more terrain is visible ahead than behind (FR-003). |
| Default zoom | View height sized so `ModelExtent` height occupies 28-36% of stage height; target 32% (FR-004, SC-001). |
| User zoom | Apply the shared `zoomFactor` to Follow framing while continuing to track and horizontally bias the bike. |
| Takeoff visibility | The jump lip MUST become visible when it naturally enters the forward view; a distant lip MUST NOT widen the view (FR-004, FR-005). |
| Precedence | The 28-36% model-height band and horizontal bias MUST take precedence over showing a distant takeoff. |
| Adaptation | Framing derives from the model extent and scenario geometry, never from hardcoded per-scenario constants (FR-005). |
| Legacy frames | With no landmarks, fall back to the bike box plus a rider-height allowance; framing MUST remain stable across consecutive frames. |

## C3: Pan & Zoom mode framing

| Rule | Requirement |
| ---- | ----------- |
| Authority | The returned view is derived solely from `manualCamera`; the bike position MUST NOT influence it (FR-008). |
| Stability | For fixed `manualCamera` and stage size, the view MUST be identical across playback, scrubbing, and pausing (FR-008, SC-004). |
| Zoom clamp | `zoomFactor` clamped to `[0.5, 3]` relative to the default Follow zoom; out-of-range input clamps rather than throwing (FR-009). |
| Seeding | Entering `pan-zoom` seeds its centre from the live Follow view and preserves the shared `zoomFactor`, so framing is continuous across the switch. |
| Resize | On stage resize the world-space centre and `zoomFactor` are preserved. |

## C4: Interaction contract

Handled in `WorkbenchStage.tsx`; all handlers only dispatch camera state updates.

| Input | Behaviour | Requirement |
| ----- | --------- | ----------- |
| Pointer/touch drag on stage | Pan by the dragged world delta | FR-007 |
| Wheel / pinch | Zoom anchored at the pointer position | FR-007 |
| Arrow keys | Pan by a fixed fraction of view width/height per press | FR-007, clarified |
| Plus / minus keys | Step `zoomFactor` multiplicatively, clamped | FR-007, clarified |
| Zoom slider | Set the shared `zoomFactor` directly from 0.5x to 3x in either mode | FR-007, clarified |
| Mode control | Switch between Follow and Pan & Zoom in one interaction | FR-006, SC-002 |
| Reset View | Set mode to `follow`, clear `manualCamera`, and set `zoomFactor = 1` | FR-010, FR-011, SC-003 |
| Active scenario/run identity change | Set mode to `follow`, clear `manualCamera`, and preserve `zoomFactor` | FR-002 |

### Interaction guarantees

- Any pan or zoom input received while in `follow` transitions to `pan-zoom` first, then applies.
- Camera interaction MUST NOT dispatch a solve, mutate a frame, or write a run artifact (FR-012).
- Camera interaction MUST NOT pause, restart, or alter playback.
- Mode changes, identity changes, solves, playback, and scrubbing preserve `zoomFactor`; only Reset
  View restores `zoomFactor = 1` during the session.
- The stage is keyboard focusable with a focus ring visible against the dark stage; all controls have
  accessible names.

## C5: Stage rendering contract

**Module**: `apps/web/src/rendering/canvas/workbench-stage.ts`

- MUST obtain bounds exclusively from `resolveCameraView` and MUST NOT compute framing inline.
- MUST NOT retain the existing `scenario.entry.startX` to gap-plus-landing-plus-rollout bounds or the
  `cameraShift` branch.
- Terrain, grid, trajectory, and overlay drawing MUST be clipped or ranged to the resolved view rather
  than assuming the full scenario span is visible.
- `viewport.ts` remains unchanged and generic; `pose-stage.ts` behaviour MUST NOT change.

## C6: UI region contract

| Region | `data-od-id` | Requirement |
| ------ | ------------ | ----------- |
| Camera mode switch | `camera-mode` | Existing id preserved; options become Follow and Pan & Zoom. |
| Zoom slider | accessible name `Camera zoom` | Always available in both modes; range 0.5x-3x. |
| Reset View action | `camera-reset` | New; reachable in both modes (FR-010). |
| Mode indicator | existing stage badge | Continuously reflects the active mode (FR-013). |
| Stage canvas | `sim-canvas` | Unchanged id; gains interaction handlers. |

Wireframe sources MUST be updated to match, per the approved deviation in the plan.

## C7: Test checkpoint contract

**Module**: `apps/web/src/test-hooks.ts`

```text
registerCameraTestControls(controls: {
  getCheckpoint: () => {
    mode: CameraMode;
    zoomFactor: number;
    view: { minX: number; maxX: number; minY: number; maxY: number };
    modelHeightFraction: number;
  };
}): () => void
```

- Registered by the Workbench surface and unregistered on unmount, matching the existing pose, report,
  and validation hook pattern.
- Values reflect the most recent render, enabling assertions without wall-clock waits.
- Test-only: MUST NOT influence rendering or state.
