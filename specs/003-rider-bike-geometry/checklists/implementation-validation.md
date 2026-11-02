# Implementation Validation Record: Coherent Rider and Bike Geometry

**Purpose**: Record the reviewed results of the commands in [quickstart.md](../quickstart.md) after implementing the feature.

**Date**: 2026-08-26

## Command Results

| Command | Result | Notes |
| ------- | ------ | ----- |
| `cargo test -p physics-core` | PASS | 14/14 tests (analytical, convergence, determinism, 11 regression incl. 5 new `pose_geometry` tests) |
| `cargo fmt --check -p physics-core` | PASS | After `cargo fmt` |
| `npm run build:physics` | PASS | wasm-pack succeeded; regenerated `crates/physics-core/pkg/` and `pkg-node/` |
| `npm run test:schema` | PASS | 3/3 |
| `vitest run --project schema-unit` | PASS | 12/12 files, 44/44 tests (includes new pose-sample/landmark schema tests) |
| `npm run test:worker` | PASS | 3/3 |
| `vitest run --project contracts` | PASS | included in schema-unit + contracts combined run: 44/44 |
| `npm run test:parity` | PASS | 4/4 (native, Node-WASM, Chromium, Firefox, WebKit all byte-identical) |
| `npm run test:determinism` | PASS | 1/1 |
| `npm run test:views` | PASS | 31/31 |
| `vitest run --project web-unit` | PASS | 13/13 files, 49/49 tests (includes new `bike-geometry.test.ts` and extended `pose-editor`/`workbench` tests) |
| `npm run test:e2e:views` (chromium + tablet) | PASS | 12/12 |
| `npm run test:visual` (visual + tablet) | PASS | 15/15 (5 skipped are cross-browser-skip guards, not failures) |
| `npm run test:a11y` | PASS | 9/9 (includes new elbow/schematic-disclosure accessible-text test) |
| `npm run benchmark:interaction` | PASS | `status: "pass"`, `presentationSolveDispatches: 0` — no render-time solve regression |
| `npm run typecheck` | PASS | web + schema |
| `npm run lint` | PASS | |
| `npm run format:check` | PASS | |
| `npm run check` | PASS | Combined gate |

## Fixed Regressions Found During Implementation

- **Elbow and knee joint-limit sign convention** (`tests/fixtures/scenarios/standard-v1.json`, `tests/fixtures/ui/demo-fixtures.ts`): bundled limits contradicted their authored flexion targets and the achieved geometric range, causing permanent saturation. Corrected under FR-021.
- **Native parity probe** (`crates/physics-core/src/bin/parity_probe.rs`) did not serialize the new `landmarks` field, causing a native-vs-WASM parity mismatch; fixed to match the WASM boundary in `lib.rs`.

## Known Limitations Discovered (Not Regressions)

- The `engine-webkit` Playwright project (desktop Safari device emulation, outside the `test:e2e:views`/`test:visual` required matrix) shows marginal solve-completion timing against the default 5-second `expect.poll` window. A standalone WebKit script (bypassing device emulation) confirmed the app, WASM, and solve pipeline function correctly; the `tablet` project (also WebKit-based) passes reliably. This is a pre-existing characteristic of the worker's three redundant `solve_scenario` WASM calls, not a rider/bike geometry defect, and is out of scope for this feature.
