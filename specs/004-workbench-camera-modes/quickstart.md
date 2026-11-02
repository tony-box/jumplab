# Quickstart: Workbench Camera Modes

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contract**: [camera-contract.md](camera-contract.md)

Runnable validation scenarios that prove the camera feature works end to end. Details of the framing
rules live in the [camera contract](contracts/camera-contract.md); requirement-to-evidence mapping
lives in the [validation matrix](contracts/validation-matrix.md).

## Prerequisites

- Node 22+ with npm 11.4.2 (repo `packageManager`)
- Rust toolchain per `rust-toolchain.toml` (only if the physics core needs rebuilding)
- Dependencies installed and the physics core built at least once

```powershell
npm install
npm run build:physics
```

## Run the app

```powershell
npm run dev
```

Open `http://127.0.0.1:4173/workbench`.

## Manual validation

### V1: Default view (User Story 1, FR-002/FR-004, SC-001)

1. Load the Workbench with the standard scenario.
2. Confirm the camera mode indicator reads **Follow** without any interaction.
3. Confirm the rider and bike are large and legible, occupying roughly 28-36% of stage height.
4. Confirm the jump takeoff appears when it enters the forward view and a distant takeoff does not
  force the camera to zoom out.
5. Press play and confirm the bike stays left-of-center with terrain visible ahead.

**Expected**: The model is immediately readable. No manual zooming is required.

### V1b: Scenario and run load behavior (FR-002)

1. Enter Pan & Zoom and apply a custom pan and zoom.
2. Load a different scenario, then repeat and make a different run active.

**Expected**: Each active identity change resets mode to Follow and clears manual pan while preserving
the chosen zoom. Mode changes, playback, scrubbing, and solves also preserve zoom.

### V2: Manual inspection (User Story 2, FR-007/FR-008/FR-009)

1. Switch the camera mode control to **Pan & Zoom**.
2. Use the Zoom slider, drag the stage, scroll or pinch to zoom, then use arrow keys and plus/minus.
3. Play, pause, and scrub the timeline.
4. Zoom in and out repeatedly until the zoom stops changing.

**Expected**: Framing follows your input exactly, never recenters on its own during playback, and
saturates at 0.5x and 3x of the default Follow zoom.

### V3: Reset (User Story 3, FR-010/FR-011, SC-003)

1. From a panned and zoomed state, activate **Reset View**.
2. Repeat while the run is playing mid-flight.

**Expected**: Mode returns to Follow at exactly 1x zoom, centred on the bike's **current** position,
without rewinding playback. This is the only in-session action that resets zoom.

### V4: Physics isolation (FR-012)

1. Note the active run id and a displayed frame value.
2. Switch modes, pan, zoom, and reset repeatedly.

**Expected**: No re-solve is triggered and no run or frame value changes. Only framing changes.

### V5: Tablet layout

1. Resize to a tablet viewport (or use the Playwright `tablet` project).
2. Repeat V1 through V3.

**Expected**: Both modes remain usable, the model still fills 28-36% of stage height, and nothing
clips or overflows.

## Automated validation

```powershell
npm run check            # typecheck, lint, format
npm run test:views       # camera math + component contracts
npm run test:ui          # shared UI control contracts
npm run test:e2e:views   # workbench camera workflows (desktop + tablet)
npm run test:a11y        # keyboard reachability and accessible names
npm run test:visual      # default framing, model scale, clipping checks
npm run benchmark:interaction # responsiveness and zero presentation solves
```

To refresh visual baselines after an intentional framing change:

```powershell
npx playwright test tests/visual --project=visual --project=tablet --update-snapshots
```

## Deterministic checkpoints

Playwright reads the camera checkpoint registered in `apps/web/src/test-hooks.ts`, exposing `mode`,
`zoomFactor`, the resolved `view` rectangle, and `modelHeightFraction`. Assert against these values
rather than fixed sleeps, per the constitution's determinism gate. Use the existing playback test
controls to seek to a specific frame before asserting framing.

## Definition of done

- All rows in the [validation matrix](contracts/validation-matrix.md) have passing evidence.
- `ui_wireframes/workbench.html` and `ui_wireframes/rendered_html/workbench.html` are updated to the
  approved camera model, resolving the documented deviation in [plan.md](plan.md).
- No new dependency, persistence migration, or physics change is introduced.
