# Physics Worker Protocol v1

## Purpose

This contract isolates the React application from the deterministic Rust/WASM physics kernel. All
messages are runtime-validated. Unknown protocol versions, message types, or fields are rejected.

## Transport

- One dedicated module worker per active physics-core instance.
- Structured clone for control messages.
- Transferable `ArrayBuffer` values for packed frame and telemetry data.
- UI state, DOM objects, Rapier handles, functions, and class instances never cross the boundary.
- The controller owns worker creation, termination, active `runId`, and stale-response rejection.

## Common Envelope

Every command and event contains:

| Field | Type | Rules |
| --- | --- | --- |
| `protocolVersion` | literal integer | `1` |
| `type` | string enum | One type defined below |
| `requestId` | UUID | Correlates command and event |

## Main Thread to Worker

### `init`

```ts
type InitCommand = {
  protocolVersion: 1;
  type: 'init';
  requestId: string;
  appVersion: string;
  expectedSolverVersion: string;
};
```

The worker MUST reject an app/solver incompatibility rather than run with mixed versions.

### `solve`

```ts
type SolveCommand = {
  protocolVersion: 1;
  type: 'solve';
  requestId: string;
  runId: string;
  scenario: Scenario;
};
```

Rules:

- `scenario` is normalized and validated again inside the WASM boundary.
- Only one solve runs in a worker instance.
- The kernel derives geometry, segments, and insertion order; the main thread does not send Rapier
  objects or precomputed platform-math values.

### `cancel`

```ts
type CancelCommand = {
  protocolVersion: 1;
  type: 'cancel';
  requestId: string;
  runId: string;
};
```

The worker checks cancellation between deterministic step batches. The controller terminates the
worker if cancellation is not acknowledged within 100 ms, then initializes a replacement. Worker
termination cannot alter a previously completed immutable run.

### `sample-pose`

```ts
type SamplePoseCommand = {
  protocolVersion: 1;
  type: 'sample-pose';
  requestId: string;
  poseClip: PoseClip;
  s: number;
  rider: RiderSpec;
  bike: BikeSpec;
};
```

The Rust kernel performs authoritative interpolation and derives the constrained arm pose. The UI
MUST NOT substitute a separately implemented interpolation result.

### `analyze-speed-window`

```ts
type AnalyzeSpeedWindowCommand = {
  protocolVersion: 1;
  type: 'analyze-speed-window';
  requestId: string;
  scenario: Scenario;
};
```

The Rust kernel returns a versioned entry-speed analysis or an explicit unavailable reason.

### `dispose`

```ts
type DisposeCommand = {
  protocolVersion: 1;
  type: 'dispose';
  requestId: string;
};
```

The worker releases its world and sends `disposed` before closing when possible. Forced termination
remains valid.

## Worker to Main Thread

### `ready`

```ts
type ReadyEvent = {
  protocolVersion: 1;
  type: 'ready';
  requestId: string;
  solverVersion: string;
  modelVersion: string;
  capabilities: {
    deterministic: true;
    ccd: boolean;
    contactImpulse: boolean;
    motorWork: boolean;
    jointTorque: boolean;
  };
};
```

Capabilities control metric availability. A false capability leaves the corresponding metric
`pending-core`; the UI never substitutes zero.

### `progress`

```ts
type ProgressEvent = {
  protocolVersion: 1;
  type: 'progress';
  requestId: string;
  runId: string;
  completedSteps: number;
  totalSteps: number;
  fraction: number;
};
```

Rules:

- `fraction` is monotonic from 0 through 1.
- Emit at least every 100 ms or 5 percentage points, whichever occurs first.
- Progress timing is observational and MUST NOT influence integration or output sampling.

### `result`

```ts
type ResultEvent = {
  protocolVersion: 1;
  type: 'result';
  requestId: string;
  runId: string;
  manifest: RunManifest;
  frameBuffer: ArrayBuffer;
  telemetryBuffer: ArrayBuffer;
};
```

`RunManifest` contains scenario/result hashes, solver/model versions, frame layout version, frame
count, output frequency, phase intervals, metrics, warnings, and typed-buffer offsets. The manifest
and buffers form one immutable RunResult.

The controller MUST discard the event unless `runId` equals the active run. It MUST validate buffer
lengths and offsets before creating typed views.

### `cancelled`

```ts
type CancelledEvent = {
  protocolVersion: 1;
  type: 'cancelled';
  requestId: string;
  runId: string;
};
```

No partial result is committed.

### `pose-sample`

```ts
type PoseSampleEvent = {
  protocolVersion: 1;
  type: 'pose-sample';
  requestId: string;
  sample: PoseSample;
};
```

### `speed-window`

```ts
type SpeedWindowEvent = {
  protocolVersion: 1;
  type: 'speed-window';
  requestId: string;
  window: EntrySpeedWindow;
};
```

### `error`

```ts
type ErrorEvent = {
  protocolVersion: 1;
  type: 'error';
  requestId: string;
  runId: string | null;
  code:
    | 'protocol_mismatch'
    | 'solver_version_mismatch'
    | 'invalid_scenario'
    | 'unsupported_schema'
    | 'core_init_failed'
    | 'numerical_instability'
    | 'buffer_layout_error'
    | 'internal_error';
  message: string;
  details: Record<string, string | number | boolean | null>;
  recoverable: boolean;
};
```

Error messages are user-safe. Stack traces remain development diagnostics and are not persisted in
scenario files.

### `disposed`

```ts
type DisposedEvent = {
  protocolVersion: 1;
  type: 'disposed';
  requestId: string;
};
```

## State and Concurrency Rules

1. Editing a scenario never sends a solve command automatically.
2. A solve command captures one immutable normalized scenario snapshot.
3. At most one worker result can be active for a `runId`.
4. A newer solve cancels or terminates the older worker before becoming active.
5. Progress, cancellation, and rendering clocks do not enter the deterministic state.
6. Worker or WASM failure clears current pending metrics and never displays stale results as current.
7. Replaying and scrubbing read transferred frames and never call the physics core.
8. Pose previews and entry-speed windows use Rust responses as their authoritative values.

## Compatibility

- Additive optional event fields require a protocol minor revision documented in generated bindings.
- Removing, renaming, or retyping fields requires a protocol major revision.
- App and worker protocol major versions MUST match.
- Frame-buffer layout has its own integer version and rejects unknown versions.
- Scenario schema migration occurs before `solve`; worker code does not migrate user files.

## Contract Tests

- Zod schemas accept every valid command/event fixture and reject unknown or malformed variants.
- Generated Rust/WASM TypeScript declarations remain signature-compatible with the TypeScript
  protocol definitions.
- Cancellation settles within 250 ms at p95, including forced termination.
- A stale result fixture never reaches the run store.
- Truncated and oversized buffers are rejected without out-of-bounds reads.
- Native and WASM kernels produce identical result hashes for golden scenarios.
- TypeScript fixtures and Rust/WASM produce matching PoseSample and EntrySpeedWindow payloads.
