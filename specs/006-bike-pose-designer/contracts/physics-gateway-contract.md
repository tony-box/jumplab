# Physics Gateway Contract

## Overview

The existing solver worker remains the only browser boundary to `physics-core`. Three operations are
added and existing solve/sample operations consume the same canonical geometry model.

All requests carry the gateway's monotonically increasing request identity. UI callers discard stale
responses. JSON responses are parsed by shared schemas before entering application state.

## Inspect Bike Geometry

```text
inspectBikeGeometry(bike: BicycleDesign) -> BikeGeometryInspection
```

Returns canonical landmarks, connected members, protected shapes, closure residual, geometry issues,
bike CoG, planar inertia, geometry model version, and mass-distribution version. It does not require
a pose clip and does not mutate input.

`valid` is false for range, closure, connection, inversion, or self-intersection issues. When finite
draft geometry can be derived, it may be included for marked preview; consumers may not treat it as
applied geometry.

## Resolve Pose Edit

```text
resolvePoseEdit(
  scenario: Scenario,
  keyIndex: integer,
  baselineTargets: PoseTargets,
  requestedTargets: PoseTargets
) -> PoseEditResolution
```

Requirements:

- `keyIndex` identifies an authored key; interpolation is not sampled.
- Baseline must pass complete design validation for that key.
- A valid request returns unchanged targets.
- An invalid request returns the furthest valid fixed-iteration bisection result and conflict reasons
  from the original request.
- Result includes the achieved sample, signed minimum separation, designated contacts, and core/model
  version stamps.

Malformed or invalid baselines return a typed `invalid-baseline` error and no correction.

## Validate Complete Design

```text
validateDesign(scenario: Scenario) -> DesignValidation
```

Validation order is deterministic:

1. Structural scenario and supported-version checks.
2. Semantic bicycle geometry and frame/suspension relationships.
3. Canonical geometry and mass properties.
4. Every authored pose key in sorted index order.
5. Aggregate `canSolve` and conflict count.

Exactly one key result is returned per authored key when geometry is valid. No interpolated samples
are inspected. The operation never alters scenario or pose data.

## Solve Gate

`solveScenarioJson`, `solveFrameBuffer`, and browser `solve` must run the same complete design
validation before integration. When `canSolve` is false, they return `design-invalid` with stable
conflict codes and dispatch no simulation. A caller cannot bypass this gate by navigating directly to
Workbench.

## Sample Pose Evolution

The existing `samplePoseJson` response is extended or replaced by a typed sample operation that also
returns canonical geometry identity, clearance for the requested authored key, contact state, and
mass-property summary. Arbitrary interpolated sampling used by Workbench does not become a clearance
gate.

## Response Shapes

```ts
type GeometryIssue = {
  code: string;
  fields: string[];
  bikeParts: string[];
  message: string;
};

type DesignConflict = {
  code: string;
  kind: "geometry" | "clearance" | "contact" | "reach" | "joint-limit";
  keyIndex: number | null;
  riderPart: string | null;
  bikePart: string | null;
  separation: number | null;
  message: string;
};

type DesignValidation = {
  geometry: BikeGeometryInspection;
  poseKeys: PoseKeyValidation[];
  canSolve: boolean;
  conflictCount: number;
  scenarioHash: string;
  modelVersion: string;
  solverVersion: string;
};
```

The shared schema defines complete landmark/member/shape and pose-resolution records from
`data-model.md`; unknown keys are rejected.

## Error Contract

| Code | Meaning | Retry behavior |
| --- | --- | --- |
| `unsupported-schema` | Scenario is not current or migratable | Do not retry unchanged |
| `invalid-bike-json` | Bike payload cannot be parsed | Correct draft |
| `geometry-invalid` | Inspection completed with blocking issues | Correct named fields |
| `invalid-baseline` | Pose resolver baseline is not valid | Refresh complete validation |
| `design-invalid` | Solve gate found geometry or pose conflicts | Return to Designer |
| `cancelled` | Request was superseded | Ignore |
| `core-unavailable` | Worker/WASM initialization failed | Use existing honest fallback/error flow |

Representative fixtures may exercise UI error states but may not invent valid physics or enable
Apply to Run when the core is unavailable.

## Compatibility and Versioning

- Worker commands and shared response schemas are additive within the app protocol, whose version
  must change.
- Scenario input must be migrated to v3 before reaching Rust.
- Existing v2 scenario files remain importable through deterministic migration.
- Existing run artifacts remain readable; because model/solver identity changes, reopening an older
  run follows the established stale-run regeneration policy.
- Scenario-level geometry is not repeated in each frame buffer. Frame layout remains v2 unless
  implementation chooses to record new per-frame mass telemetry, in which case it must version and
  test that layout separately.

## Determinism and Parity

For identical canonical JSON inputs:

- Repeated native calls return identical issue ordering, conflict ordering, accepted targets, and
  hashes.
- Browser WASM and native Rust agree within the existing float tolerance for landmarks, signed
  separation, CoG, inertia, and accepted targets.
- Cancellation timing may suppress a stale response but cannot change any completed response value.
