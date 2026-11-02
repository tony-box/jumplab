# UI Region Contract

## Authority

1. Structural sheets in `ui_wireframes/` govern routes, regions, controls, data meaning, state, keyboard behavior, and responsive behavior.
2. Pages in `ui_wireframes/rendered_html/` govern visual presentation and demonstrated interaction feel.
3. When they conflict, rendered pages win for pixels and structural sheets win for behavior and data meaning.
4. Prototype calculations and displayed values are never application or physics evidence.

All IDs below are literal `data-od-id` values. They are public test/design contracts and must not be generated from component names.

## Shared Shell

Every product view includes:

- `topbar`
- `product-mark`
- `primary-nav`

The active navigation item has `aria-current="page"`. The topbar contains one solid primary action for the current view; secondary commands use non-primary styling.

| Route            | View             | Primary action               | Primary ID       |
| ---------------- | ---------------- | ---------------------------- | ---------------- |
| `/workbench`     | Workbench        | Solve run                    | `run-solve`      |
| `/designer`      | Designer         | Apply to run (navigate only) | `apply-clip`     |
| `/pose`          | Designer alias   | Replacement redirect         | `apply-clip`     |
| `/report/:runId` | Run Report       | Open in workbench            | `open-workbench` |
| `/library`       | Scenario Library | New scenario                 | `new-scenario`   |
| `/validation`    | Validation       | Run suite                    | `run-suite`      |

`/` and unknown routes redirect to `/workbench`. `/report` without an ID renders a missing-reference state or redirects only when an explicit current run is available; it never chooses an unrelated run silently.

## Workbench Regions

Required static IDs:

- Shell/status: `scenario-chip`, `core-status`, `run-solve`
- Inputs: `input-rail`, `panel-jump-shape`, `jump-kind`, `panel-jump-landing`, `panel-jump-entry`
- Stage: `stage-column`, `overlay-bar`, `overlay-chips`, `camera-mode`, `sim-canvas`, `stage-legend`
- Playback: `transport`, `play-toggle`, `playback-rate`, `pin-baseline`, `timeline-track`
- Metrics: `metrics-rail`, `baseline-card`, `metrics-takeoff`, `metrics-air`, `metrics-landing`, `metrics-energy`, `metrics-core-pending`, `core-detached-warning`

Behavior:

- Rider and bike configuration live exclusively in Designer; Workbench inputs edit jump and entry values only.
- Scenario edits mark the displayed result stale but never invoke a solve.
- Solve Run is the only action that invokes `SolverGateway.solve`.
- Playback, scrub, overlays, camera, resize, and baseline actions consume existing state only.
- Canvas badges, legend, and overlays remain within the stage bounds at every acceptance viewport.

## Designer Regions

Required Designer IDs:

- Shell/mode: `designer-page`, `designer-mode`
- Bike: `bike-geometry-rail`, `bike-derived-rail`
- Shared: `design-conflict-summary`, `designer-canvas`

Bike mode groups wheels/frame, fit, steering/fork, saddle/crank, cockpit, mass, and existing suspension controls. It has no distance track or bike keyframes. Bike values remain static when pose keys change. Invalid drafts remain visible but do not update the active scenario; one grouped conflict summary links to affected fields and pose keys.

Preserved Pose workflow aliases:

Required static IDs:

- Shell/status: `clip-name`, `saturation-pill`, `apply-clip`
- Keyframes: `keyframe-rail`, `add-keyframe`, `interp-mode`
- Stage: `pose-overlay-bar`, `reset-pose`, `pose-canvas`, `canvas-hint`, `distance-track`
- Joints: `joint-rail`, `joint-table`, `rom-table`

Behavior:

- The keyframe collection is a single-select listbox with arrow-key navigation.
- A clip always retains at least two strictly ordered keys.
- Valid edits immediately replace the active scenario PoseClip and mark its result stale.
- Invalid drag targets clamp to a valid constrained pose and expose the limitation; they never produce NaN/Infinity.
- `apply-clip` navigates to Workbench and does not solve.

## Run Report Regions

Required static IDs:

- Commands: `export-csv`, `open-workbench`
- Header/comparison: `report-header`, `run-compare`
- Results: `headline-stats`, `charts`, `metric-table`, `energy-table`, `energy-note`, `accuracy-bounds`
- Dynamic headline pattern: `stat-{metric-id}`

Behavior:

- The route run ID is authoritative.
- Missing/stale run and baseline references remain visible and disabled until explicitly cleared or replaced.
- Delta cells are blank for no baseline or incompatible metadata.
- Compatible cross-solver-version comparisons show deltas and a visible version warning.
- Every chart has an accessible label and equivalent table data.
- Open in Workbench clones the exact scenario snapshot into a distinct editable working copy.

## Scenario Library Regions

Required static IDs:

- Commands: `library-search`, `new-scenario`
- Navigation: `library-tabs`
- Views: `view-jumps`, `view-riders`, `view-bikes`, `view-moves`
- Guidance: `window-explainer`
- Dynamic card pattern: `jump-card-{preset-id}`

Behavior:

- `/` focuses search and Escape clears it when focus is not captured by another editor control.
- Search matches preset name, tags, and note; tab counts reflect the current query.
- No-result state names the query and offers clear and create actions.
- Speed-window absence is worded, never displayed as numeric zero or an empty bar.
- Load and Duplicate never mutate a preset.

## Validation Regions

Required static IDs:

- Commands: `timestep-select`, `run-suite`
- Summary: `suite-summary`
- Analytical: `sec-analytical`, `analytical-table`
- Convergence: `sec-convergence`, `convergence-table`, `convergence-note`
- Determinism: `sec-determinism`, `determinism-table`
- Pending: `sec-pending`, `pending-table`

Behavior:

- Running disables duplicate initiation and fills check rows deterministically.
- Summary counts reconcile exactly with final rows.
- Awaiting-core rows retain owner and blocked gate and never count as passing.
- Budget exceeded is a non-passing terminal suite status.

## Responsive Contract

- Desktop reference: three-column Workbench/Designer and document-width Library/Report/Validation.
- Rails may narrow at intermediate desktop widths but stage/chart content keeps `min-width: 0` and stable dimensions.
- Below 1000 CSS pixels, Workbench/Designer use the structural sheet's single-column or overlay reading order; no page-wide horizontal scroll.
- Report chart grid becomes one column below 900 CSS pixels.
- Configured iPad Pro 11 is the tablet acceptance viewport; interactive targets provide at least a 44 CSS pixel touch area.
- Narrow phone layouts remain readable but dense authoring efficiency is not an acceptance gate for this feature.

## Accessibility Contract

- Native controls are preferred; custom listbox/tab/group behavior includes the matching role and state.
- Focus-visible outline is present on light and dark surfaces.
- Status, loading, error, stale, saturation, and unavailable changes are announced without moving focus unexpectedly.
- Canvas has a concise accessible summary synchronized to the deterministic frame checkpoint.
- SVG charts use `role="img"`, a meaningful accessible name, and equivalent HTML data.
- Color is never the only carrier for delta direction, source, selected state, warning, or failure.

## Migration Rule

Existing `data-region` attributes may remain temporarily during migration, but acceptance tests target `data-od-id` and accessible roles. A product view is not complete until all IDs in its inventory exist in the correct state and hierarchy.
