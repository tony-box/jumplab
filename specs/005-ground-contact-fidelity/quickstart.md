# Quickstart: Validating Ground Contact Fidelity

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Runnable validation proving the bike respects the ground. Contract details live in
[contracts/](contracts/); entity definitions live in [data-model.md](data-model.md).

## Prerequisites

- Rust toolchain per `rust-toolchain.toml` with the `wasm32-unknown-unknown` target
- Node dependencies installed (`npm install`)
- On Windows, invoke `npm.cmd` / `npx.cmd` in scripted runs
- No process already listening on ports 4173 or 4174 before Playwright runs:

```powershell
Get-NetTCPConnection -LocalPort 4173,4174 -State Listen
```

A stale preview server started without `VITE_TEST_HOOKS=1` is reused by Playwright and makes
`window.__BIKE_JUMPER_TEST__` undefined, producing false "blank canvas" failures.

## Setup

```powershell
npm.cmd run build:physics
```

Rebuilds the WebAssembly bindings. Required after any change under `crates/physics-core/`, and
required before the parity, contract, and browser suites.

## Validation 1 — Contact constraint holds (SC-001, SC-002)

```powershell
cargo test -p physics-core
```

**Expected**: Passes for every entry in the canonical ground-contact manifest. Each scenario starts
with both wheels over the approach, `minClearance >= -0.01` at every frame, no collider spans an
intentional gap, normal forces are never negative, grounded frames exceed
`CONTACT_IMPULSE_EPSILON`, airborne support fields are normalized to zero, and every canonical run
finishes grounded.

## Validation 2 — Analytical reference cases (Principle I)

```powershell
cargo test -p physics-core --test analytical
```

**Expected**: Passes.

- _Resting equilibrium_: a bike placed on flat ground stays at constant height, and the summed normal
  force equals total weight within tolerance.
- _Ballistic separation_: once both wheels separate, vertical motion matches the closed-form
  projectile solution within the documented tolerance.
- _Angular response_: pitch matches a constant slope, remains stable through the lip crest, and
  airborne rotation is deterministic.
- _Energy accounting_: the bounded residual is checked after including work supplied by the
  horizontal-speed constraint and contact:

  ```text
  E(t + dt) - E(t) = W_speed_constraint + W_contact + residual
  ```

## Validation 3 — Determinism and reproducibility (SC-005)

```powershell
cargo test -p physics-core --test determinism
cargo test -p physics-core --test convergence
```

**Expected**: Passes. Golden hashes are regenerated exactly once when the solver version is bumped;
after that they must remain stable across repeated runs.

## Validation 4 — Terrain is a single source of truth (FR-006)

```powershell
npm.cmd run test:parity
npm.cmd run test:worker
```

**Expected**: Native and WebAssembly `terrainProfileJson` segmented outputs match byte for byte,
repeated calls are identical, approach coverage includes the initial rear wheel, gaps contain no
phantom edge, and the worker advertises protocol/frame-layout version 2 with `strideFloat32: 36` and
the five contact fields.

## Validation 5 — Legacy runs regenerate in place (FR-015, SC-008)

```powershell
npm.cmd run test:persistence
```

**Expected**: Dexie schema version 3 preserves the existing version-2 upgrade. A stored run with an
older solver version is regenerated in place with `runId` and `createdAt` preserved; reopening it
performs no second re-solve. Original-schema hashes are verified before registered scenario
migration. Missing, invalid, corrupt-stride, hash-mismatched, and transaction-failure cases leave the
stored record intact, report the failure, and never replay the legacy solution.

## Validation 6 — The rendered bike sits on the rendered ground (SC-003, SC-006)

```powershell
npm.cmd run test:e2e:views
npm.cmd run test:visual
```

**Expected**: At desktop and tablet viewports, deterministic last-airborne and first-grounded
checkpoints confirm that each terrain segment matches solver output, no line spans a gap, no grounded
wheel falls more than 2 px below its segment, and touchdown is identifiable from the animation.
Checks also assert stable region IDs, accessible states, nonblank and correctly framed canvas output,
and no overlap, clipping, page overflow, or layout shift.

Snapshot baselines change once in this feature because both the terrain and the bike anchor move.
Refresh them deliberately and review the images:

```powershell
npm.cmd run test:visual -- --update-snapshots
```

The ground-contact assertions, not the images, are the real gate.

## Validation 7 — Manual inspection

```powershell
npm.cmd run build
npm.cmd run preview
```

Open `/workbench`, load a table-top scenario and a gap scenario, and play each run.

**Expected**: wheels track the approach, follow the curved lip, leave the ground only at the lip,
touch down on the landing face, and roll out on the surface. Nothing sinks below the ground line.

If a live-reloaded page still shows stale behaviour, the Workbox service worker may be serving cached
fixtures. Unregister service workers and clear Cache Storage, then reload:

```js
(await navigator.serviceWorker.getRegistrations()).forEach((r) => r.unregister());
(await caches.keys()).forEach((k) => caches.delete(k));
```

## Full Gate

```powershell
npm.cmd run verify
```

Runs build, checks, unit, physics, and parity suites and regenerates evidence JSON. Per repository
convention, run Prettier over the regenerated evidence files before the final `npm run check`.

## Numerical Tuning Aid

To iterate on contact behaviour without a browser:

```powershell
cargo run -p physics-core --bin parity_probe -- <scenario.json>
```

Prints sampled per-frame state for a scenario file, useful for inspecting clearance and normal-force
values while tuning.
