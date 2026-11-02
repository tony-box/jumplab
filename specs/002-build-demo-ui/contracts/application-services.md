# Application Service Contracts

## Boundary Rules

- All incoming data is validated before entering application state.
- All provider results identify their source as `solver` or `representative-fixture`.
- Production physical results use `solver`; fixtures are injectable test/demo adapters only.
- No service performs a network request in this feature.
- Provider errors are structured and mapped to actionable user states without discarding unrelated edits.

## ScenarioCatalog

Responsibilities:

- List read-only jump, rider, bike, and movement presets.
- Search by normalized name, tag, and note.
- Create a validated default Scenario for the selected category.
- Apply a preset patch to a cloned Scenario.
- Duplicate a preset/scenario with a new Scenario UUID.

Operations:

| Operation                          | Input                    | Output                                | Failure                       |
| ---------------------------------- | ------------------------ | ------------------------------------- | ----------------------------- |
| `list(category)`                   | category                 | ordered Preset list                   | invalid fixture/configuration |
| `search(category, query)`          | category, text           | filtered Preset list and counts       | none; empty is valid          |
| `create(category)`                 | category                 | ScenarioWorkingCopy                   | invalid default               |
| `load(presetId, workingScenario?)` | preset ID, optional base | ScenarioWorkingCopy                   | stale preset reference        |
| `duplicate(sourceId)`              | preset/scenario ID       | ScenarioWorkingCopy with new identity | stale source reference        |

## SolverGateway

Responsibilities:

- Initialize the physics worker and expose SolverCapabilityManifest.
- Submit one validated Scenario snapshot per explicit solve.
- Emit monotonic progress, result, cancellation, and structured error events.
- Sample PoseClip state and analyze entry-speed windows without mutating Scenario.
- Ignore late events for a superseded/cancelled run ID.

Operations:

| Operation            | Input                                   | Output                                         |
| -------------------- | --------------------------------------- | ---------------------------------------------- |
| `initialize`         | app version, expected solver version    | capability manifest or initialization error    |
| `solve`              | run ID, exact validated Scenario        | progress stream and RunArtifact components     |
| `cancel`             | active run ID                           | cancelled event or terminal worker replacement |
| `samplePose`         | PoseClip, distance, RiderSpec, BikeSpec | validated PoseSample                           |
| `analyzeSpeedWindow` | exact validated Scenario                | EntrySpeedWindow                               |
| `dispose`            | none                                    | disposed acknowledgement                       |

Invariants:

- Solve is called only by Workbench Solve Run.
- Scenario snapshot/hash are captured before dispatch and attached to the result.
- Ready-event `supportedScenarioPaths` controls editability; missing path means unsupported.
- Ready-event `supportedOutputs` controls measured overlays/metrics; missing output remains pending-core.
- Worker/protocol/schema mismatch is terminal for that worker instance and visible in core status.

## RunArtifactRepository

Responsibilities:

- Commit immutable RunArtifacts only after manifest, snapshot hash, metadata, and buffer layouts validate.
- Return artifacts without exposing mutable references to embedded Scenario snapshots or buffers.
- List artifacts in stable newest-first order for report selectors.
- Preserve missing IDs as stale references at the session layer.

Operations:

| Operation | Input                    | Output                     | Failure                        |
| --------- | ------------------------ | -------------------------- | ------------------------------ |
| `save`    | complete RunArtifact     | cloned committed artifact  | validation, quota, transaction |
| `get`     | run ID                   | cloned artifact or missing | storage unavailable            |
| `list`    | optional scenario origin | artifact summaries         | storage unavailable            |
| `remove`  | run ID                   | completion                 | storage unavailable            |

Migration:

- Existing records containing `scenarioId` but no snapshot are readable only as legacy artifacts.
- A legacy artifact may be replayed if its buffers validate, but Open in Workbench is disabled with an explanation because exact inputs are unavailable.
- No migration fabricates a snapshot from the current scenario record.

## SessionContinuity

Responsibilities:

- Save and restore small route/view selections in session-scoped browser storage.
- Validate the stored shape and ignore corrupt fields individually.
- Keep stale entity references visible/disabled until clear or replace.
- Never store frame buffers, telemetry buffers, full run artifacts, or secrets.

Operations: `restore`, `save(partialState)`, `clearReference(kind, id)`, and `replaceReference(kind, oldId, newId)`.

## BaselineComparator

Responsibilities:

- Compare RunArtifact metadata before calculating any delta.
- Return one compatibility state and reasons.
- Calculate deltas only for metrics with matching definitions and numeric values.
- Apply metric polarity only to presentation; never change numeric sign.

Compatibility:

| Condition                                         | State             | Delta                        |
| ------------------------------------------------- | ----------------- | ---------------------------- |
| No baseline                                       | `none`            | blank                        |
| Missing baseline                                  | `unavailable`     | blank                        |
| Schema/assumption/unit/metric definition mismatch | `incompatible`    | blank                        |
| Metadata matches and solver version matches       | `compatible`      | allowed                      |
| Metadata matches and solver version differs       | `version-warning` | allowed with visible warning |

## ValidationRunner

Responsibilities:

- Run available analytical, convergence, and determinism checks for selected timestep.
- Emit deterministic row-state updates and reconcile final summary.
- Preserve pending gates as awaiting-core with owner and blocked gate.
- Stop or mark budget-exceeded according to the published validation budget.

Fixture adapters may demonstrate running/failure layouts but cannot turn an unavailable physics gate into pass.

## FrameExporter

Responsibilities:

- Export the selected run's available frame channels as CSV.
- Use manifest field names and stable units in the header/metadata.
- Preserve frame order and numeric precision sufficient for round-trip analysis.
- Explain missing artifact, missing buffer, or unsupported channel without downloading an empty file.

CSV contract:

- UTF-8, comma-delimited, LF line endings.
- First row contains canonical channel names with unit suffix or an adjacent metadata header.
- One data row per frame in ascending frame index.
- No UI-formatted symbols, localized decimal separators, or color/polarity labels.

## Error Contract

Every application error presented to features contains:

| Field             | Meaning                                                            |
| ----------------- | ------------------------------------------------------------------ |
| `code`            | Stable machine-readable category                                   |
| `message`         | Concise user-facing explanation                                    |
| `recoverable`     | Whether the current action may be retried                          |
| `recoveryActions` | Explicit allowed commands such as retry, clear, replace, or return |
| `details`         | Optional non-sensitive diagnostic values                           |

Errors never clear the active scenario automatically. Solver errors preserve edits and mark the attempted result failed/stale. Storage errors preserve the in-memory artifact long enough to export or retry.
