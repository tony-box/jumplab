# Quickstart: Validate the Selected Stack

This guide defines the executable proof expected after `/speckit-tasks` scaffolds the selected stack.
Commands are the required top-level script contract; implementation tasks must wire them to the
chosen tools.

## Prerequisites

- Node.js 24 LTS and npm
- Rust 1.98.0, pinned by `rust-toolchain.toml`
- `wasm32-unknown-unknown` Rust target
- `wasm-pack`
- Git
- A Chromium, Firefox, and WebKit browser bundle installed by Playwright

Install toolchain prerequisites:

```powershell
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --locked
npm ci
npx playwright install
```

## 1. Verify Static and Native Builds

```powershell
npm run check
npm run build:physics
npm run build
```

Expected:

- Strict TypeScript and Rust checks pass with no warnings promoted by project policy.
- The Rust physics crate builds natively and for WASM.
- Generated TypeScript bindings are present and have no uncommitted drift.
- Vite emits static assets containing the worker, WASM, manifest, and service worker.
- No runtime backend is required to serve the production output.

## 2. Run Unit, Analytical, and Convergence Tests

```powershell
npm run test:unit
npm run test:physics
npm run test:convergence
```

Expected:

- Scenario, worker-message, persistence, and metric schemas reject malformed fixtures.
- Analytical reference cases stay within documented tolerances.
- The convergence sweep reports its observed order and fails on deliberately coarse timesteps where
  expected.
- Golden regression scenarios pass for takeoff, trajectory, angular motion, contact, and energy.

## 3. Prove Native/WASM and Browser Determinism

```powershell
npm run test:parity
npm run test:determinism
```

Expected:

- Native and WASM result hashes match for every golden scenario.
- Repeated runs are byte-identical.
- Chromium, Firefox, and WebKit produce identical scenario and result hashes.
- Changing display playback rate or viewport size does not change stored frames.
- Test reports include solver version, model version, timestep, and scenario hash.

## 4. Run Worker Contract Tests

```powershell
npm run test:worker
```

Expected:

- Worker protocol fixtures validate against [worker-protocol.md](contracts/worker-protocol.md).
- Progress is monotonic and visible before a standard solve completes.
- Cancellation settles within 250 ms at p95.
- Stale results and malformed/truncated buffers never enter the run store.
- Worker failure clears current pending metrics and leaves completed immutable runs intact.

## 5. Run Scenario Persistence Tests

```powershell
npm run test:persistence
```

Expected:

- Scenario files conform to [scenario-file.schema.json](contracts/scenario-file.schema.json).
- Export/import round trips preserve every physical input and content hash.
- Supported migrations preserve physical meaning.
- Malformed and unsupported files leave the active scenario and IndexedDB unchanged.
- Local saves, runs, and preferences use their documented storage owners.

## 6. Run Browser, Accessibility, and Visual Tests

```powershell
npm run test:e2e
npm run test:visual
npm run test:a11y
```

Expected:

- Each representative spike workflow passes in Chromium, Firefox, WebKit, Chrome, Edge, and tablet
  profiles.
- Reference captures from `ui_wireframes/rendered_html/` and implementation captures use matching
  viewports and documented interaction states.
- Stable `data-od-id` regions match the wireframe inventories.
- Keyboard operation, focus visibility, accessible names, tables, and metric alternatives pass.
- Deterministic canvas checkpoints are nonblank and correctly framed.
- Pinned screenshots show no unintended clipping, overlap, horizontal scrolling, or layout shift.
- Visual baselines are generated and compared on one pinned CI image.
- Every displayed implementation value traces to a fixture or physics-core source; no prototype mock
  value or inline calculation is counted as feature evidence.

## 7. Prove Offline Operation

Build and serve the production output over localhost, then run the offline project:

```powershell
npm run build
npm run preview
npm run test:offline
```

Expected after the first online load:

- Both representative spike routes reopen without network access.
- Edit, local save, solve, progress, replay, scrub, export, and import work offline.
- Worker and WASM assets load from the application cache.
- No core workflow attempts a required network call.
- An available update prompts instead of replacing the active solver/model silently.

See the exact flow in [validation-matrix.md](contracts/validation-matrix.md).

## 8. Run the Standard Benchmark

```powershell
npm run benchmark:standard
```

Record the exact hardware, power mode, OS, browser, app build, and solver build. The benchmark performs
one warm-up and 20 measured solves of the standard scenario defined in [research.md](research.md).

Expected:

- Solve p95 is under 5 seconds on the baseline laptop class.
- Cancellation p95 is under 250 ms.
- Direct-control feedback p95 is under 100 ms.
- Replay presents 60 frames/s without changing simulation data.
- Results are written as machine-readable evidence for the DecisionRecord.

## 9. Start the Development Experience

```powershell
npm run dev
```

Open the URL printed by Vite. The bounded spike validates against the system, workbench, pose-editor,
and run-report sheets in `ui_wireframes/`, with the matching pages in
`ui_wireframes/rendered_html/` supplying the visual and demonstrated-interaction reference.
Scenario-library and validation prototypes remain references for later production feature
specifications. The rendered pages are for design comparison only and do not prove production
physics, persistence, workers, offline behavior, accessibility, or completeness.

## Release Gate

```powershell
npm run verify
```

`verify` MUST compose checks, native and WASM builds, all test layers, schema drift detection, license
and vulnerability checks, and production asset validation. The stack decision can be approved only
after provisional approval, the mandatory physics/offline spikes, interaction benchmark, timed review,
and final benchmark pass. Real Safari/iPadOS smoke tests remain required because Playwright WebKit is
not actual Safari.
