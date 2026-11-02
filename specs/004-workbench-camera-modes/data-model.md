# Phase 1 Data Model: Workbench Camera Modes

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

All entities below are **display state**. None is part of the physics inputs, the solver frame layout,
or a persisted run artifact. No schema version, migration, or Rust type changes.

## Entity: CameraMode

Discriminated string union identifying the active camera behaviour.

| Value | Meaning |
| ----- | ------- |
| `follow` | Automatic framing that tracks the bike. Default on load. |
| `pan-zoom` | Manual framing fully controlled by the user. |

### CameraMode rules

- Initial value MUST be `follow` (FR-002).
- The value MUST be surfaced continuously in the UI (FR-013).
- Values `fit` and `lip` from the previous implementation and wireframe are removed.

## Entity: ManualCameraState

User-controlled pan framing, present only while the user has taken manual control.

| Field | Type | Units | Rules |
| ----- | ---- | ----- | ----- |
| `centerX` | number | metres (world) | Finite. Horizontal centre of the view rectangle. |
| `centerY` | number | metres (world) | Finite. Vertical centre of the view rectangle. |
| `zoomFactor` | number | ratio | Mirrors the shared `CameraViewState.zoomFactor` while manual mode is active. |

### ManualCameraState rules

- `null` while in `follow` mode; seeded from the live Follow view on the first manual interaction or
  on switching to `pan-zoom`, preserving the shared `zoomFactor`.
- Never mutated by playback, scrubbing, pausing, or resize (FR-008).
- Cleared by Reset View (FR-011).

## Entity: CameraViewState

The complete session-scoped camera state, stored in the existing Zustand `session.view` slice.

| Field | Type | Rules |
| ----- | ---- | ----- |
| `cameraMode` | `CameraMode` | Defaults to `follow`. |
| `cameraZoomFactor` | number | Defaults to `1`; finite and clamped to `[0.5, 3]`; changed by slider, wheel/pinch, or plus/minus; reset only by Reset View. |
| `manualCamera` | `ManualCameraState \| null` | Non-null only in `pan-zoom` mode. |

### Lifecycle and state transitions

| From | Trigger | To |
| ---- | ------- | -- |
| `follow` | Select Pan & Zoom | `pan-zoom` with `manualCamera` seeded from current Follow view |
| `follow` | Pan or zoom gesture/key on the stage | `pan-zoom` with `manualCamera` seeded from current Follow view, then the input applied |
| `pan-zoom` | Pan or zoom gesture/key | `pan-zoom` with updated `manualCamera` (clamped) |
| `pan-zoom` | Select Follow | `follow`, `manualCamera` cleared, zoom preserved |
| any | Reset View | `follow`, `manualCamera` cleared, `cameraZoomFactor = 1` |
| any | Active scenario identity changes | `follow`, `manualCamera` cleared, zoom preserved (FR-002) |
| any | Active run identity changes | `follow`, `manualCamera` cleared, zoom preserved (FR-002) |
| any | Playback, scrub, pause, resize, or solve progress without an active identity change | unchanged (FR-008, FR-012) |

**Not persisted**: excluded from Dexie, `localStorage`, run artifacts, and scenario hashes.

## Entity: ModelExtent (derived, not stored)

World-space bounding box of the rider-and-bike model for the current frame, used to size the default
Follow zoom.

| Field | Type | Units |
| ----- | ---- | ----- |
| `minX`, `maxX`, `minY`, `maxY` | number | metres (world) |

### ModelExtent derivation

- Preferred: bounding box over the world-space rider and bike geometry already produced by
  `worldRiderGeometry` and `worldBikeGeometry`.
- Fallback when `frame.landmarks` is absent (legacy runs): bike bounding box expanded by a documented
  allowance derived from `scenario.rider.height`, so framing does not jitter between frames.
- Purely derived per render; never stored, never fed back into the solver.

## Entity: CameraView (derived, not stored)

The resolved world-space rectangle handed to `createCanvasViewport`.

| Field | Type | Units | Rules |
| ----- | ---- | ----- | ----- |
| `minX`, `maxX`, `minY`, `maxY` | number | metres (world) | Finite, `maxX > minX`, `maxY > minY`. |

### CameraView invariants

- In `follow`, the bike sits 32–38% of view width from the left edge (FR-003).
- At default zoom, `ModelExtent` height occupies 28-36% of stage height, targeting 32% (FR-004, SC-001).
- Model height and horizontal position take precedence over distant takeoff visibility; the jump lip
  becomes visible when it naturally enters the resulting forward view (FR-004, FR-005).
- Deterministic: identical `(scenario, frame, CameraViewState, stageSize)` yields an identical
  rectangle (Principle IV).

## Entity: CameraCheckpoint (test-only, derived)

Deterministic checkpoint exposed through `apps/web/src/test-hooks.ts` for Playwright assertions.

| Field | Type | Purpose |
| ----- | ---- | ------- |
| `mode` | `CameraMode` | Assert default and switching behaviour |
| `zoomFactor` | number | Assert clamp bounds and Reset |
| `view` | `CameraView` | Assert framing and stability during playback |
| `modelHeightFraction` | number | Assert the 28-36% criterion numerically |

## Relationships

```text
Scenario ──┐
Frame ─────┼──> ModelExtent ──┐
           │                  ├──> CameraView ──> CanvasViewport ──> Canvas drawing
CameraViewState ──────────────┘                                  └──> CameraCheckpoint (tests)
```

`CameraViewState` is the only stored entity. Everything downstream is recomputed per render, so no
camera value can ever influence solver input or run output.
