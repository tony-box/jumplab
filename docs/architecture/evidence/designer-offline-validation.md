# Designer Offline Route Evidence

- Observed: 2026-09-01
- Command: `npm.cmd run test:offline`
- Result: 3 tests passed

The production service worker precaches `/designer` and `/pose` navigation responses. Focused
Playwright coverage loaded Designer online, switched the browser context offline, reloaded the
canonical route, and verified the shared preview remained available. It then opened `/pose` while
still offline and verified replacement navigation to `/designer` with the Designer heading present.

The same focused run retained the existing offline session-corruption isolation and stale-reference
recovery coverage. No visual snapshots or benchmark artifacts were regenerated.
