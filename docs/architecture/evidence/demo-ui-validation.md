# Demo UI Validation Evidence

Generated on 2026-08-26 for feature `002-build-demo-ui` on Windows x64 with Node.js
24.14.1, npm 11.4.2, and Rust 1.98.0.

## Result

All repository-executable quickstart and aggregate verification gates passed. The local demo is
available at `http://127.0.0.1:4173/workbench` while the development server is running.

The machine-readable aggregate result is [quickstart-validation.json](quickstart-validation.json).
It records 20 passing gates and an `automated-pass` status. `npm run verify` completed successfully
after independently regenerating compatibility, benchmark, browser, security, and decision evidence.

## Command Evidence

| Command group                                          | Result                                      | Evidence                                                 |
| ------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------- |
| `npm install`                                          | Pass; dependency tree already up to date    | Final quickstart run                                     |
| `npm run typecheck`, `npm run check`                   | Pass                                        | Aggregate `static-checks`                                |
| `npm run build:physics`, `npm run build`               | Pass                                        | Native/WASM and production build gates                   |
| `npm run dev`                                          | Pass; Vite ready in 367 ms on port 4173     | Final local review server                                |
| `npm run test:unit`                                    | Pass; 28 files and 87 tests                 | Aggregate unit gate                                      |
| `npm run test:worker`, `npm run test:persistence`      | Pass; 3 and 5 tests                         | Contract and storage gates                               |
| `npm run test:physics`                                 | Pass; 11 native tests                       | Physics gate                                             |
| `npm run test:convergence`, `npm run test:determinism` | Pass                                        | Dedicated Cargo gates                                    |
| `npm run test:parity`                                  | Pass; 2 files and 4 tests                   | Native/WASM/browser parity gate                          |
| `npm run test:e2e`                                     | Pass; 42 workflows                          | Six-project browser matrix                               |
| `npm run test:a11y`                                    | Pass; 8 tests                               | Keyboard, focus, names, states, and Axe checks           |
| `npm run test:offline`                                 | Pass; 2 tests                               | Reload, corrupt session, and stale-reference recovery    |
| `npm run test:visual`                                  | Pass; 15 tests and 5 expected project skips | Durable view baselines                                   |
| `npm run benchmark:standard`                           | Pass                                        | [physics-spike.json](physics-spike.json)                 |
| `npm run benchmark:interaction`                        | Pass                                        | [browser-offline-spike.json](browser-offline-spike.json) |
| `npm run verify`                                       | Pass; all automated verification            | [quickstart-validation.json](quickstart-validation.json) |

## Browser And Viewport Matrix

The full workflow passed in Chromium, Firefox, WebKit, branded Chrome, branded Edge, and the
Playwright iPad Pro 11 WebKit project. Desktop projects use the Playwright desktop device presets at
1280 by 720 CSS pixels. The tablet project uses the iPad Pro 11 descriptor at 834 by 1194 CSS pixels
with touch enabled. The aggregate browser command ran 42 tests with one worker to avoid overloading
Windows browser software renderers.

Automated accessibility ran in desktop Chromium. Offline/service-worker reload evidence ran in
desktop Chromium. The detailed automated and external matrix is in
[browser-matrix.json](browser-matrix.json).

## Manual Journey Coverage

The quickstart journey is encoded as deterministic browser acceptance coverage rather than claimed
from visual inspection alone:

- Library search, clear, empty state, duplicate, and validated Workbench handoff.
- Workbench capability gating, explicit real solve, stale state, playback, overlays, camera, resize,
  baseline, and zero-solve presentation actions.
- Pose key selection/editing, constrained drag, immediate scenario updates, and Apply without solve.
- Report lookup, compatible/incompatible comparisons, source warning, CSV export, and exact-snapshot
  reopening.
- Validation analytical, convergence, determinism, pending, failure, and budget-exceeded states.
- Reload, corrupt-session isolation, missing-reference visibility, clear, and replace recovery.

These checks are implemented by the feature E2E suites, `tests/e2e/demo-journey.spec.ts`,
`tests/e2e/accessibility.spec.ts`, and `tests/offline/demo-session.spec.ts`. Source-honesty assertions
keep solver output, representative fixtures, estimates, and awaiting-core values visibly distinct.

## Physics And Performance

`wasm-pack` was available. The physics build and parity checks used freshly rebuilt artifacts and
passed across native Rust, Node WASM, Chromium, Firefox, and WebKit. No fixture result was substituted
for physics evidence. Generated-artifact drift comparison was unavailable because this workspace has
no Git metadata; build and artifact synchronization still completed.

| Metric                        |    Result |               Gate |
| ----------------------------- | --------: | -----------------: |
| Standard solve p95            |   55.5 ms | less than 5,000 ms |
| Cancellation p95              |    3.1 ms |   less than 250 ms |
| Input-to-paint p95            |   15.8 ms |     at most 100 ms |
| Replay rate                   | 59.88 fps |    at least 55 fps |
| Presentation solve dispatches |         0 |          exactly 0 |

The consolidated host, sample, provenance, and threshold data is in
[benchmark-results.json](benchmark-results.json).

## Screenshot Evidence

Fifteen active Windows baselines cover Workbench, Library, Pose, Report, and Validation in desktop
and tablet projects under `tests/visual/<view>.spec.ts-snapshots/`. Pixel and SVG assertions also
prove nonblank rendering, framing, accessible chart equivalents, internal table scrolling, and no
page-wide tablet overflow.

## Disclosures And External Gates

No constitutional exception or approved product deviation was required. Non-blocking tool warnings
remain visible: Vite reports a 575 kB minified application chunk, jsdom reports its expected missing
Canvas implementation during component tests, and Node reports `DEP0190` in existing shell-based
scripts. Real browser Canvas checks passed.

The following approval gates cannot be executed on this Windows host and remain explicitly open:

- Independent timed reviewer exercise and final maintainer sign-off.
- Safari stable and previous on real macOS hardware.
- Safari on a real iPadOS device.
- Chrome on a real Android device or approved device lab.

Playwright WebKit and the iPad Pro 11 emulation are automated compatibility evidence, not substitutes
for those real-device approvals. Feature acceptance remains subject to the external gates above.
