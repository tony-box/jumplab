# Research: Demoable Workbench UI

## Decision 1: Extend the Existing Web Application

**Decision**: Build the feature inside the existing `apps/web` React 19, TypeScript 7, and Vite 8 application. Promote the current stack-spike routes and shared components into durable feature modules rather than creating a second frontend or replacing the selected stack.

**Rationale**: The repository already has routing, state, worker orchestration, rendering, storage, observability, accessibility tests, and cross-browser validation. Reusing those boundaries minimizes migration work and preserves the architecture selected by feature 001.

**Alternatives considered**:

- Create a separate demo application: rejected because it would duplicate solver, schema, and test integration and leave future functional plumbing split across apps.
- Render the wireframe HTML directly: rejected because the rendered artifacts are non-functional visual references and cannot become application logic or evidence.
- Introduce another component framework: rejected because the current dependency set and local components cover the required controls without adding a competing design system.

## Decision 2: Organize by Product Feature with Shared Primitives

**Decision**: Keep one router-level application shell and organize pages under product-oriented modules for Workbench, Pose, Library, Report, and Validation. Move generally reusable spike components into a shared UI layer as they are adopted; keep domain-specific controls inside their owning feature.

**Rationale**: The five views share navigation, status, buttons, fields, segmented controls, tables, callouts, and accessibility behavior, while their stage, editing, report, and validation logic have distinct ownership. This structure avoids both one large page module and premature generalization.

**Alternatives considered**:

- Keep all work under `features/stack-spike`: rejected because the feature is becoming the usable application and should no longer be framed as temporary evaluation code.
- Build a comprehensive design-system package first: rejected because only proven shared primitives should be extracted during adoption.
- Put every control in a shared component directory: rejected because it would obscure domain ownership and couple unrelated views.

## Decision 3: Treat Wireframes as Executable UI Contracts

**Decision**: Preserve every required `data-od-id`, route, primary action, visible state, and responsive behavior from `ui_wireframes/`. Structural wireframe sheets govern behavior and data meaning; rendered prototypes govern visual presentation. Record the required region inventory and interaction rules as feature contracts.

**Rationale**: The project constitution names the wireframes as the UX authority and requires stable selectors for browser tests and design review.

**Alternatives considered**:

- Use component-generated IDs: rejected because refactors would destabilize acceptance selectors.
- Preserve only visual similarity: rejected because the wireframes also specify behavior, data sources, keyboard operation, and responsive states.
- Copy prototype scripts and calculations: rejected because prototype values and interactions are explicitly non-functional evidence.

## Decision 4: Use Capability-Gated Solver Integration

**Decision**: Route the designated Solve Run action through the existing worker controller and physics worker. Derive editable control availability from schema input contracts and declared solver capabilities. Supported controls update the scenario and mark the current result stale; unsupported physical controls remain visible but disabled or read-only with `awaiting core` status.

**Rationale**: This satisfies the clarified specification and the constitutional rule that physical controls cannot imply effects they do not have. It also lets later solver work activate an existing UI surface by extending capabilities rather than redesigning the page.

**Alternatives considered**:

- Make all controls drive synthetic calculations: rejected because representative animation cannot stand in for computed physics.
- Hide unsupported controls: rejected because the wireframe contract requires the complete product surface and future connection points.
- Require every control to be implemented in physics now: rejected because it expands this UI-focused feature into solver development.

## Decision 5: Separate Scenario Mutation from Run Computation

**Decision**: Scenario edits, including valid Pose Editor changes, update the active scenario immediately and mark any displayed run stale. They do not invoke the solver. Only Solve Run creates a new immutable run. Playback, scrubbing, overlays, resizing, camera changes, report selection, and baseline selection never invoke the solver.

**Rationale**: Explicit computation keeps authoring responsive, prevents accidental solver churn, and matches the clarified primary-action contract. Immutable frame arrays make replay deterministic and testable.

**Alternatives considered**:

- Solve on every input event: rejected because sliders and direct manipulation would trigger expensive, hard-to-cancel work and blur stale versus solved state.
- Debounce automatic solves: rejected because timing-dependent behavior weakens deterministic acceptance tests and still conflicts with the designated primary action.
- Mutate an existing run after edits: rejected because it breaks reproducibility and baseline integrity.

## Decision 6: Keep UI Continuity Session-Scoped

**Decision**: Hold active navigation and view state in Zustand and mirror only continuity fields needed across reloads to session-scoped browser storage. Do not add durable persistence requirements. Existing repositories may supply scenarios and runs already supported by the codebase, but this feature does not extend their retention contract.

**Rationale**: The specification explicitly scopes continuity to the session. Keeping transient selections separate from durable scenario/run repositories prevents accidental expansion into account, synchronization, retention, or migration work.

**Alternatives considered**:

- Store all UI state in IndexedDB: rejected because it would create durable behavior beyond the feature contract.
- Keep all state within page components: rejected because Library-to-Workbench-to-Pose-to-Report journeys require cross-route continuity.
- Encode all state in URLs: rejected because dense editor state is not suitable for route parameters and sharing is out of scope.

## Decision 7: Preserve Stale References In Place

**Decision**: When a remembered scenario, run, baseline, or selection is unavailable, retain its identifier and display label in the affected control as disabled. Disable dependent actions, show an inline explanation, and provide explicit clear or replace actions without changing unrelated session state.

**Rationale**: This is the clarified recovery behavior and makes data loss visible without blocking the rest of the application.

**Alternatives considered**:

- Silently reset the affected view: rejected because users would not understand why their context changed.
- Use blocking recovery dialogs: rejected because stale references are recoverable and should not interrupt unrelated work.
- Cascade-clear dependent state: rejected because the clarification requires unrelated state to remain intact.

## Decision 8: Snapshot Runs and Compare Conservatively

**Decision**: Each run stores an immutable validated scenario snapshot, solver and model metadata, metric definitions, source labels, and frame/telemetry data. Opening a historical run creates a distinct editable scenario working copy with provenance to the run. Numeric baseline deltas require matching scenario schema, physical-model assumptions, units, and metric definitions; solver-version differences are allowed only with a visible warning.

**Rationale**: Exact snapshots preserve reproducibility while editable copies support iteration. Explicit compatibility rules prevent misleading deltas while permitting deliberate comparisons across solver releases.

**Alternatives considered**:

- Reopen the latest scenario state: rejected because it may no longer reproduce the run.
- Make historical scenarios editable in place: rejected because edits would undermine run provenance.
- Compare any two numeric fields: rejected because matching units alone does not guarantee matching assumptions or definitions.

## Decision 9: Reuse Canvas 2D for Stages and SVG for Analytical Charts

**Decision**: Extend the existing DPR-aware Canvas 2D renderers for Workbench and Pose stages. Use existing D3 scale/shape utilities to produce accessible SVG report and validation charts with tabular equivalents. Rendering consumes immutable state and never drives or repairs physics.

**Rationale**: Canvas fits the animated side-view scenes and existing renderer. SVG fits read-only charts that need semantic labels, deterministic geometry, responsive sizing, print output, and accessible descriptions.

**Alternatives considered**:

- Use Canvas for every chart: rejected because accessible and printable analytical charts would require more parallel DOM work.
- Introduce a charting framework: rejected because existing D3 utilities can generate the four fixed chart types without a new runtime dependency.
- Use DOM/SVG for the animated stage: rejected because it would replace the current renderer without a user benefit.

## Decision 10: Use Deterministic Adapters for UI Tests, Not Product Claims

**Decision**: Keep injectable worker and data-provider boundaries so component and browser tests can use deterministic fixtures. Production run outcomes for editable physical controls come from the physics worker. Fixture outputs must be explicitly marked representative and cannot satisfy physics fidelity, parity, or validation gates.

**Rationale**: Deterministic adapters make loading, failure, unavailable, and visual states testable even when WASM build tooling is unavailable, while source labels preserve honesty.

**Alternatives considered**:

- Require live physics in every UI test: rejected because it makes state and visual tests slower and couples them to WASM tool availability.
- Treat fixture success as solver validation: rejected by the constitution and feature specification.
- Remove the existing fixture worker: rejected because it remains useful for controlled UI-state testing.

## Decision 11: Validate at Three Levels

**Decision**: Use Vitest and Testing Library for shared primitives, state transitions, selectors, compatibility rules, and provider adapters; contract tests for schema/worker/UI boundary data; and Playwright for each route's primary workflow, keyboard operation, desktop/tablet layouts, canvas pixels, SVG output, and stable screenshots. Keep Rust tests responsible for physical equations and solver fidelity.

**Rationale**: This separation gives fast behavior feedback while reserving real-browser evidence for interactions and rendering that DOM-only tests cannot establish.

**Alternatives considered**:

- Test everything through Playwright: rejected because failure diagnosis and state-edge coverage would be slow.
- Rely on snapshots alone: rejected because screenshots cannot prove accessibility state, source honesty, or synchronized playback.
- Add solver assertions to UI tests: rejected because solver correctness belongs to physics and parity suites.

## Decision 12: Preserve the Current Dependency Set

**Decision**: Use React Router for routes, Zustand for application/session state, Zod and `@bike-jumper/schema` for validation and domain contracts, Lucide for icons, D3 utilities for charts, and existing CSS tokens for visual implementation. Add no new production dependency during planning.

**Rationale**: Every required application capability has an established local solution. Avoiding dependency churn reduces bundle, security, and maintenance risk.

**Alternatives considered**:

- Add a general UI framework: rejected because matching the bespoke wireframes would require overriding it extensively.
- Add a chart framework: rejected because the chart set is fixed and existing D3 dependencies are sufficient.
- Add a form framework: rejected because controls are schema-driven and already use controlled React patterns.

## Resolved Unknowns

- **WASM build availability**: The local environment may lack `wasm-pack`; UI validation may use deterministic adapters, but physics/parity status must remain unavailable rather than fabricated. Existing checked-in packages may be consumed when current.
- **Report route identity**: The canonical route is `/report/:runId`; an absent or unavailable ID renders the defined stale/missing state rather than selecting an unrelated run silently.
- **Pose change lifecycle**: Valid edits apply immediately to the active scenario; Apply to Run is a navigation action and does not invoke physics.
- **Responsive scope**: Desktop and the configured tablet project are acceptance targets. Sub-1000px layouts preserve reading and recovery; dense authoring efficiency on narrow phones is not an acceptance target.
- **Storage scope**: This feature adds session continuity only and does not define cross-tab synchronization, cloud persistence, retention, collaboration, or sharing.
