# Quickstart: Validate Bike and Pose Designer

## Prerequisites

- Rust 1.98.0 with `wasm32-unknown-unknown`
- Node.js and npm matching the repository toolchain
- Dependencies installed from the repository root
- Ports 4173 and 4174 free before Playwright runs so an old server cannot hide current test hooks

## Build the Shared Contracts

```powershell
npm.cmd run build:physics
npm.cmd run build -w @bike-jumper/schema
npm.cmd run typecheck
```

Expected: browser and Node WASM packages contain the new geometry/design operations, scenario v3
types compile in schema and web workspaces, and no duplicate TypeScript geometry authority remains.

## Validate Schema and Migration

```powershell
npm.cmd run test:schema
npx.cmd vitest run --project web-unit apps/web/tests/integration/persistence.test.ts
```

Verify:

1. A v2 standard scenario migrates to v3 with explicit, closing bike geometry.
2. Pose targets and existing bike values are byte-equivalent before and after migration, excluding
   versioned additions.
3. Save, duplicate, scenario export/import, and reopen preserve the complete design and content hash.
4. Unknown future versions and invalid geometry field ranges fail honestly.

## Validate Geometry, Clearance, and Physics

```powershell
cargo test -p physics-core -- --test-threads=1
npm.cmd run test:parity
npm.cmd run test:worker
```

Verify the cases in [bike-geometry-contract.md](contracts/bike-geometry-contract.md):

1. Landmark equations close for rigid, hardtail, and full-suspension representative bikes.
2. Incoherent wheelbase/steering combinations report closure issues and never reach solve.
3. Rendering, pose contacts, protected shapes, CoG, and inertia come from one geometry result.
4. Boundary touch at `-0.001 m` tolerance passes; deeper overlap identifies both parts.
5. Pelvis/top-tube crossing fails; hand, foot, and inferred upper saddle contacts pass without
   allowing penetration.
6. Direct pose edits return the furthest valid target on the baseline-to-request path.
7. Bike changes report every invalid authored key without rewriting targets; interpolated states are
   not checked.
8. Total bike mass remains authored while geometry changes CoG/inertia and reproducibly affects run
   results.
9. Native/WASM outputs and repeated hashes meet parity and determinism tolerances.

## Validate Designer State and UI

```powershell
npx.cmd vitest run --project web-unit apps/web/tests/unit/designer-editor.test.tsx
npx.cmd vitest run --project web-unit apps/web/tests/unit/bike-geometry.test.ts
npm.cmd run test:persistence
```

Verify the states in [designer-ui-contract.md](contracts/designer-ui-contract.md):

1. Bike and Pose modes share one scenario and preview; bike mode has no timeline.
2. Invalid bike drafts remain editable and unapplied; stale worker responses are ignored.
3. Valid bikes apply atomically and revalidate all keys.
4. Pose conflicts disable Apply to Run and link to affected keyframes.
5. A constrained direct pose edit commits only the core-returned accepted target.

## Validate Browser Workflows

Confirm no stale process is listening before starting Playwright:

```powershell
Get-NetTCPConnection -LocalPort 4173,4174 -State Listen -ErrorAction SilentlyContinue
```

Stop any stale repository dev/preview server shown by that command, then run:

```powershell
npx.cmd playwright test tests/e2e/designer.spec.ts --project=engine-chromium --project=tablet --reporter=line
npx.cmd playwright test tests/e2e/accessibility.spec.ts --project=web-server --reporter=line
npx.cmd playwright test tests/visual/designer.spec.ts --project=visual --project=tablet --reporter=line
```

Verify:

1. `/designer` is canonical, `/pose` redirects, and navigation/accessibility names say Designer.
2. Manual dimension edits redraw the actual canonical bike and expose units/ranges.
3. Conflict focus, keyboard mode switching, keyframe navigation, and numeric inputs work without
   stealing one another's keys.
4. Desktop and tablet have no clipping, overlap, horizontal page scroll, blank canvas, or layout
   shift.
5. Canvas checkpoints and screenshots show the expected geometry, contact, and invalid-state
   overlays.

After intentional visual baseline updates, update the pinned snapshot digests and rerun parity/unit
tests so visual evidence and upgrade gates agree.

## Final Gates

```powershell
npm.cmd run benchmark:interaction
npm.cmd run check
npm.cmd run verify
```

Expected: at least 95% of preview/validation updates complete within 100 ms, playback retains its
existing frame budget, all generated evidence is formatted, model limitations disclose representative
mass/envelope assumptions, and scenario/model/solver versions are published consistently.
