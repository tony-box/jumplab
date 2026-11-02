# Implementation Plan: Workbench Camera Modes

**Branch**: `004-workbench-camera-modes` | **Date**: 2026-08-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-workbench-camera-modes/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Replace the Workbench stage's fixed full-scenario framing with an explicit camera model. A pure,
testable camera module derives a world-space view rectangle from the scenario, the current frame, and
session-scoped camera state. Follow mode keeps the bike left-of-center with terrain ahead and sizes the
view so the rider-and-bike model occupies 28–36% of stage height, targeting 32%; Pan & Zoom mode holds a user-controlled
offset and zoom factor bounded to 0.5×–3× of the Follow zoom, driven by pointer drag, wheel/pinch, arrow
keys, and plus/minus keys. A Reset View action returns to Follow at the default zoom centred on the current
frame. The camera consumes solver output only and never feeds back into physics or run artifacts. Unit tests
cover the camera math, component tests cover the controls, and Playwright checkpoints plus canvas pixel
checks verify framing at desktop and tablet viewports.

## Technical Context

**Language/Version**: TypeScript 7.0.2, React 19.2.8

**Primary Dependencies**: Existing React Router 8.3.0, Zustand 5.0.15, `@bike-jumper/schema`, Canvas 2D
viewport utilities (`apps/web/src/rendering/canvas/viewport.ts`), Lucide React 0.554.0. No new dependency.

**Storage**: Session-scoped Zustand `session.view` state only; no Dexie persistence, schema change, or migration

**Testing**: Vitest unit/component tests, Playwright browser, accessibility, and visual tests with canvas pixel checks

**Target Platform**: Offline-capable modern desktop and tablet browsers

**Project Type**: Monorepo browser application with shared TypeScript schemas and a Rust/WebAssembly physics core

**Performance Goals**: Camera evaluation is pure arithmetic over a constant number of points; repeated
camera interactions maintain input-to-paint p95 at or below 100 ms, at least 55 FPS, zero dropped frames
in the standard interaction benchmark, and zero presentation-triggered solver dispatches

**Constraints**: Display-only concern with no physics, frame, or run-artifact mutation; deterministic and finite
view rectangles; zoom clamped to 0.5×–3× of the Follow zoom; model occupies 28–36% of stage height and sits
32–38% from the left edge at default zoom; model scale/position take precedence over distant takeoff
visibility; keyboard-operable controls with visible focus on the dark stage; no page-wide overflow or stage
clipping at supported desktop and tablet viewports

**Scale/Scope**: One new pure camera module, one Canvas stage integration, one session state slice, one toolbar
control group (mode switch plus Reset View), and three camera behaviours (Follow, Pan & Zoom, Reset)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

| Principle / Gate | Plan Evidence | Status |
| ---------------- | ------------- | ------ |
| I. Physics fidelity is verifiable | The camera reads solver-produced frame state and scenario geometry to compute a view rectangle. It performs no integration and cannot alter, repair, or substitute simulation state. Framing math, units (metres to CSS pixels), and clamping rules are documented and unit-tested. | PASS |
| II. Rider and bike form one dynamic system | Framing derives from the rider-and-bike extent already produced by the coupled model, so posture and geometry changes naturally change the framed bounds. No camera value is presented as a physical control. | PASS |
| III. Teach through visible cause and effect | Larger default framing makes posture, contacts, and overlays legible. The mode indicator and zoom readout describe view state only and are never mixed with measured physics output. | PASS |
| IV. Deterministic and reproducible | Camera state is pure display state excluded from run artifacts, so identical inputs still yield identical runs. For a given frame, scenario, camera state, and stage size the view rectangle is deterministic, enabling fixed Playwright checkpoints. | PASS |
| V. Focused 2D experience | Remains side-view 2D. Camera work improves readability and scrubbing/replay comprehension rather than adding ornamental realism. | PASS |
| VI. Wireframes are the UX contract | Reuses the existing `camera-mode` region and stage structure, preserves the screen's primary action, keeps controls keyboard reachable, and adds deterministic canvas checkpoints. **Deviation**: the mode set, zoom control, and persistence differ from the wireframe — see Complexity Tracking. | PASS (with documented deviation) |
| Development quality gates | Pure camera math gets unit tests; controls get component and accessibility tests; framing gets Playwright canvas pixel checks and desktop/tablet snapshots asserting no clipping and correct model scale. | PASS |

### Documented Deviation from the Wireframe Contract

`ui_wireframes/workbench.html` (region 12) and `ui_wireframes/rendered_html/workbench.html` specify three
camera modes (Fit / Follow / Lip), plus/minus zoom buttons with a px/m readout, and persistence of mode and
scale to `jumplab.workbench`. This feature deliberately supersedes that contract. Principle VI requires such
deviations to be approved and documented before implementation; the approval and rationale are recorded in
Complexity Tracking below, and the wireframe sources must be updated during implementation so the contract
and the product do not silently diverge.

## Project Structure

### Documentation (this feature)

```text
specs/004-workbench-camera-modes/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── checklists/
│   └── requirements.md  # Spec quality checklist (/speckit-specify output)
├── contracts/
│   ├── camera-contract.md
│   └── validation-matrix.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/web/src/
├── features/workbench/
│   ├── useWorkbench.ts               # Replaces the local cameraMode string with camera state and actions
│   ├── WorkbenchPage.tsx             # Mode segmented control, Reset View action, zoom readout
│   └── WorkbenchStage.tsx            # Pointer, wheel, and keyboard camera interaction on the stage
├── rendering/canvas/
│   ├── camera.ts                     # NEW: pure Follow/Pan & Zoom view-rectangle derivation and clamping
│   ├── viewport.ts                   # Existing world-to-CSS mapping, driven by camera-supplied bounds
│   └── workbench-stage.ts            # Consumes camera bounds instead of full-scenario bounds
├── state/store.ts                    # Session-scoped camera view state (no persistence)
└── test-hooks.ts                     # Deterministic camera checkpoint for Playwright

apps/web/tests/
├── unit/                             # Camera math and control component contracts
└── component/                        # Toolbar and stage interaction wiring

tests/
├── e2e/
│   ├── workbench.spec.ts             # Mode switching, pan/zoom, keyboard, Reset View
│   └── accessibility.spec.ts         # Keyboard reachability and accessible names
└── visual/
    └── workbench.spec.ts             # Default framing, model scale, no clipping at desktop and tablet

ui_wireframes/
├── workbench.html                    # Update region 12 contract to the approved camera model
└── rendered_html/workbench.html      # Update rendered camera controls to match
```

**Structure Decision**: Keep the existing web monorepo boundaries and add one pure module,
`apps/web/src/rendering/canvas/camera.ts`, that owns all framing math. `viewport.ts` stays a generic
world-to-CSS mapper and simply receives camera-derived bounds, so `workbench-stage.ts` loses its hardcoded
full-scenario framing without absorbing camera policy. Interaction handlers live in the feature layer
(`WorkbenchStage.tsx`), state lives in the existing session slice, and no Rust, schema, or persistence
boundary is touched.

### Post-Design Gate

Phase 1 keeps every pre-research gate passing. The data model isolates camera state as session-scoped display
state, explicitly excluded from run artifacts and physics inputs. The contracts forbid solver dispatch during
camera interaction, forbid camera-driven mutation of frames, define the exact Follow composition, default-zoom
sizing rule, and zoom clamp, and require deterministic browser evidence at desktop and tablet sizes. No
dependency, persistence migration, or new physical control is introduced. The single wireframe deviation
remains documented and is resolved by updating the wireframe sources during implementation.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| Camera mode set changed from Fit / Follow / Lip to Follow / Pan & Zoom (wireframe region 12) | The wireframe's default Fit framing is the defect being fixed: it frames lip to landing plus approach and rollout, leaving the model too small to study. Follow-by-default with a free Pan & Zoom mode covers the Fit and Lip use cases through one general manual mode, and was explicitly requested and clarified by the maintainer. | Keeping three fixed modes retains the unusable default and still offers no free inspection; adding Pan & Zoom as a fourth mode crowds a toolbar the wireframe already flags as an overflow trap. |
| Camera state is session-only instead of persisted to `jumplab.workbench` | A stale persisted zoom or pan can restore the same "cannot see the model" state on the next visit and would silently defeat the fix. Session-only state guarantees every visit starts from a known-good Follow view and keeps Reset View predictable. | Persisting mode and scale reintroduces the failure mode across reloads and adds migration and staleness handling for purely cosmetic benefit. |
| Zoom expressed as a bounded factor (0.5x to 3x) of the default Follow zoom rather than an absolute px/m readout with plus/minus buttons | A relative factor preserves the guarantee that the model occupies 28-36% of stage height across viewport sizes and scenario geometries, which an absolute px/m scale cannot maintain on tablet. | Absolute px/m bounds valid on desktop produce clipped or tiny models at tablet width, making the measurable default-zoom criterion (SC-001) untestable across viewports. |
