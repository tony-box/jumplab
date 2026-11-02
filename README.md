# 2D MTB Jump Lab

A browser workbench for mountain bike jump mechanics. Shape a jump, author how the rider moves
through it, and see where and how the bike lands.

The rider's body position drives the bike. Rider and bike are separate bodies joined by a
force-limited actuator at the pedals and grips, so pumping a transition, popping off the lip, and
leaning in the air change the result the way they do on a real bike. A bounded "rider instinct"
makes small in-air corrections to level the bike for landing.

Physics runs in a deterministic Rust/Rapier core compiled to WebAssembly inside a Web Worker. React
and Canvas handle editing and playback.

## What you get

- **Workbench:** jump shape, landing, entry speed and rider settings; a stage with the solved
  trajectory and real velocity, contact-force, rider-push and torque overlays; a landing verdict
  (case, early, sweet spot, late, overshoot; balanced, nose- or tail-heavy; clean or crash); and
  takeoff, air, landing, rider and energy metrics. Edits mark the result stale until you solve again.
- **Designer:** bike geometry and the rider's pose keyframes along the run.
- **Library:** jump, rider, bike and movement presets with measured entry-speed windows.
- **Report:** run outputs, charts and CSV export.
- **Validation:** recorded reference checks against closed-form mechanics.

The working scenario is saved in the browser and restored on reload, scenarios can be exported and
imported as files, and the newest 30 runs are kept. The app works offline after the first load.

## Model scope

Tires are frictionless, suspension isn't simulated, and there's no air drag. See
[docs/physics/model.md](docs/physics/model.md) for the equations and
[docs/physics/limitations.md](docs/physics/limitations.md) for what the numbers do and don't mean.
Results are for learning, not for jump-design, equipment or safety decisions.

## Development

Prerequisites:

- Node.js 24 or newer
- Rust through rustup with the GNU toolchain on Windows (`stable-x86_64-pc-windows-gnu`) and the
  `wasm32-unknown-unknown` target
- wasm-pack 0.15

```powershell
npm ci
npm run build:physics   # native check plus web and Node WASM packages
npm run dev             # then open the URL Vite prints
```

## Tests

```powershell
cargo test -p physics-core --release   # physics acceptance, determinism, convergence
npx vitest run                         # schema, contracts, web units, parity, benchmark
npm run test:e2e                       # Playwright browser flows (run `npx playwright install` once)
npm run verify                         # everything, in order
```

`npm run benchmark:standard` measures WASM solve and cancel latency against fixed budgets
(1 s and 250 ms) and exits non-zero when a budget is missed.

## Layout

- `crates/physics-core`: Rust core (terrain, pose and skeleton, two-body simulation, landing
  outcome, metrics, speed window) and its tests.
- `packages/schema`: Zod schemas for scenarios, run results and the worker protocol, plus
  migrations.
- `apps/web`: the React app, worker boundary, rendering and storage.
- `docs`: physics model, limitations and architecture decisions.
