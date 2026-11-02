# Designer UI Contract

## Route and Naming

- `/designer` is canonical and renders `DesignerPage`.
- `/pose` redirects to `/designer` with replacement navigation and preserves current in-memory
  scenario state.
- Primary navigation, document title, page heading, loading/error copy, accessible names, and test
  descriptions use **Designer**, **Bike**, or **Pose**, never the retired page name **Pose editor**.
- Existing scenario and whole-scenario import/export behavior is unchanged. External bicycle
  geometry import is not exposed.

## Primary Workflow

Designer operates on one active scenario and one shared side-view preview. A segmented mode control
switches between **Bike** and **Pose** authoring without navigating or changing the scenario.

### Bike mode

- The left rail groups manual controls for wheels/frame, fit, steering/fork, saddle/crank, cockpit,
  mass, and existing suspension configuration.
- Inputs show label, value, unit, supported range, and short physical meaning. UI values use familiar
  millimetres/degrees where appropriate and convert to persisted SI values.
- Input changes update `DesignerDraft` and start worker inspection. Stale responses cannot replace a
  newer draft.
- An invalid draft remains in its fields with all issues visible and is not written into the active
  scenario. The preview may show only finite returned draft geometry and must mark it as invalid.
- A valid draft updates the active scenario atomically. All pose keys are then batch validated. Bike
  values never receive keyframes.
- The distance track and keyframe controls are absent in Bike mode.

### Pose mode

- Existing keyframe selection, add/delete, interpolation, distance track, joint controls, reset, and
  direct manipulation remain available.
- Every direct edit uses the last valid accepted targets as its resolver baseline. A constrained
  result commits the returned accepted targets and announces the limiting reason.
- The selected key's clearance/contact state is visible beside existing reach/joint-limit state.
- Changing or selecting keys never changes bicycle geometry.

## Shared Preview

The stage draws canonical bike members/protected envelopes returned by the core and the selected
achieved rider sample. It supports overlays for contact points, protected geometry, CoG, target pose,
achieved pose, joint limits, and drag handles as applicable to the selected mode.

The stage remains stable while worker results are pending. It must not flash blank, replace the
latest valid geometry with a stale response, or change dimensions when controls and validation text
appear. The complete rider and bicycle remain framed at supported desktop and tablet sizes.

Accessible canvas name: `Bike and rider Designer preview`.

## Validation and Apply States

The page exposes one aggregate status and a conflict summary grouped by geometry and pose key.

| State | Preview | Scenario write | Apply to Run |
| --- | --- | --- | --- |
| Loading | Last stable or placeholder | No | Disabled |
| Draft pending | Last stable plus pending status | No | Disabled |
| Draft invalid | Finite marked draft or last stable | No | Disabled |
| Bike valid, poses valid | Canonical candidate | Atomic bike update | Enabled |
| Bike valid, poses invalid | Canonical candidate and conflicts | Atomic bike update; pose targets unchanged | Disabled |
| Solver/gateway error | Last stable plus error | No new write | Disabled |

Activating Apply to Run performs one final complete design validation before solve/navigation. A
failure keeps Designer open, focuses the conflict summary, and does not dispatch a solve.

## Stable Regions

New regions:

| `data-od-id` | Purpose |
| --- | --- |
| `designer-page` | Page root |
| `designer-mode` | Bike/Pose segmented control |
| `bike-geometry-rail` | Manual bike controls |
| `bike-derived-rail` | Closure, CoG, inertia, and derived dimensions |
| `design-conflict-summary` | Grouped blocking issues |
| `designer-canvas` | Shared visual stage wrapper |

Preserved pose workflow regions:

- `clip-name`, `apply-clip`, `keyframe-rail`, `add-keyframe`, `interp-mode`
- `pose-overlay-bar`, `reset-pose`, `pose-canvas`, `canvas-hint`, `distance-track`
- `joint-rail`, `joint-table`, `rom-table`

Individual bike inputs use `bike-dimension-{field}`. Conflict links use
`design-conflict-{kind}-{key-or-field}`.

## Keyboard and Accessibility

- Mode control uses standard segmented-control radio behavior and arrow keys.
- Every numeric field supports direct keyboard entry and native step controls without stealing
  keyframe-list navigation.
- Validation associates field issues with inputs and announces aggregate state through one polite
  live region; repeated rapid edits do not announce every superseded response.
- Conflict-summary links focus the affected field or select the affected keyframe.
- Existing keyframe listbox keyboard behavior and visible focus remain unchanged.
- Disabled Apply to Run exposes the blocking reason in adjacent text, not only color or tooltip.

## Responsive Contract

Desktop uses the established three-region authoring shell. Tablet may stack or collapse one rail,
but the mode control, active inputs, preview, validation summary, and primary action remain reachable
without horizontal page scrolling. Long values and conflict messages wrap without changing fixed
canvas or control dimensions.

## Deterministic Browser Checkpoints

Test hooks expose:

- Current Designer mode and active route.
- Latest geometry request ID and status.
- Canonical landmark and protected-shape summary.
- Draft validity, `canSolve`, conflict codes, and affected key indices.
- Selected-key clearance, inferred saddle contact, and accepted pose targets.
- Existing normalized drag helpers and canvas pixel sampling.
