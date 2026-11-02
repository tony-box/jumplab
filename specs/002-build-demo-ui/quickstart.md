# Quickstart: Demoable Workbench UI

## Purpose

Use this guide after implementation tasks are complete to prove the feature against [spec.md](spec.md), [data-model.md](data-model.md), and the [contracts](contracts/). This is a validation guide, not a substitute for the automated test suites.

## Prerequisites

- Node.js compatible with npm 11 and Vite 8
- npm 11.4.2 (repository package manager)
- Rust 1.98.0 with `wasm32-unknown-unknown`
- Playwright browser binaries for configured projects
- `wasm-pack` only when rebuilding WebAssembly artifacts

If `wasm-pack` is unavailable, do not fabricate parity or benchmark output. Use current checked-in physics artifacts when valid for the branch, run UI-state tests through the visibly labeled deterministic adapter, and report physics rebuild/parity as unavailable.

## Install and Build

From the repository root:

```powershell
npm install
npm run typecheck
npm run build
```

When physics sources or worker bindings changed and `wasm-pack` is available:

```powershell
npm run build:physics
npm run build
```

Expected:

- Schema and web TypeScript compile without errors.
- The production web bundle builds.
- A missing physics build prerequisite is reported explicitly and does not generate fake evidence.

## Start the Application

```powershell
npm run dev
```

Open `http://127.0.0.1:4173/workbench`.

Expected routes:

- `http://127.0.0.1:4173/workbench`
- `http://127.0.0.1:4173/pose`
- `http://127.0.0.1:4173/library`
- `http://127.0.0.1:4173/report/{runId}`
- `http://127.0.0.1:4173/validation`

The shared shell identifies the active route and exposes exactly one solid primary action per view.

## Automated Validation

### Fast Gates

```powershell
npm run check
npm run test:unit
npm run test:worker
npm run test:persistence
```

Expected:

- Input capability, run artifact, comparison, source, state transition, and session continuity contracts pass.
- Worker protocol tests prove strict capability and result validation.
- Snapshot-aware storage tests prove exact scenario recovery and legacy missing-snapshot behavior.

### Physics Gates

```powershell
npm run test:physics
npm run test:convergence
npm run test:determinism
npm run test:parity
```

Expected:

- Existing model tests remain green; this UI feature adds no physical effect.
- Repeated supported solves remain deterministic within documented tolerance.
- Parity either passes using valid artifacts or reports unavailable when the required build tool is missing.

### Browser Gates

```powershell
npm run test:e2e
npm run test:a11y
npm run test:offline
npm run test:visual
```

Expected:

- Primary workflows pass in configured desktop engines and iPad Pro 11.
- Keyboard, accessible names/states, focus visibility, and chart equivalents pass.
- Offline/session tests preserve unavailable references as disabled until clear/replace.
- Canvas pixel checks and SVG path checks prove nonblank, correctly framed output.
- Screenshots show no overlap, clipping, page-wide horizontal scrolling, or unstable controls.

### Performance Gates

```powershell
npm run benchmark:standard
npm run benchmark:interaction
```

Expected:

- Standard scenario solve p95 is under 5 seconds.
- Cancellation p95 is under 250 ms.
- Direct-control feedback p95 is at most 100 ms.
- Replay remains at least 55 fps.

## Manual Acceptance Journey

### 1. Library to Workbench

1. Open `/library`.
2. Press `/`, search for a known jump, and verify tab counts update.
3. Clear with Escape.
4. Load a jump preset and confirm Workbench receives a validated scenario.
5. Return and duplicate a preset; confirm the copy has a different identity and the preset is unchanged.
6. Search for a missing term and verify the empty state names it and offers clear/create actions.

Expected: measured speed windows show units and bounds; unavailable windows show a reason and no zero-valued fake range.

### 2. Workbench Solve and Playback

1. Inspect Jump, Rider, and Bike tabs.
2. Confirm supported physical controls are editable and unsupported controls are disabled/read-only with `awaiting core` text.
3. Change a supported input and confirm the displayed run becomes stale without starting a solve.
4. Select Solve Run and observe bounded progress.
5. Play, pause, step, scrub, change playback rate, toggle overlays, resize, and change camera mode.
6. Pin the run as baseline, change an input, and solve again.

Expected: the production run source is the real solver; stage/time/frame/phase stay synchronized; presentation actions dispatch zero solves; incompatible deltas remain blank.

Deterministic visual checkpoints: frame 0, takeoff boundary, mid-flight, landing boundary, and fixed-frame baseline overlay.

### 3. Pose Editing

1. Open `/pose` from the active scenario.
2. Select keys with pointer and arrow keys.
3. Add, move, and delete keys; verify deletion disables at two keys.
4. Change interpolation and authored joint targets.
5. Drag a handle beyond reach and verify a valid clamped/constrained state.
6. Select Apply to Run.

Expected: every valid edit immediately updates the scenario and marks its result stale; key distance ordering remains valid; Apply to Run returns to Workbench without solving.

### 4. Report and Historical Reopen

1. Open `/report/{runId}` for a completed run.
2. Inspect headline metrics, four charts, metric/energy tables, and accuracy bounds.
3. Select a compatible baseline from another solver version.
4. Confirm deltas appear with a persistent solver-version warning.
5. Select an incompatible baseline and confirm deltas become blank with a reason.
6. Export frames CSV and inspect header/order.
7. Select Open in Workbench.

Expected: Workbench receives a new editable identity containing the run's exact scenario snapshot and provenance; the historical run remains unchanged and is recomputed only after an edit plus Solve Run.

### 5. Validation

1. Open `/validation` and select a timestep.
2. Run the suite.
3. Inspect analytical, convergence, determinism, and pending sections.
4. Verify summary counts equal the detailed status counts.
5. Verify pending rows name owner and gate and never count as passing.
6. Exercise a failure and budget-exceeded fixture in test mode.

Expected: measured checks include tolerances and traces; unavailable checks remain awaiting core; long hashes wrap within their region.

### 6. Stale Reference Recovery

1. Select a run and baseline, then remove the referenced test artifact through the test hook or fixture setup.
2. Reload the route.
3. Verify the missing reference remains visible and disabled with an explanation.
4. Clear it and confirm unrelated scenario/view state remains.
5. Repeat and replace it with a valid reference.

Expected: no silent fallback, unrelated state loss, or dead-end action.

## Source-Honesty Review

Before acceptance, inspect Workbench, Report, Library speed windows, and Validation and confirm:

- `measured` is used only for available computed evidence.
- `estimate` includes a reason.
- Internal `pending-core` displays as `awaiting core` with no invented number.
- `representative-fixture` is visibly identified and does not satisfy physics gates.
- Solver/model/schema versions and excluded physical effects are discoverable where accuracy is discussed.

## Completion Result

Record command outcomes, browser/viewport matrix, screenshots, performance evidence, unavailable-tool disclosures, and any approved deviations. Proceed to feature acceptance only when the [validation matrix](contracts/validation-matrix.md) and both constitution checks in [plan.md](plan.md) pass.
