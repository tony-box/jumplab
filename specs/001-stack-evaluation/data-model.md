# Data Model: Stack Decision and Runtime Boundaries

## Modeling Rules

- Physics values use SI units. Angles are radians at persistence and worker boundaries; degrees are
  presentation-only.
- Every persisted or cross-thread payload has an explicit schema or protocol version.
- IDs are stable UUID strings generated outside the deterministic physics path.
- Wall-clock timestamps are metadata only and MUST NOT influence simulation state or hashes.
- Physics collections use canonical ID order before constructing bodies, colliders, and joints.
- Imported, persisted, and worker-returned data is untrusted until runtime validation succeeds.
- Run results are immutable. A changed scenario creates a new run and never mutates an old one.
- JSON Schema validates portable structure. Zod refinements enforce cross-field rules, including
  joint `min <= max`, suspension `sag <= travel`, strictly ordered unique pose-key distances, output
  frequency divisibility, and frame-type/suspension consistency.

## Stack Evaluation Entities

### StackArea

A consequential responsibility requiring one approved selection.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | enum | `ui`, `routing`, `rendering`, `charts`, `physics`, `worker`, `state`, `validation`, `storage`, `offline`, `testing`, `delivery` |
| `name` | string | Unique human-readable name |
| `owner` | string | Person or role accountable for the decision |
| `status` | enum | `open`, `selected`, `approved`, `superseded` |
| `gateIds` | criterion ID array | At least one hard gate for consequential areas |

### Candidate

A viable approach considered for one or more stack areas.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Unique within the decision record |
| `stackAreaId` | StackArea ID | Required |
| `name` | string | Concrete technology or architecture approach |
| `versionBaseline` | string or null | Evidence snapshot; exact implementation version is lockfile-pinned |
| `license` | string or null | Must be redistribution-compatible before selection |
| `ratings` | CriterionRating array | One rating for every applicable criterion |
| `gateStatus` | enum | `pass`, `fail`, `risk` |
| `risks` | string array | Includes unresolved limitations |
| `fallback` | string or null | Required for selected high-risk candidates |

### EvaluationCriterion

A consistent weighted criterion or non-compensating gate.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Stable identifier |
| `name` | string | Unique |
| `weight` | integer | 0-100; weighted criteria total 100 |
| `kind` | enum | `weighted`, `gate` |
| `sourceRefs` | string array | Constitution, specification, or wireframe references |
| `acceptanceRule` | string | Testable pass or rating rule |

### CriterionRating

| Field | Type | Rules |
| --- | --- | --- |
| `criterionId` | EvaluationCriterion ID | Required |
| `score` | integer or null | 1-5 for weighted criteria; null for gates |
| `gateResult` | boolean or null | Required for gate criteria |
| `evidenceIds` | EvidenceItem ID array | At least one item for selected candidates |
| `notes` | string | Explains rating and caveats |

### EvidenceItem

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Unique |
| `kind` | enum | `primary-doc`, `package-metadata`, `measurement`, `validation-result` |
| `title` | string | Required |
| `source` | URI or repository path | Required |
| `observedAt` | ISO date | Required because package facts age |
| `claim` | string | One bounded claim supported by the source |

### DecisionRecord

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Unique |
| `stackAreaId` | StackArea ID | One active approved record per area |
| `selectedCandidateId` | Candidate ID | Candidate gate status must not be `fail` |
| `rationale` | string | Must explain tradeoff and alternatives |
| `rejectedCandidateIds` | Candidate ID array | At least one unless single-candidate justification exists |
| `riskIds` | string array | Required for material risks |
| `revisitTriggers` | string array | At least one |
| `provisionallyApprovedBy` | string or null | Required when status becomes `provisionally-approved` |
| `provisionallyApprovedAt` | ISO timestamp or null | Metadata only |
| `approvedBy` | string or null | Required when status becomes `approved` |
| `approvedAt` | ISO timestamp or null | Metadata only |
| `status` | enum | `draft`, `provisionally-approved`, `evidence-complete`, `approved`, `superseded` |
| `supersedes` | DecisionRecord ID or null | Required when replacing an approved record |

### ValidationExercise

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Unique |
| `name` | string | Required |
| `candidateIds` | Candidate ID array | At least one |
| `claim` | string | High-risk claim under test |
| `environment` | BenchmarkEnvironment | Exact hardware/software when run |
| `procedure` | string array | Reproducible ordered steps |
| `acceptanceRules` | string array | Measurable |
| `measurements` | object or null | Null until executed |
| `status` | enum | `planned`, `running`, `passed`, `failed` |

### BenchmarkEnvironment

| Field | Type | Rules |
| --- | --- | --- |
| `deviceModel` | string | Exact model when measured |
| `cpu` | string | Exact processor |
| `memoryGiB` | number | Positive |
| `graphics` | string | Required for rendering tests |
| `powerMode` | string | Required |
| `os` | string | Name and build |
| `browser` | string | Name and exact version |
| `appVersion` | string | Exact build identifier |
| `solverVersion` | string | Exact physics-core identifier |

### InputControlContract

Machine-readable teaching metadata for each editable control used by the representative browser spike.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | Stable and unique; matches the rendered control contract |
| `label` | string | User-facing name |
| `unit` | string | SI display unit or documented dimensionless value |
| `minimum` | number | Inclusive validated lower bound |
| `maximum` | number | Inclusive validated upper bound; greater than minimum |
| `physicalQuantity` | string | The modeled quantity changed by the control |
| `explanation` | string | Concise causal explanation suitable for the UI |
| `scenarioPath` | string | Canonical path in Scenario |

Every editable spike control references exactly one InputControlContract. A rendered range, unit, or
explanation MUST be generated from this contract rather than duplicated in a component.

## Runtime Boundary Entities

### ScenarioFile

Portable JSON envelope for offline import/export.

| Field | Type | Rules |
| --- | --- | --- |
| `format` | literal | `bike-jumper-scenario` |
| `schemaVersion` | integer | Positive; version 1 initially |
| `exportedBy` | VersionStamp | App and solver versions required |
| `scenario` | Scenario | Must validate before state mutation |
| `contentHash` | string | SHA-256 of canonical scenario JSON |

Import lifecycle:

```text
selected -> parsed -> envelope validated -> version checked
  -> migrated in memory (when supported) -> scenario validated -> hash checked -> committed
  -> rejected (on any error; current scenario remains unchanged)
```

### VersionStamp

| Field | Type | Rules |
| --- | --- | --- |
| `appVersion` | semantic version string | Required |
| `solverVersion` | semantic version or content identifier | Required |
| `exportedAt` | ISO timestamp | Metadata only; excluded from scenario hash |

### Scenario

| Field | Type | Rules |
| --- | --- | --- |
| `schemaVersion` | integer | Must match the normalized runtime schema |
| `id` | UUID | Stable across save/export/import |
| `name` | string | 1-80 characters |
| `jump` | JumpSpec | Required |
| `rider` | RiderSpec | Required |
| `bike` | BikeSpec | Required |
| `entry` | EntrySpec | Required |
| `poseClip` | PoseClip | Required |
| `solver` | SolverConfig | Required |

### JumpSpec

| Field | Type | Units / rules |
| --- | --- | --- |
| `kind` | enum | `table`, `gap`, `stepup`, `stepdown` |
| `lipHeight` | number | metres, positive |
| `lipAngle` | number | radians |
| `transitionRadius` | number | metres, positive |
| `gap` | number | metres, non-negative |
| `stepDelta` | number | metres; zero unless step-up/down |
| `landingAngle` | number | radians |
| `landingLength` | number | metres, positive |
| `rollout` | number | metres, non-negative |

The physics core derives canonical terrain points with deterministic math. The renderer consumes those
points; it MUST NOT independently approximate terrain geometry.

### RiderSpec

| Field | Type | Units / rules |
| --- | --- | --- |
| `height` | number | metres |
| `mass` | number | kilograms |
| `legRatio` | number | dimensionless anthropometric ratio |
| `armRatio` | number | dimensionless anthropometric ratio |
| `strengthScale` | number | positive multiplier |
| `kp` | number | non-negative motor stiffness scale |
| `kd` | number | non-negative motor damping scale |
| `joints` | map | Limits and `tauMax` for all physical rider joints |

Segment lengths and masses are derived in the physics core from documented anthropometric ratios.

### BikeSpec

| Field | Type | Units / rules |
| --- | --- | --- |
| `frameType` | enum | `rigid`, `hardtail`, `full` |
| `wheelSize` | enum | `26`, `27.5`, `29` inches at UI edge; converted once to metres |
| `wheelbase` | number | metres |
| `chainstay` | number | metres |
| `bbHeight` | number | metres |
| `mass` | number | kilograms |
| `fork` | SuspensionSpec | Required; zero travel for rigid bike |
| `rearShock` | SuspensionSpec or null | Required only for `full` |

### SuspensionSpec

| Field | Type | Units / rules |
| --- | --- | --- |
| `travel` | number | metres, non-negative |
| `sag` | number | metres, between zero and travel |
| `springRate` | number | newtons/metre, non-negative |
| `damping` | number | newton-seconds/metre, non-negative |

### EntrySpec

| Field | Type | Units / rules |
| --- | --- | --- |
| `speed` | number | metres/second, positive |
| `startX` | number | metres relative to lip, negative |

### PoseClip

Distance-relative authored rider targets.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | UUID | Required |
| `name` | string | 1-80 characters |
| `interpolation` | enum | `cubic`, `linear`, `step` |
| `keys` | PoseKey array | At least two; sorted by `s`; unique `s` values |

### PoseKey

| Field | Type | Rules |
| --- | --- | --- |
| `s` | number | metres relative to lip; negative on approach |
| `label` | string | 1-40 characters |
| `targets` | driven-joint map | `ankle`, `knee`, `hip`, `spine` angles in radians |

Shoulder and elbow are derived from the hand-to-handlebar inverse-kinematics constraint. They are
present in achieved frame state but are not authored channels.

### SolverConfig

| Field | Type | Rules |
| --- | --- | --- |
| `dt` | number | Fixed seconds; shipped default `1/960` |
| `substeps` | integer | Positive |
| `ccd` | boolean | Required |
| `seed` | unsigned integer | Reserved for deterministic future stochastic inputs |
| `outputHz` | integer | Default 240; must divide physics frequency exactly |
| `solverVersion` | string | Exact physics model identifier |

The physics core fixes aerodynamic drag, tire/terrain friction, and unmodeled linear/angular damping
to zero. These are model invariants, not editable SolverConfig fields.

### PoseSample

Authoritative physics-core output for previewing one PoseClip at a distance coordinate.

| Field | Type | Rules |
| --- | --- | --- |
| `s` | number | Requested distance in metres relative to the lip |
| `targets` | driven-joint map | Rust-interpolated ankle, knee, hip, and spine radians |
| `derivedArm` | object | Rust-derived shoulder/elbow radians and constraint status |
| `solverVersion` | string | Exact physics model identifier |

TypeScript may draw authored keyframe curves but MUST use PoseSample for the authoritative preview.

### EntrySpeedWindow

Physics-core analysis result for one normalized jump and bike/rider configuration.

| Field | Type | Rules |
| --- | --- | --- |
| `minimum` | number | Metres/second |
| `maximum` | number | Metres/second; greater than or equal to minimum |
| `scenarioHash` | string | Hash of normalized analysis inputs |
| `solverVersion` | string | Exact physics model identifier |
| `status` | enum | `measured`, `unavailable` |
| `reason` | string or null | Required when unavailable |

### RunResult

| Field | Type | Rules |
| --- | --- | --- |
| `runId` | UUID | Unique per solve request |
| `scenarioHash` | string | SHA-256 of canonical normalized scenario |
| `solverVersion` | string | Exact |
| `frames` | immutable Frame sequence | Ordered by frame index |
| `phases` | Phase interval array | Ordered, non-overlapping |
| `metrics` | Metric map | Every metric has source and unit |
| `telemetry` | Telemetry | Required |
| `resultHash` | string | Hash of canonical result bytes |

### Frame

| Field | Type | Rules |
| --- | --- | --- |
| `index` | unsigned integer | Contiguous from zero |
| `t` | number | Derived from index/output frequency |
| `bike` | bike transform | Metres and radians |
| `wheels` | rear/front contact tuple | Stable order |
| `joints` | achieved joint map | Angle, target, torque for all six rider joints |
| `com` | position/velocity | SI units |
| `suspension` | front/rear state | Travel, velocity, force |
| `energy` | energy state | Joules; includes cumulative motor work |

Frames are stored in packed typed-array buffers across the worker boundary. TypeScript views expose
named fields without changing byte order.

### Metric

| Field | Type | Rules |
| --- | --- | --- |
| `value` | number or null | Null when unavailable |
| `unit` | string | Required |
| `source` | enum | `measured`, `estimate`, `pending-core` |
| `reason` | string or null | Required for `estimate` and `pending-core` |

### SolverRequest Lifecycle

```text
idle -> initializing -> ready -> solving
solving -> progress -> succeeded
solving -> cancelling -> cancelled -> initializing -> ready
solving -> failed -> ready
solving -> stale result discarded -> ready
```

Only the result whose `runId` matches the controller's active request may enter the run store.

## Relationships

- A StackArea has many Candidates and one active approved DecisionRecord.
- A Candidate has many CriterionRatings; each rating references EvidenceItems.
- A DecisionRecord selects one Candidate and may be superseded by another DecisionRecord.
- A ValidationExercise tests one or more Candidates in one recorded BenchmarkEnvironment.
- A ScenarioFile contains one Scenario and one VersionStamp.
- A Scenario has one JumpSpec, RiderSpec, BikeSpec, EntrySpec, PoseClip, and SolverConfig.
- A Scenario produces zero or more immutable RunResults.
- A RunResult contains Frames, Phases, Metrics, and Telemetry and is keyed by scenario and solver hashes.
