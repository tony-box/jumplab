# 2D MTB Jump Lab

A browser-based 2D mountain bike jump mechanics workbench. React and Canvas provide the editing and playback interface; a deterministic Rust/Rapier core runs in WebAssembly inside a Web Worker.

## Selected stack

- React 19, strict TypeScript 7, Vite 8, Canvas 2D, and D3 SVG charts.
- Rust 1.98 with Rapier 2D 0.35.2 compiled to WASM and isolated behind a versioned worker protocol.
- Zod boundary validation, Zustand state, Dexie persistence, and a generated service worker.
- Vitest and Playwright for contracts, parity, browser, offline, accessibility, and visual evidence.

The five product views form a complete browser workflow, but the underlying physics model remains a
bounded validation milestone rather than a production bicycle dynamics model. See
[docs/physics/limitations.md](docs/physics/limitations.md).

## Spike results

- Native, Node-WASM, Chromium, Firefox, and Playwright WebKit parity passes.
- Standard solve p95 is approximately 73 ms against a 5,000 ms gate.
- Chromium interaction p95 is approximately 16 ms with approximately 60 FPS replay.
- Production service-worker reload, edit/save/solve/replay/export/import, accessibility, and visual
  checks pass offline.
- Real Safari, iPadOS Safari, and Android Chrome remain external manual release gates; Playwright
  WebKit is not represented as Safari.

## Current implementation

- Versioned jump, rider, measured bike geometry, pose-keyframe, and solver scenario contract.
- Fixed-step Rapier two-wheel contact simulation with configurable validated solve/output rates.
- Deterministic repeat-run, schema rejection, and analytical trajectory tests.
- Designer workflow for static measured bike geometry and clearance-gated rider pose keyframes.
- Animated side-view Canvas with trajectory, gravity, velocity, and pinned baseline overlays.
- Wireframe-driven product shell with Workbench, Designer, Report, Library, and Validation views.
- Explicit edit -> dirty -> solve workflow; playback and overlay changes never re-enter physics.
- Fixed desktop workbench with slide-over mobile rails, validated with Playwright pixel and overflow checks.

## Product views

- **Workbench:** scenario inputs, dark instrument stage, exact-frame transport, grouped metrics, and pinned comparisons.
- **Designer:** scenario-level bicycle geometry plus distance-relative pose keyframe authoring.
- **Report:** source-labelled run outputs and trajectory charts.
- **Library:** reusable jump, rider, bike, and movement presets.
- **Validation:** live browser checks against closed-form ballistic mechanics.

The current model resolves deterministic two-wheel terrain contact and applies representative
geometry-dependent bike/rider CoG and planar inertia. Suspension bodies, traction, and rider-applied
forces remain excluded, and the interface labels this boundary directly.

## Versions and evidence scope

- Scenario schema 3, worker protocol 3, frame layout 2, and persistence format 2.
- Geometry model 1 and mass-distribution model 1; model
  `rigid-two-wheel-contact-v4-geometry-v1-mass-distribution-v1`; solver
  `rapier-0.35.2-two-wheel-contact-v5-geometry-v1-mass-distribution-v1`.
- `/designer` is canonical. `/pose` remains an offline-capable replacement redirect for existing
  bookmarks.
- Workbench runs are solver-produced. Validation rows marked `representative-fixture` demonstrate UI
  readiness and do not satisfy native/WASM physics parity gates.
- Aerodynamic drag, tire deformation, coupled suspension bodies, and rider motor forces are excluded.
- Real Safari, iPadOS Safari, Android Chrome, timed reviewer completion, and final maintainer approval
  remain external release gates.

## Development

Prerequisites:

- Node.js 24 or newer
- Rustup with the repository-pinned GNU toolchain
- `wasm-bindgen-cli` 0.2.127
- A GNU linker such as WinLibs on Windows

```powershell
npm ci
npm run build:physics
npm run build
npm run dev
```

Open the URL printed by Vite.

## Verification

```powershell
npm run verify
```

The verifier composes static checks, native/WASM builds, contracts, physics, parity, browser/offline,
visual, accessibility, benchmark, compatibility, and security evidence.

Playwright requires Chromium once per machine:

```powershell
npx playwright install
```

See [docs/physics/model.md](docs/physics/model.md) for equations, units, tolerances, and model scope.
