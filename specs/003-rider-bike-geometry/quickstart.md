# Quickstart: Validate Rider and Bike Geometry

## Purpose

Run the focused checks that prove the articulated rider, calculated elbow, recognizable bicycle, and Pose-to-Workbench parity work without weakening source honesty or existing workflows.

## Prerequisites

- Node.js and npm compatible with `packageManager: npm@11.4.2`.
- Rust 1.98.0 with the `wasm32-unknown-unknown` target.
- Dependencies installed from the repository root.
- Browser engines installed for the existing Playwright projects.

## Build and Static Checks

From the repository root:

```powershell
npm.cmd run build:physics
npm.cmd run check
npm.cmd run build
```

Expected:

- Physics bindings build successfully.
- TypeScript, lint, formatting, schema, and web builds report no new errors.
- No new runtime dependency is installed for geometry derivation.

## Focused Physics and Contract Validation

```powershell
npm.cmd run test:physics
npm.cmd run test:determinism
npm.cmd run test:parity
npm.cmd run test:schema
npm.cmd run test:worker
npm.cmd run test:views
```

Expected:

- Canonical joint signs, Rust-owned clamping, pose interpolation, full rider landmarks, and shoulder/elbow values remain deterministic and finite.
- Native and WebAssembly pose and solve results stay in parity, and repeat runs stay reproducible.
- New solver frames expose ankle, knee, hip, spine, and achieved rider/contact landmark fields after existing frame fields.
- Native/worker buffers and fixture layouts agree.
- Existing Scenario and PoseClip data validates without migration.
- Rust rider/contact geometry and shared representative-bike path tests satisfy the tolerances in [geometry-contract.md](contracts/geometry-contract.md).
- Legacy run layouts remain readable and expose unavailable full-rider posture instead of an invented pose.

## Browser Workflow

Start the existing server if it is not already running:

```powershell
npm.cmd run dev
```

Open:

- `http://127.0.0.1:4173/pose`
- `http://127.0.0.1:4173/workbench`

### Pose journey

1. Select a neutral keyframe.
2. Confirm both arm and leg pairs are visible and connected.
3. Confirm each arm includes shoulder, elbow, and hand and both hands meet the handlebar.
4. Confirm each leg includes hip, knee, ankle, and foot and feet meet the pedals.
5. Select or create an authored key, adjust a supported target, and confirm the elbow recalculates without becoming an editable target.
6. Request an unreachable pose and confirm the achieved figure remains finite and connected while the limiting state is named.
7. Confirm wheels, frame tubes, crank/pedals, saddle, fork, steering, and handlebars are recognizable.
8. Confirm the view discloses that unspecified bike-fit landmarks use schematic proportions.

### Cross-view journey

1. Leave the authored key selected and choose the existing Apply to Run action.
2. Confirm Workbench opens without solving.
3. Solve once, then scrub to the frame at the authored movement coordinate.
4. Confirm rider proportions, six joint values, contacts, and bike-local landmarks match Pose.
5. Scrub between keys and confirm linear/cubic movement is continuous; for step mode, confirm the only discontinuity occurs at the key boundary.
6. Toggle rider and suspension overlays and confirm no action initiates a solve or invents suspension compression.

### Bike variants

Load or construct valid rigid, hardtail, and full-suspension scenarios. For each:

- Frame members remain connected.
- Fork and configured rear-shock topology are recognizable.
- Static representative suspension geometry is not presented as measured compression.
- Rider hand and foot contacts remain aligned.

## Automated Browser Checks

```powershell
npm.cmd run test:e2e:views
npm.cmd run test:a11y
npm.cmd run test:visual
```

Expected:

- Pose-to-Workbench primary journey passes on Chromium and tablet.
- Existing Canvas accessible names, keyboard behavior, primary actions, and stable regions remain intact.
- Neutral, authored, constrained, interpolated, and bike-variant canvases are nonblank.
- Desktop and tablet snapshots show complete framing without incoherent overlap, clipping, or page-wide horizontal overflow.
- Screenshot differences stay within the repository's 2% threshold after reviewed baseline updates.

To update snapshots only after reviewing intended geometry changes:

```powershell
npx.cmd playwright test tests/visual --project=visual --project=tablet --update-snapshots --reporter=line
```

## Full Verification

```powershell
npm.cmd run verify
npm.cmd run check
```

Confirm that render, scrub, resize, camera, and overlay interactions dispatch no solve:

```powershell
npm.cmd run benchmark:interaction
```

`verify` may regenerate architecture evidence. Run the final check after generated outputs are formatted according to repository conventions.

## Acceptance Record

Record these results with the implementation review:

- Numeric geometry and contact tests passed.
- Frame layout and legacy compatibility tests passed.
- Pose/Workbench parity checkpoint passed.
- Desktop/tablet screenshots reviewed.
- Structured recognition review result for SC-003.
- Timed Pose-to-Workbench journey result for SC-004.
- Any remaining limitations, especially schematic bike-fit geometry and unavailable measured suspension compression.

See [data-model.md](data-model.md) for entity ownership and [validation-matrix.md](contracts/validation-matrix.md) for requirement coverage.
