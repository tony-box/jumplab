# ADR-001: Application Stack

- Status: Accepted
- Date: 2026-08-24, revised for the two-body model

## Context

Jump Lab needs deterministic rigid-body physics that gives identical results natively and in every
browser, a responsive editing and playback UI, and offline use after first load.

## Decision

- **UI:** React 19, strict TypeScript, Vite, Canvas 2D for the stage and D3 SVG for charts.
- **Physics:** Rust with Rapier 2D (enhanced determinism), compiled to WebAssembly. The core owns
  every physical calculation: terrain, pose sampling and skeleton reconstruction, the two-body
  simulation, landing classification, metrics and the speed window.
- **Boundary:** a module Web Worker. The core reports its protocol, solver and layout versions at
  startup and the worker refuses to run a mismatched core. Zod validates every message in both
  directions, frame and telemetry buffers are transferred, and cancel terminates the worker.
- **State and storage:** Zustand for app state, Dexie (IndexedDB) for the working scenario and the
  newest 30 runs, and a generated service worker that precaches the app shell and the WASM.
- **Tests:** `cargo test` for physics acceptance, Vitest for contracts and UI, a parity suite that
  compares native, Node WASM and Chromium, Firefox and WebKit, and Playwright for browser and offline
  flows.

## Alternatives considered

- **Rapier from JavaScript:** viable, but splits physical preprocessing between JS and Rust and
  makes determinism harder to own.
- **Physics on the main thread:** a solve takes hundreds of milliseconds, which would freeze editing.

## Consequences

- Building requires the Rust GNU toolchain and wasm-pack in addition to Node.
- Any physics change must keep native and WASM results byte-identical; the parity suite enforces it.
- `apps/web` never computes physics. It draws, edits and stores what the core returns.
