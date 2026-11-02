# Geometry Feature Validation Matrix

## Test Layers

| Layer | Purpose | Primary tools |
| ----- | ------- | ------------- |
| Physics | Joint convention/clamping, pose interpolation, leg/arm kinematics, contacts, limits, deterministic frame samples | Cargo tests |
| Schema/worker | Additive frame layout, buffer parity, fixture and legacy compatibility | Zod, Vitest |
| Pure geometry | Representative bicycle topology, landmark transport, source classes, shared drawing paths | Vitest |
| Component/state | Pose sample synchronization, unavailable fallback, stable controls | Vitest, Testing Library |
| Browser workflow | Pose-to-Workbench handoff, playback parity, accessibility, source disclosure | Playwright |
| Render evidence | Nonblank canvases, recognizability, framing, clipping, deterministic snapshots | Playwright pixel checks and screenshots |

## Requirement Coverage

| Requirements | Required evidence |
| ------------ | ----------------- |
| FR-001 to FR-004 | Physics sample tests; canonical joint signs/clamping; shared input/output contract; elbow achieved-value and limit presentation tests |
| FR-005 to FR-008 | Rust rider-kinematics tests for dimensions, connectivity, finite constrained output, neutral posture, and contacts |
| FR-009 to FR-011 | Extended frame-buffer contract; Workbench field reads; exact keyframe parity; continuous linear/cubic playback; explicit step-boundary behavior |
| FR-012 to FR-015 | Pure bike landmark/topology tests; source classification; rigid/hardtail/full snapshots; no invented suspension motion |
| FR-016 to FR-017 | Existing Scenario/PoseClip validation; fixture regeneration; saved/exported new-run frame-field round trip; legacy-run unavailable posture fallback |
| FR-018 to FR-019 | Existing keyboard/accessibility suites; stable IDs; desktop/tablet overflow, clipping, and stage-dimension checks |
| FR-020 | Deterministic structured checkpoints, canvas pixel assertions, and snapshots for every required state |
| FR-021 | Documented joint-sign convention; Rust clamping tests; bundled limit-correction compatibility tests; preserved authored targets; disclosed known change |
| FR-022 | Legacy-layout reader tests; Workbench unavailable-posture component and visual checks; unchanged legacy run metrics and report outputs |
| SC-001, SC-005 | Numeric geometry property/boundary tests over supported rider/bike limits and viewport evidence |
| SC-002 | Same-coordinate Pose/Workbench checkpoint comparison within contract tolerances |
| SC-003 | Structured recognition review with at least eight representative participants recorded separately; automated tests verify every required landmark is rendered |
| SC-004 | Timed manual quickstart journey plus browser workflow completion |
| SC-006 | Existing scenario and preset corpus compatibility tests |

## Required Deterministic Checkpoints

### Pose

- Neutral key with finite bent elbow.
- Authored key with visibly different hip/spine targets.
- Reach-constrained key with named limiting state.
- Minimum and maximum supported rider proportions.
- Rigid, hardtail, and full-suspension bike topology.

### Workbench

- Unsolved active movement preview where supported.
- Solved frame at an authored key coordinate.
- Linear/cubic frame between keys.
- Step frame immediately before and at a key boundary.
- Takeoff, mid-flight, and landing phase frames from phase metadata.
- Legacy run layout with explicit unavailable full-rider posture.

### Cross-view

- Same Scenario snapshot identity.
- Same movement coordinate.
- Same six sampled joint values.
- Same constraint state.
- Same bike-local rider and bicycle landmarks.

## Tolerances

| Target | Tolerance |
| ------ | --------- |
| Pure landmark and contact parity | `1e-5 m` |
| Frame-field joint transport | `1e-4 rad` |
| Adjacent continuous-mode frame delta in controlled fixtures | `<= 0.05 rad` |
| Canvas screenshot difference | `<= 2%` differing pixels |
| Page overflow | `scrollWidth <= clientWidth + 2 px` |

Step interpolation may change discontinuously only at an authored key boundary. Screenshot tolerance does not replace numeric geometry assertions.

## Browser Matrix

- Functional primary journey: Chromium desktop and iPad Pro 11 tablet at minimum, with the existing cross-engine Workbench/Pose suites retained.
- Accessibility: existing `web-server` project.
- Visual evidence: deterministic desktop Chromium and tablet projects.

## Release Gates

- Native Rust and browser worker agree on frame layout and values.
- The native-to-WebAssembly parity suite and determinism suite pass after the pose and frame contract change.
- Render, scrub, resize, camera, and overlay interactions dispatch no solve, confirmed by the existing interaction benchmark.
- No new `NEEDS CLARIFICATION`, NaN, Infinity, disconnected required segment, or invented measured suspension state.
- Existing Scenario and PoseClip fixtures validate without migration.
- Changed Workbench and Pose browser suites pass at supported viewports.
- Updated visual baselines are reviewed for recognizable rider/bike geometry and source honesty.
- Known limitations continue to state that schematic fit geometry is not biomechanical or safety validation.
