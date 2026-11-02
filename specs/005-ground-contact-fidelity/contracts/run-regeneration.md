# Contract: Legacy Run Regeneration

**Feature**: [../spec.md](../spec.md) | **Status**: Design | **Persistence version**: 2

Implements the recorded clarification and FR-015: opening a run produced by an older solver version
automatically regenerates its solution in place.

Logical persistence contract version 2 is distinct from the IndexedDB schema. The existing database
already defines Dexie versions 1 and 2; this feature adds Dexie schema version 3.

## 1. Terms

- **Saved inputs**: `runId`, `createdAt`, `scenarioSnapshot`, `scenarioHash`. Never modified.
- **Derived solution**: `frameBuffer`, `telemetryBuffer`, `manifest`, `model`, `resultHash`, and
  `source`. Replaced during regeneration.

Regeneration replaces only the derived solution. Run identity is preserved so report links,
baselines, and comparisons continue to resolve.

## 2. Trigger

On loading a stored artifact, compare `artifact.model.solverVersion` with the active solver version
reported by the gateway manifest.

| Condition | Action |
| --- | --- |
| Versions equal | Replay stored solution directly |
| Versions differ, snapshot usable | Regenerate in place, then replay |
| Versions differ, snapshot missing or invalid | Enter `regeneration-unavailable` |
| Versions equal, frame buffer has wrong stride or invalid length | Treat as corruption and regenerate or refuse |

`legacySnapshotMissing === true`, set by the existing Dexie upgrade in
`apps/web/src/storage/database.ts`, always maps to the third row.

## 3. State Machine

```text
idle
  └─> inspecting            (artifact loaded, versions compared)
        ├─> current         → replay stored solution
        ├─> regenerating    → re-solve from scenarioSnapshot
        │     ├─> regenerated → persist, then replay
        │     └─> regeneration-failed
        └─> regeneration-unavailable
```

### Terminal states

- `current`: solution matches the active solver; nothing to do.
- `regenerated`: derived solution replaced and persisted; run identity unchanged.
- `regeneration-unavailable`: inputs insufficient. The run MUST NOT be replayed. The interface states
  that the stored result came from an older solver and cannot be regenerated.
- `regeneration-failed`: re-solve was attempted and errored. The run MUST NOT be replayed. The solver
  diagnostic is surfaced verbatim.

**Invariant**: in no state does a solution produced by a superseded solver version reach the stage, a
report, or a baseline comparison.

## 4. Regeneration Procedure

1. Read `scenarioSchemaVersion` and migrate `scenarioSnapshot` to the current scenario schema before
  validation. If no migration path exists or validation fails, enter `regeneration-unavailable`.
2. Re-solve with the active solver using the original `runId`.
3. Verify the stored `scenarioHash` against the canonical hash rules for the snapshot's original
  schema version before migration. Then compute and store the current-schema hash for the regenerated
  artifact. A mismatch means the snapshot does not describe the stored run, so enter
  `regeneration-unavailable`.
4. Replace the derived solution; preserve `runId`, `createdAt`, `scenarioSnapshot`, `scenarioHash`.
5. Set `model.solverVersion`, `model.modelVersion`, and `model.terrainSampleStep` to active values,
   keeping `manifest.solverVersion` equal to `model.solverVersion`.
6. Validate the assembled artifact against `runArtifactSchema`. On failure, enter
   `regeneration-failed` and persist nothing.
7. Persist atomically through a new `replaceSolution()` repository operation.

Regeneration MUST be idempotent: immediately reopening a regenerated run yields `current` and does no
work.

## 5. Repository API Addition

`apps/web/src/storage/repositories.ts` gains:

```text
replaceSolution(runId, derivedSolution) -> Promise<RunRecord>
```

- Fails if `runId` does not exist.
- Writes derived fields only; MUST NOT write saved inputs.
- Copies buffers with `.slice(0)`, matching existing `save()` immutability behaviour.
- Runs in a single Dexie transaction so a failure leaves the stored record untouched.
- Dexie schema version 3 adds any detection or metadata fields required by logical persistence v2;
  it MUST NOT redefine or reuse the existing version-2 upgrade.

## 6. User-Visible Behaviour

- Successful regeneration is non-blocking and requires no confirmation; the workbench shows the
  corrected run. A brief, non-modal notice states that the run was regenerated for the current
  solver.
- `regeneration-unavailable` and `regeneration-failed` present an explicit message with the reason.
  Playback controls are disabled and no frames render, because replaying the legacy solution is
  forbidden.
- No state invents metrics. Values that cannot be produced remain visibly unavailable, per
  constitution gate 3.

## 7. Conformance Tests

| Scenario | Expected | Level |
| --- | --- | --- |
| Stored run with old `solverVersion` and valid snapshot | Regenerated in place; `runId` and `createdAt` unchanged; version current | persistence |
| Same run reopened after regeneration | `current`; no second re-solve | persistence |
| Stored run with `legacySnapshotMissing: true` | `regeneration-unavailable`; no frames rendered | persistence |
| Stored run whose snapshot fails schema validation | `regeneration-unavailable`; stored record untouched | persistence |
| Snapshot whose recomputed hash differs from stored hash | `regeneration-unavailable`; stored record untouched | persistence |
| Re-solve throws | `regeneration-failed`; nothing persisted; diagnostic surfaced | persistence |
| Dexie version-3 upgrade or replacement transaction aborts | Original record remains intact; explicit failure surfaced | persistence |
| Current solver metadata paired with a stride-31 or malformed buffer | Regenerated when inputs are valid; otherwise blocked as corrupt | persistence |
| Older scenario schema with a registered migration | Original-version hash verified, snapshot migrated, corrected solution stored | persistence |
| Baseline comparison referencing a regenerated run | Resolves by `runId`; no `version-warning` | contract |
| Opening a legacy run in the workbench | Corrected animation; wheels respect the ground | e2e |
