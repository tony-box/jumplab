# Data Model: Demoable Workbench UI

## Modeling Rules

- `@bike-jumper/schema` remains the authority for data that crosses workers, storage, import/export, or route-provider boundaries.
- Existing strict scenario schemas are reused rather than duplicated in view models.
- Editable scenario state and immutable run evidence are separate objects with separate identities.
- Buffers remain binary and are referenced by validated manifests; they are not converted to large JSON arrays.
- Internal metric source value `pending-core` is rendered to users as `awaiting core`.
- UI-only continuity is session-scoped and must not silently become durable domain data.

## Existing Domain Entities

### Scenario

Validated by `scenarioSchema`.

| Field           | Type         | Rules                                                     |
| --------------- | ------------ | --------------------------------------------------------- |
| `schemaVersion` | `1`          | Required and migrated before use                          |
| `id`            | UUID         | Unique scenario identity                                  |
| `name`          | string       | 1-80 characters                                           |
| `jump`          | JumpSpec     | Defines feature and landing geometry                      |
| `rider`         | RiderSpec    | Defines anthropometry, mass, gains, and joint limits      |
| `bike`          | BikeSpec     | Defines frame, geometry, mass, and suspension             |
| `entry`         | EntrySpec    | Defines initial speed and position                        |
| `poseClip`      | PoseClip     | Active movement; edits apply immediately                  |
| `solver`        | SolverConfig | Fixed timestep, substeps, CCD, seed, output rate, version |

Relationships:

- One Scenario owns one JumpSpec, RiderSpec, BikeSpec, EntrySpec, PoseClip, and SolverConfig.
- One editable Scenario may produce many immutable RunArtifacts.
- A ScenarioWorkingCopy may originate from a historical RunArtifact but has a distinct session identity.

### JumpSpec

Fields: `kind`, `lipHeight`, `lipAngle`, `transitionRadius`, `gap`, `stepDelta`, `landingAngle`, `landingLength`, `rollout`.

Validation:

- All fields use existing finite numeric bounds.
- Table and gap jumps require zero step delta.
- Step-up requires positive step delta; step-down requires negative step delta.

### RiderSpec

Fields: `height`, `mass`, `legRatio`, `armRatio`, `strengthScale`, `kp`, `kd`, and six JointLimits for ankle, knee, hip, spine, shoulder, and elbow.

Validation:

- Existing anthropometric, gain, mass, and angular bounds apply.
- Each joint has ordered `min`/`max` values and a non-negative `tauMax`.

### BikeSpec

Fields: `frameType`, `wheelSize`, `wheelbase`, `chainstay`, `bbHeight`, `mass`, `fork`, and nullable `rearShock`.

Validation:

- Full suspension requires a rear shock.
- Rigid and hardtail bikes prohibit a rear shock.
- Suspension sag cannot exceed travel.

### PoseClip and PoseKey

PoseClip fields: `id`, `name`, `interpolation`, `keys`.

PoseKey fields: along-track distance `s`, `label`, and authored ankle/knee/hip/spine targets. Shoulder and elbow remain derived by the bar constraint.

Validation:

- A clip contains 2-64 keys.
- Keys are strictly ordered by `s` and distances are unique within a clip.
- Interpolation is `cubic`, `linear`, or `step`.
- Every valid edit replaces the Scenario's active PoseClip immediately and marks the active run stale.

### RunResult

Existing worker manifest fields: `runId`, `scenarioHash`, `solverVersion`, `frameLayout`, `frameCount`, `outputHz`, ordered `phases`, metric map, telemetry layout, and `resultHash`.

Validation:

- Phase intervals are ordered and non-overlapping.
- Measured metrics require numeric values and no reason.
- Estimate and pending-core metrics require a reason.
- Frame fields fit within the declared stride and do not overlap.
- Telemetry channels fit within sample count.

## New and Extended Shared Contracts

### SolverCapabilityManifest

Extends the worker ready event so the UI can gate individual controls and outputs.

| Field                    | Type                | Rules                                   |
| ------------------------ | ------------------- | --------------------------------------- |
| `protocolVersion`        | integer literal     | Increment when required fields change   |
| `solverVersion`          | string              | Non-empty                               |
| `modelVersion`           | string              | Non-empty                               |
| `deterministic`          | `true`              | Required                                |
| `supportedScenarioPaths` | unique string array | Canonical `scenario.*` paths            |
| `supportedOutputs`       | unique string array | Canonical metric/channel capability IDs |
| `ccd`                    | boolean             | Existing capability                     |
| `contactImpulse`         | boolean             | Existing capability                     |
| `motorWork`              | boolean             | Existing capability                     |
| `jointTorque`            | boolean             | Existing capability                     |

Rules:

- A physical InputControl is editable only when its `scenarioPath` appears in `supportedScenarioPaths`.
- A metric or overlay is measured only when its capability appears in `supportedOutputs` and the run supplies valid data.
- Missing capability arrays during migration are treated as unsupported, never as fully supported.

### InputControlContract

Existing fields remain: `id`, `label`, `unit`, `minimum`, `maximum`, `physicalQuantity`, `explanation`, `scenarioPath`.

Additions:

| Field   | Type                   | Rules                                          |
| ------- | ---------------------- | ---------------------------------------------- |
| `step`  | finite positive number | Must not exceed `maximum - minimum`            |
| `group` | enum                   | `jump`, `landing`, `entry`, `rider`, or `bike` |

Support is resolved at runtime by matching `scenarioPath` to SolverCapabilityManifest; it is not hard-coded into presentation components.

### ModelMetadata

| Field                     | Type    | Rules                                                              |
| ------------------------- | ------- | ------------------------------------------------------------------ |
| `scenarioSchemaVersion`   | integer | Copied from Scenario                                               |
| `solverVersion`           | string  | Matches RunResult                                                  |
| `modelVersion`            | string  | Captured from ready event                                          |
| `assumptionsId`           | string  | Stable identifier for physical assumptions/excluded effects        |
| `unitSystemId`            | string  | Stable identifier; initial value represents project SI conventions |
| `metricDefinitionVersion` | string  | Stable version for names, units, and meanings                      |

### RunArtifact

The immutable application/storage contract around a worker result.

| Field              | Type          | Rules                                  |
| ------------------ | ------------- | -------------------------------------- |
| `runId`            | UUID          | Same as manifest run ID; unique        |
| `createdAt`        | ISO datetime  | Set once                               |
| `scenarioSnapshot` | Scenario      | Exact validated input used for solve   |
| `scenarioHash`     | SHA-256       | Matches snapshot and manifest          |
| `manifest`         | RunResult     | Immutable validated result             |
| `model`            | ModelMetadata | Required for comparison and disclosure |
| `frameBuffer`      | ArrayBuffer   | Length/layout validated before commit  |
| `telemetryBuffer`  | ArrayBuffer   | Length/layout validated before commit  |
| `source`           | enum          | `solver` or `representative-fixture`   |

Rules:

- `source=solver` is required for a result created from editable physical controls in the product workflow.
- `representative-fixture` is allowed only through injected test/demo providers and must remain visibly labeled.
- No field on a committed RunArtifact is mutated.
- Opening the artifact creates a ScenarioWorkingCopy; it does not return the embedded object for mutation.

### ScenarioWorkingCopy

UI state, not part of exported Scenario schema.

| Field            | Type               | Rules                             |
| ---------------- | ------------------ | --------------------------------- |
| `workingId`      | UUID               | Distinct session identity         |
| `scenario`       | Scenario           | Valid after every committed edit  |
| `currentHash`    | SHA-256 or pending | Recomputed at solve/save boundary |
| `originRunId`    | UUID or null       | Provenance only                   |
| `displayedRunId` | UUID or null       | Result currently shown            |
| `resultState`    | enum               | `none`, `current`, or `stale`     |

Transitions:

- Load preset/new scenario -> `resultState=none`.
- Open historical run -> clone snapshot, set `originRunId` and `displayedRunId`, `resultState=current`.
- Any valid supported scenario or pose edit -> `resultState=stale` without solving.
- Successful Solve Run -> new RunArtifact, `displayedRunId` updated, `resultState=current`.

### BaselineSelection

| Field           | Type                    | Rules                                                                  |
| --------------- | ----------------------- | ---------------------------------------------------------------------- |
| `runId`         | UUID or stale reference | Pinned explicitly                                                      |
| `compatibility` | enum                    | `none`, `compatible`, `version-warning`, `incompatible`, `unavailable` |
| `reasons`       | string array            | Required for warning/incompatible/unavailable                          |

Compatibility algorithm:

1. Require matching scenario schema versions.
2. Require matching `assumptionsId`, `unitSystemId`, and `metricDefinitionVersion`.
3. If those match and solver versions differ, return `version-warning` and allow deltas.
4. Any other mismatch returns `incompatible`; deltas remain blank.

### Preset

| Field         | Type                            | Rules                                                |
| ------------- | ------------------------------- | ---------------------------------------------------- |
| `id`          | stable string                   | Unique within category                               |
| `category`    | enum                            | `jump`, `rider`, `bike`, or `movement`               |
| `name`        | string                          | Searchable                                           |
| `tags`        | string array                    | Searchable                                           |
| `note`        | string                          | Searchable coaching/context text, not a safety claim |
| `patch`       | validated domain subset         | Applies only to its category                         |
| `readOnly`    | `true`                          | Presets are never mutated                            |
| `speedWindow` | EntrySpeedWindow or unavailable | Jump presets only                                    |

Loading applies a validated clone to a working scenario. Duplicating creates a new Scenario UUID and leaves the preset unchanged.

### ValidationCheck

| Field         | Type                  | Rules                                                                 |
| ------------- | --------------------- | --------------------------------------------------------------------- |
| `id`          | stable string         | Unique                                                                |
| `category`    | enum                  | `analytical`, `convergence`, `determinism`, or `pending`              |
| `label`       | string                | Human-readable                                                        |
| `measured`    | value/unit or null    | Null when awaiting capability                                         |
| `tolerance`   | value/unit or null    | Same dimension as measured                                            |
| `margin`      | finite number or null | Pass when defined and at least 1                                      |
| `traceRef`    | string or null        | Evidence reference                                                    |
| `owner`       | string or null        | Required for pending gate                                             |
| `blockedGate` | string or null        | Required for pending gate                                             |
| `status`      | enum                  | `idle`, `running`, `pass`, `fail`, `awaiting-core`, `budget-exceeded` |

Pending checks cannot transition directly to pass without measured evidence and an available capability.

## Session UI State

### SessionState

| Field             | Purpose                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| `activeWorkingId` | Current ScenarioWorkingCopy                                              |
| `activeRoute`     | Restoration hint; router URL remains authoritative                       |
| `workbench`       | Input tab, overlays, camera mode, zoom, playback rate                    |
| `pose`            | Selected key identity and overlay choices                                |
| `library`         | Active category and search query                                         |
| `report`          | Selected run and baseline references                                     |
| `validation`      | Selected timestep; results remain in memory                              |
| `staleReferences` | Missing IDs with kind, display label, explanation, clear/replace actions |

Rules:

- SessionState contains IDs and small preferences, not frame or telemetry buffers.
- An unavailable reference remains represented and disabled until explicitly cleared or replaced.
- Restoring one stale reference never clears unrelated fields.
- Selection indices are restored by stable identity where possible and clamped only for non-entity positions such as frame index.

## Lifecycle Summary

### Solver

`idle -> initializing -> ready -> solving -> ready`

Exceptional transitions: `solving -> cancelling -> cancelled -> ready`, and any initialization/solve state may enter `failed` with a recoverable or terminal error classification.

### Primary Run

`none -> solving -> current -> stale -> solving -> current`

Playback and presentation changes never alter this lifecycle.

### Validation Suite

`idle -> running -> completed`

Completion contains a mixture of pass, fail, and awaiting-core rows. Runtime budget exhaustion produces `budget-exceeded` and cannot be displayed as a passing suite.
