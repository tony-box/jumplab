# Validation Matrix

## Test Layers

| Layer            | Purpose                                                              | Tools                                 |
| ---------------- | -------------------------------------------------------------------- | ------------------------------------- |
| Schema/contract  | Strict data, protocol, migrations, compatibility, source rules       | Vitest, Zod                           |
| State/component  | Store transitions, selectors, controls, errors, keyboard state       | Vitest, Testing Library               |
| Physics          | Equations, constraints, convergence, determinism                     | Cargo tests                           |
| Browser workflow | Routing, primary journeys, focus, source honesty, responsive layout  | Playwright                            |
| Render evidence  | Nonblank Canvas/SVG, deterministic checkpoints, screenshots, overlap | Playwright pixel checks and snapshots |
| Performance      | Solve, cancel, direct-control feedback, replay rate                  | Existing benchmark scripts            |

## User Story Evidence

| Story          | Required evidence                                                                                                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| US1 Workbench  | Supported/unsupported control contract; explicit solve lifecycle; stale result; synchronized playback; overlay isolation; baseline pinning; nonblank deterministic canvas at start/takeoff/flight/landing |
| US2 Library    | Search/category/count unit tests; load/duplicate route handoff; speed-window measured/unavailable states; no-results browser workflow; responsive cards/tables                                            |
| US3 Pose       | Key ordering and minimum tests; immediate scenario update; constrained sample; focus retention; keyboard listbox; deterministic pose Canvas and distance track; Apply navigation without solve            |
| US4 Report     | Route lookup and stale run; compatibility rules; solver-version warning; blank incompatible deltas; four labeled SVG charts and equivalent tables; CSV; exact snapshot working copy                       |
| US5 Validation | Runner state and count reconciliation; fail and budget-exceeded states; convergence/determinism rendering; pending owners/gates; long hash wrapping                                                       |

## Requirement Groups

| Requirements     | Primary evidence                                                                        |
| ---------------- | --------------------------------------------------------------------------------------- |
| FR-001 to FR-004 | Shared shell/route tests, stable ID contract, source-label component tests              |
| FR-005 to FR-009 | Input capability contracts, worker contract, Workbench E2E, playback and baseline tests |
| FR-010 to FR-012 | Catalog/search unit tests and Library-to-Workbench E2E                                  |
| FR-013 to FR-016 | Pose schema/state/component tests and Pose-to-Workbench E2E                             |
| FR-017 to FR-019 | Run artifact/comparison/export contracts and Report E2E                                 |
| FR-020 to FR-021 | Validation runner contracts and Validation E2E                                          |
| FR-022           | Session restore/stale-reference integration and offline reload E2E                      |
| FR-023 to FR-027 | Accessibility, keyboard, responsive, layout-shift, and error recovery evidence          |
| FR-028           | Provider adapter contract tests using real and fixture implementations                  |
| FR-029           | Scope disclosure assertions on Workbench, Report, and Validation                        |
| FR-030           | Full Playwright workflow, deterministic checkpoints, pixel checks, and snapshots        |

## Browser Matrix

Primary workflows run on:

- Chromium desktop
- Firefox desktop
- WebKit desktop
- Branded Chrome
- Branded Edge
- iPad Pro 11 tablet project

Accessibility checks run on the `web-server` project. Visual baselines run on deterministic desktop Chromium and add tablet snapshots for Workbench, Pose, and every view with a changed responsive composition.

## Deterministic Checkpoints

Workbench stage:

- unsolved/default framing
- frame 0 after solve
- takeoff boundary frame
- representative mid-flight frame from phase metadata
- landing boundary frame
- pinned-baseline overlay at a fixed frame

Pose stage:

- selected neutral key
- selected authored key
- constrained/reach-clamped edit
- joint limit/saturation state

Charts:

- one-run report
- compatible baseline
- cross-version warning
- no/incompatible baseline
- validation pass/fail/awaiting mixture

Tests set frame/checkpoint state through explicit test hooks or state events; fixed sleeps are not the sole synchronization method.

## Visual Assertions

- Canvas pixel range proves content is nonblank and materially varied.
- SVG contains non-empty path geometry, correct viewBox, and accessible name.
- Screenshots detect clipping, overlap, incorrect framing, style drift, and layout shifts.
- Dynamic values do not resize stable controls or rails.
- Tables scroll within their region on tablet and never create page-wide horizontal scroll.
- Text remains readable in long-label, large-number, pending, error, and stale-reference states.

## Performance Gates

- Standard scenario solve p95 < 5,000 ms.
- Cancellation p95 < 250 ms.
- Direct-control input-to-paint p95 <= 100 ms.
- Replay >= 55 fps.
- Playback, overlay, resize, camera, report selection, and baseline tests assert zero solve dispatches.

## Source-Honesty Gates

- Real product solve path reports `solver` and validated solver/model versions.
- Fixture adapter reports `representative-fixture` and visible representative labeling.
- Pending capability renders blank numeric value plus reason.
- No pending, fixture, visual, or unavailable result satisfies a physics/parity/validation pass assertion.
- Missing `wasm-pack` is reported as unavailable in parity/benchmark evidence.

## Completion Gate

The feature is ready for acceptance when schema/contract, unit/integration, physics, browser workflow, accessibility, offline, visual, and performance gates pass; all required stable IDs exist; and no constitutional exception remains undocumented.
