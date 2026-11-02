# Validation and Release Contract

## Purpose

This contract maps project mandates to evidence, executable gates, and release ownership. A check is
not complete because the UI looks plausible; measured, estimated, pending, and failed states remain
explicit.

## Quality Gate Matrix

| Gate | Source | Evidence | Automated check | Release requirement |
| --- | --- | --- | --- | --- |
| Newtonian model and assumptions documented | Constitution I | Model notes and equations | Rust equation/reference tests | Required |
| Coupled rider/bike system | Constitution II | Physics spike | Native + WASM articulated-body tests | Required |
| Inputs have units/ranges | Constitution III | Zod/JSON schema | Boundary and UI tests | Required |
| Inputs explain physical quantities | Constitution III / FR-021 | InputControlContract inventory | Inventory + component + Playwright assertions | Required |
| Force and source visibility | Constitution III | Metric fixtures | Unit + Playwright assertions | Required |
| Cross-platform deterministic runs | Constitution IV | Golden scenarios | Native/WASM/browser hash parity | Required |
| Serializable versioned runs | Constitution IV | Schema and manifests | Round-trip and migration tests | Required |
| Browser-based side-view 2D | Constitution V | Workbench implementation | Playwright workflow | Required |
| Wireframe layout/behavior | Constitution VI | Region mapping | Playwright DOM, a11y, screenshot, pixel checks | Required |
| Rendered HTML visual/interaction fidelity | Constitution VI / FR-023 | `ui_wireframes/rendered_html/` references | Reference screenshots, state checkpoints, and interaction parity | Required |
| Stable `data-od-id` values | Constitution VI | UI contract | Locator inventory test | Required |
| One primary action per screen | Wireframe system sheet | Route screenshots | Playwright role/style assertion | Required |
| Fixed-step/display separation | Constitution constraints | Run fixtures | Playback-rate invariance test | Required |
| Drag, friction, and unmodeled damping excluded | Constitution constraints / FR-020 | Physics-core invariants | Rust configuration and regression tests | Required |
| Offline after first load | FR-017 / SC-009 | PWA build | Multi-engine offline workflow | Required |
| Scenario import/export | FR-018 / SC-010 | Scenario schema | Round-trip, malformed, unsupported-version tests | Required |
| Solve under five seconds | FR-019 / SC-011 | Benchmark report | 20-run p95 benchmark | Required |
| Cancellation under 250 ms | SC-011 | Worker telemetry | Cancellation benchmark | Required |
| Control feedback under 100 ms and 60 FPS replay | SC-005 | Interaction/frame telemetry | Browser performance benchmark | Required |
| Browser matrix | FR-015 | CI + real-device report | Playwright engines and device projects | Required |
| No blank/clipped/overlapping stage | Constitution VI / SC-006 | Golden images and invariants | Screenshot + canvas pixel checks | Required |
| Accessibility alternatives | Constitution III/VI | DOM metrics and tables | axe + keyboard + role assertions | Required |
| Prototype mocks never become evidence | FR-023 | Source/evidence inventory | No reference scripts imported; all values trace to fixture or core source | Required |

## Test Layers

### Rust Physics Tests

- Unit: units, geometry, anthropometry, interpolation, forces, motor configuration, suspension, energy.
- Analytical: ballistic trajectory, constant acceleration, spring oscillator, pendulum where applicable.
- Convergence: repeated timestep halving with expected observed order.
- Regression: named golden scenarios for takeoff state, trajectory, angular motion, contact, and energy.
- Determinism: byte-identical native repetitions and canonical insertion-order checks.
- Exclusions: zero aerodynamic drag, tire/terrain friction, and unmodeled damping remain invariant.

### WASM Contract and Parity Tests

- Generated TypeScript declarations match the expected public signatures.
- Native and WASM result hashes match for every golden scenario.
- Worker envelopes and packed frame layouts reject malformed versions/offsets.
- Progress is monotonic and does not change output.
- Cancellation and forced termination never commit partial or stale output.

### TypeScript Unit and Integration Tests

- Zod schemas and migration chain for scenario files, persistence records, and worker messages.
- Store actions preserve immutable RunResult objects and one active baseline.
- Playback, stepping, and scrubbing use frame indices without accumulated time.
- Canvas painter consumes frames and camera state without invoking physics.
- Metric source rules render unavailable values as blank, never zero.
- Every editable spike control resolves its label, unit, range, physical quantity, and explanation from
  InputControlContract metadata.
- Dexie transactions preserve the current scenario on failed import or migration.

### Playwright Browser Projects

Fast CI matrix:

- Chromium
- Firefox
- WebKit
- Google Chrome stable channel
- Microsoft Edge stable channel
- iPad-like WebKit viewport/touch profile
- Android-tablet-like Chromium viewport/touch profile

Latest-two release matrix:

- Stable and previous stable Chrome, Edge, Firefox, and Safari.
- Current and previous supported iPadOS Safari.
- Current and previous supported Android Chrome.
- Because Playwright WebKit is not actual Safari, Safari/iPadOS checks run on real Apple environments.

### Visual and Canvas Assertions

At deterministic frame checkpoints (cold, approach, transition, takeoff, apex, landing, compared):

1. Capture the matching `ui_wireframes/rendered_html/` reference at the same viewport and state.
2. Assert semantic state, selected frame index, and badge values from validated fixture/core data.
3. Assert canvas dimensions equal CSS size multiplied by device-pixel ratio.
4. Sample bounded pixel regions to prove terrain, rider/bike, and requested vectors are nonblank.
5. Compare implementation and reference screenshots for framing, styling, overlap, clipping, and
  layout shift using reviewed tolerances.
6. Run at 1024, 1280, 1440, and 1920 desktop widths plus tablet profiles.
7. Disable motion or seek explicitly before screenshots; fixed sleeps alone are forbidden.

Prototype inline scripts may be executed only to reach a documented reference state. They MUST NOT be
imported by the implementation or used to prove physics, persistence, worker, offline, or accessibility
behavior.

## Offline Acceptance Flow

1. Load the production build online and wait for service-worker activation.
2. Create, edit, and locally save a scenario.
3. Reload with network offline.
4. Open each primary route.
5. Solve, observe progress, replay, scrub, and inspect metrics.
6. Export the scenario, delete the local copy, and import the file.
7. Confirm physical inputs and content hash match.
8. Attempt malformed and unsupported files; confirm the active scenario remains unchanged.

Run this flow in Chromium, Firefox, and WebKit. Inspect service-worker internals only in Chromium due
to Playwright limitations; the user-visible offline contract applies to every supported engine.

## Performance Acceptance

- Benchmark environment is recorded using `BenchmarkEnvironment` from the data model.
- Standard scenario is exactly the scenario defined in `research.md`.
- One warm-up followed by 20 measured solves.
- Solve p95 < 5 seconds.
- Cancellation p95 < 250 ms.
- Direct-control feedback p95 < 100 ms.
- Replay presents 60 frames/s without changing frame data or simulation hashes.
- At least 95% of direct spike-control interactions paint feedback within 100 ms; report frame pacing
  and dropped frames over the representative replay.
- Failed targets block approval or reopen the relevant decision; they are not averaged away.

## Dependency and Security Gates

- Lock npm and Cargo dependency graphs.
- Reject known critical vulnerabilities before release; document high-severity exceptions with owner
  and remediation deadline.
- Verify license inventory on every dependency update.
- Generate a software bill of materials for release artifacts.
- Serve production over HTTPS with no runtime third-party scripts required for core workflows.
- Treat imported files, IndexedDB records, worker messages, and WASM results as untrusted input.

## Decision Approval

The stack decision advances from `draft` to `provisionally-approved` only when the rubric, primary
evidence, hard-gate plan, risks, fallbacks, and maintainer approval are recorded. Spike implementation
MUST NOT begin before this transition.

The stack decision advances from `evidence-complete` to `approved` only when:

- Every hard gate passes.
- The physics and offline spikes pass.
- Required metrics are either measured or explicitly retained as pending.
- Benchmark targets pass on the recorded device.
- The project maintainer signs the DecisionRecord.
- An independent reviewer locates the selections, evidence, rejected alternatives, risks, and revisit
  triggers within 30 minutes and the observed duration is recorded.

Any later stack substitution creates a new DecisionRecord and reruns all affected gates.
