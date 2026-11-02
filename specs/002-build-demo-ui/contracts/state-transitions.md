# State Transition Contract

## Global Invariants

- Scenario and Pose edits never invoke the solver.
- Every committed edit passes Scenario validation.
- A RunArtifact never changes after commit.
- Presentation state never changes result hashes or frame/telemetry buffers.
- Missing entity references remain explicit until clear/replace.
- Fixture-backed evidence is labeled and cannot satisfy physics gates.

## Scenario and Run State

| Current        | Event               | Next                | Side effects                                 |
| -------------- | ------------------- | ------------------- | -------------------------------------------- |
| no scenario    | create/load preset  | scenario, no result | validate clone; route Workbench              |
| no result      | valid edit          | no result           | update scenario only                         |
| no result      | Solve Run           | solving             | snapshot/hash scenario; dispatch worker      |
| current result | valid edit          | stale result        | preserve displayed run; update scenario      |
| stale result   | presentation change | stale result        | no solve                                     |
| stale result   | Solve Run           | solving             | snapshot/hash latest scenario                |
| solving        | progress            | solving             | monotonic progress only                      |
| solving        | valid result        | current result      | validate and commit new RunArtifact          |
| solving        | recoverable error   | stale/no result     | preserve scenario and previous displayed run |
| solving        | cancel              | cancelling          | request cancellation                         |
| cancelling     | cancelled           | stale/no result     | preserve scenario and previous displayed run |

`Solve Run` is disabled during initialization and when required supported inputs are invalid. While solving, the designated action may become Cancel Solve without creating a second primary command.

## Playback State

`empty -> ready(frame 0) -> playing <-> paused -> ended`

- Step, scrub, Home, and frame checkpoint commands pause or reposition the immutable frame index.
- Playback rate changes wall-clock advancement only, not frame data or solver output.
- Resize and camera changes redraw the same frame.
- Switching active run resets or clamps frame index deterministically and never interpolates across runs.

## Pose Editor State

| Event                | Required result                                                                       |
| -------------------- | ------------------------------------------------------------------------------------- |
| Select key           | Pose canvas, distance track, joint table, and sliders reference one key identity      |
| Add key              | Insert at playhead/valid midpoint, preserve strict distance order, select new key     |
| Move key             | Clamp between neighbors with non-zero separation                                      |
| Delete key           | Reject when two keys remain; otherwise select nearest surviving key                   |
| Edit target          | Validate and immediately replace active Scenario PoseClip; mark run stale             |
| Drag handle          | Request constrained sample; clamp/flag unreachable result; never store invalid number |
| Change interpolation | Immediately replace active Scenario PoseClip; mark run stale                          |
| Reset pose           | Replace selected targets with neutral values; mark run stale                          |
| Apply to run         | Navigate Workbench only; no mutation beyond prior immediate edits; no solve           |

## Baseline State

| Event/condition                   | State                   | UI result                                                               |
| --------------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| No baseline selected              | `none`                  | baseline card hidden/empty; deltas blank                                |
| Pin available run                 | compatibility evaluated | baseline card visible                                                   |
| Matching metadata/version         | `compatible`            | deltas available                                                        |
| Matching metadata, solver differs | `version-warning`       | deltas available plus persistent warning                                |
| Comparison metadata differs       | `incompatible`          | baseline remains selected; deltas blank; reason visible                 |
| Artifact missing                  | `unavailable`           | reference remains visible/disabled; deltas blank; clear/replace offered |
| Clear reference                   | `none`                  | only baseline reference removed                                         |
| Replace reference                 | compatibility evaluated | unrelated report/workbench state preserved                              |

## Historical Run Reopening

1. Resolve `/report/:runId` to a complete RunArtifact.
2. Clone and validate `scenarioSnapshot`.
3. Assign a new ScenarioWorkingCopy identity and set `originRunId`.
4. Set the historical run as displayed/current without mutating it.
5. Navigate Workbench.
6. First valid edit marks the historical result stale; Solve Run creates a new RunArtifact and provenance remains inspectable.

Legacy artifacts without snapshots disable Open in Workbench and explain that exact inputs are unavailable.

## Stale Reference State

`available -> unavailable-visible -> cleared | replaced`

- Detection does not remove the reference.
- The original display label remains when available from session metadata.
- Dependent controls/actions are disabled.
- Inline explanation names the missing kind and offers clear/replace.
- Clear removes only that reference.
- Replace validates the replacement before changing state.

## Validation Suite State

| Current               | Event                        | Next                                |
| --------------------- | ---------------------------- | ----------------------------------- |
| idle/completed/failed | Run Suite                    | running                             |
| running               | row started                  | running with row status             |
| running               | row result                   | running with pass/fail/awaiting row |
| running               | all available checks settle  | completed                           |
| running               | runtime budget exceeded      | budget-exceeded                     |
| running               | unrecoverable runner failure | failed                              |

Final summary invariants:

- `checks = passing + failing + awaiting-core` for settled rows.
- Running rows are zero at terminal state.
- Budget-exceeded and runner failure are not pass.
- Pending gates never transition to pass without an available measured check.
