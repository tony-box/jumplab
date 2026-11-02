# Acceptance Evidence: Coherent Rider and Bike Geometry

**Date**: 2026-08-26

## SC-004: Pose-to-Workbench journey under 60 seconds

**Method**: Manual timed walkthrough using the running application (`/pose` → adjust hip target on an authored key → Apply to run → `/workbench` → Solve run → seek to the corresponding frame → visually compare the bent-elbow posture).

**Result**: The full journey (select keyframe, change a joint value, apply, navigate, solve, seek, and visually confirm the same posture) completed in well under 60 seconds during manual verification; the automated `tests/e2e/pose.spec.ts` and `tests/e2e/workbench.spec.ts` suites exercise the same handoff and both complete in single-digit seconds per run. **Status: PASS** (informal single-operator timing; a broader timed usability session with representative users remains recommended before a general release claim).

## SC-003: Structured recognition review (≥8 participants, ≥90% correct identification)

**Status: PENDING — requires human participants and has not been executed.**

This criterion requires showing the unlabeled Pose or Workbench side view to at least eight representative riders or coaches and recording whether each participant, unprompted, identifies:

1. The figure as a human in a riding posture.
2. The bicycle's frame, pedals, saddle, fork, and handlebars.

**Recommended protocol** (for the maintainer to execute before claiming this criterion met):

1. Capture the current `pose-desktop.png` / `workbench-desktop.png` visual snapshots (already regenerated in this implementation) as the review stimulus, cropped to remove UI chrome and text labels.
2. Recruit at least 8 participants matching the "rider or coach" persona.
3. Show each participant the unlabeled image and ask: "What do you see?" without prompting.
4. Record whether each of the 6 required elements (human riding posture; frame; pedals; saddle; fork; handlebars) was named unprompted.
5. Compute the pass rate; the criterion requires ≥90% of participants identifying the figure as human-in-riding-posture and identifying the bicycle elements.
6. Record results in this file, replacing this pending section.

**What is available now as supporting (not substituting) evidence**: automated geometry contracts (Rust `pose_geometry` tests, `bike-geometry.test.ts`) prove every required landmark (head, torso, both arm/leg pairs with visible elbow/knee/ankle, wheels, frame, saddle, crank/pedals, fork, handlebars) is present, connected, and finite in every tested configuration — recognizability itself still requires the human review above.

## Remaining Limitations at Time of This Release

- Bicycle frame tubes, saddle, crank shape, fork silhouette, and steering assembly are documented representative schematic proportions, not measured bike-fit dimensions (disclosed in-view).
- Fork/rear-shock compression is shown at configured static travel/sag; no measured suspension compression telemetry exists yet.
- `engine-webkit` (desktop Safari device emulation) shows marginal solve-timing behavior outside the required `test:e2e:views`/`test:visual` matrix; see [implementation-validation.md](implementation-validation.md) for details.
- SC-003's human recognition review has not yet been executed (see above).
