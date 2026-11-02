# Validation Matrix: Workbench Camera Modes

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Contract**: [camera-contract.md](camera-contract.md)

Maps every functional requirement and success criterion to the evidence that proves it. Every row must
have executable coverage before this feature is considered complete.

## Requirement coverage

| ID | Requirement | Evidence | Layer |
| -- | ----------- | -------- | ----- |
| FR-001 | Two camera modes exist | Mode control renders exactly Follow and Pan & Zoom | Vitest component |
| FR-002 | Resets to Follow on active scenario/run change while preserving zoom | Checkpoint reports `mode === "follow"`, cleared manual state, and unchanged `zoomFactor` on each identity transition | Vitest unit + Playwright |
| FR-003 | Follow tracks bike, left-of-center, terrain ahead | Bike x within 32–38% of view width across seeded frames; more world span ahead than behind | Vitest unit |
| FR-004 | Default zoom prioritizes model composition and shows takeoff when nearby | `modelHeightFraction` within `[0.28, 0.36]`, targeting `0.32`; distant lip does not widen view; nearby lip enters view | Vitest unit + Playwright |
| FR-005 | Framing adapts to jump geometry | Assertions repeated across short, standard, and maximum valid approach/scenario geometry | Vitest unit |
| FR-006 | Discoverable mode switch | Control present with accessible name; single interaction switches | Vitest component + Playwright a11y |
| FR-007 | Pan and zoom via drag, wheel/pinch, arrows, plus/minus | Each input path changes the view as specified | Playwright e2e |
| FR-008 | Pan & Zoom never auto-recenters | View identical before/after play, scrub, and pause | Playwright e2e |
| FR-009 | Zoom clamped to 0.5x-3x | Repeated zoom in/out saturates exactly at bounds | Vitest unit + Playwright |
| FR-010/FR-011 | Reset View is the only in-session zoom reset | Slider zoom survives mode changes, solve/run identity changes, playback, and scrubbing; Reset restores exactly 1x | Vitest + Playwright |
| FR-010 | Reset View available in both modes | Action present and enabled in Follow and Pan & Zoom | Vitest component |
| FR-011 | Reset returns to Follow at default zoom, current position | After reset: `mode === "follow"`, `zoomFactor === 1`, centred on current frame, not frame 0 | Playwright e2e |
| FR-012 | Camera never affects physics or run data | Solve dispatch count unchanged across camera interaction; run id and frame values unchanged | Vitest + Playwright |
| FR-013 | Mode continuously indicated | Stage badge text matches active mode after each transition | Vitest component + Playwright |

## Success criteria coverage

| ID | Criterion | Evidence | Layer |
| -- | --------- | -------- | ----- |
| SC-001 | Model occupies 28-36% of stage height on first render at desktop and tablet | Checkpoint assertion plus canvas pixel check and snapshots at both viewports | Playwright visual |
| SC-002 | Mode switch in one interaction | Single click/keypress toggles mode | Playwright e2e |
| SC-003 | Return to default Follow in one interaction | Single Reset View activation restores defaults | Playwright e2e |
| SC-004 | Pan & Zoom framing unchanged through playback in 100% of cases | View compared at multiple deterministic frame checkpoints | Playwright e2e |
| SC-005 | Default view keeps bike and terrain ahead visible without clipping across geometries | Multi-scenario framing assertions plus no-clipping pixel checks | Vitest unit + Playwright visual |
| SC-006 | Camera interaction meets responsiveness budget | Input-to-paint p95 <=100 ms, FPS >=55, zero dropped frames, zero presentation solver dispatches | Interaction benchmark |

## Edge case coverage

| Edge case | Evidence |
| --------- | -------- |
| Extreme approach, gap, lip height, or landing length | Unit assertions on min/max geometry keep model height at 28-36%, bike x at 32-38%, and no clipping without forcing distant lip visibility |
| Playback events during manual pan/zoom | View equality assertions across play, pause, scrub, and run completion |
| Zoomed out fully and panned away | Bike may leave the frame with no error thrown and no auto-recenter |
| Tablet viewport | Full e2e and visual suites run at the existing `tablet` Playwright project |
| Direct Follow to Pan & Zoom switch | Seeded view equals the last Follow view (framing continuity) |
| Legacy frames without landmarks | Fallback extent produces stable, finite framing across consecutive frames |
| Stage resize | World centre and `zoomFactor` preserved; no page-wide overflow |

## Constitution evidence

| Principle | Evidence |
| --------- | -------- |
| I. Physics fidelity | Camera is pure and solver-free; no visual repair of simulation state |
| III. Cause and effect | Camera readouts remain separate from measured physics output |
| IV. Determinism | Fixed checkpoints; identical inputs yield identical view rectangles; runs unaffected |
| V. Focused 2D | Side-view 2D preserved; interaction stays responsive with no added solver work |
| VI. Wireframes | `data-od-id` values preserved, keyboard and focus verified, canvas pixel checks and desktop/tablet snapshots, wireframe sources updated for the approved deviation |

## Commands

```powershell
npm run test:views      # camera math and component contracts
npm run test:ui         # shared UI control contracts
npm run test:e2e:views  # workbench camera workflows (desktop + tablet)
npm run test:a11y       # keyboard reachability and accessible names
npm run test:visual     # default framing, model scale, clipping checks
npm run benchmark:interaction # p95 latency, FPS, dropped frames, solve dispatches
npm run check           # typecheck, lint, format
```
