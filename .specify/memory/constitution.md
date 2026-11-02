<!--
Sync Impact Report
- Version change: 1.1.1 -> 2.0.0
- Modified principles:
  - III. Teach Through Visible Cause and Effect -> III. Teach Through Visible Cause and Effect
    (made the product-wide learning objective authoritative and removed mandatory repetition in
    every feature specification)
- Modified sections:
  - Development and Quality Gates
    (feature specifications no longer require an explicit learning-objective statement unless the
    feature introduces or changes an educational claim)
- Added principles: none
- Added sections: none
- Removed sections: none
- Follow-up TODOs: none
-->
# Bike Jumper Constitution

## Core Principles

### I. Physics Fidelity Is Verifiable

The simulation MUST derive motion from documented Newtonian mechanics and MUST expose every
material modeling assumption, unit, constraint, and deliberate omission. Jump geometry, gravity,
mass distribution, contact forces, rider inputs, suspension response, and airborne rotation MUST
use one coherent system of units and conservation rules. Approximations MUST be bounded, justified,
and covered by analytical or reference-case tests. Visual animation MUST represent simulation state
rather than drive or repair it. This makes educational claims inspectable instead of merely
plausible-looking.

### II. Rider and Bike Form One Dynamic System

The rider and bicycle MUST be modeled as coupled bodies whose posture and applied forces can change
over time. The model MUST support independently configurable legs or knees, hips, torso, and arms,
and MUST transmit their effects through contact points into the bike and jump surface. Bike geometry,
wheel size, rider dimensions, mass, frame type, and suspension configuration MUST affect the same
underlying solver rather than selecting canned trajectories. Features that cannot influence the
computed motion MUST NOT be presented as physical controls.

### III. Teach Through Visible Cause and Effect

Every editable input MUST have a clear unit, valid range, and explanation of what physical quantity
it controls. Users MUST be able to compare body-position strategies and optionally inspect relevant
force vectors, contact state, center of mass, velocity, and rotation throughout a run. The interface
MUST distinguish measured simulation output from coaching interpretation and MUST avoid claiming
that a simplified model guarantees real-world safety or technique mastery. The project-level
learning objective is inherent in this constitution: help users inspect cause and effect in 2D
bicycle-jump dynamics. Individual feature specifications MUST NOT be required to restate that
general objective. A feature-specific learning objective is required only when a feature introduces
or materially changes an educational claim. This keeps the tool useful without disguising its
limits or burdening every specification with redundant intent.

### IV. Simulations Are Deterministic and Reproducible

Identical scenario inputs, control timelines, solver versions, and time-step settings MUST produce
identical results within a documented numerical tolerance. A run MUST be serializable with its jump,
rider, bike, posture timeline, solver configuration, and model version. Physics defects MUST be
captured as minimal regression scenarios before correction. Reproducibility is required for credible
comparisons, instruction, and debugging.

### V. Focused 2D Experience

The core product MUST remain a browser-based, side-view 2D simulation unless evidence shows that an
additional dimension is required for a defined learning objective. Controls MUST prioritize rapid
editing, scrubbing, replay, overlay comparison, and readable visualization across supported desktop
and tablet viewports. New customization MUST earn its place by changing a meaningful physical input
or improving comprehension; ornamental realism MUST NOT compromise solver clarity or interaction
performance.

### VI. Wireframes Are the UX Contract

The files in `ui_wireframes/` MUST govern application structure, behavior contracts, component
boundaries, states, data bindings, accessibility, design tokens, and responsive behavior. The
interactive pages in `ui_wireframes/rendered_html/` MUST govern pixels, layout, styling, and
demonstrated interaction feel; when they conflict with a wireframe sheet, the rendered page governs
visual presentation and the sheet governs functional behavior and data meaning. Rendered pages are
non-functional design prototypes: their displayed values, local calculations, persistence, and
simulated interactions MUST NOT be treated as physics, application logic, or validation evidence.
Implementations MUST preserve specified `data-od-id` values so automated tests and design review can
target stable regions. Each screen MUST retain its designated primary action, and deviations from the
contract MUST be approved and documented before implementation. Playwright tests MUST verify
wireframe-defined workflows, interaction states, responsive layouts, and rendered behavior in a real
browser. Animations, canvas output, and charts MUST expose deterministic checkpoints so tests can
assert both application state and visible output rather than relying on elapsed wall-clock time alone.

## Simulation and Product Constraints

- The initial physics scope MUST exclude aerodynamic drag, tire friction, steering, and lateral
  motion. Any later inclusion requires a documented learning benefit and a validated model.
- Ground and ramp contact MUST enforce non-penetration and physically valid normal forces; contact
  MUST cease when the solver computes separation.
- Full-suspension, hardtail, and rigid bikes MUST be represented by explicit mechanical parameters.
  Presets MAY populate those parameters but MUST remain inspectable.
- Numerical integration method, fixed time step, tolerances, and stability limits MUST be documented.
  The solver MUST reject or flag configurations outside its validated operating range.
- The application MUST remain responsive during timeline editing and playback. Rendering frequency
  MAY adapt, but physics results MUST NOT change with display frame rate.
- Saved and shared scenarios MUST include a schema version and MUST validate before simulation.

## Development and Quality Gates

1. Each feature specification MUST identify affected physical quantities, assumptions, acceptance
  cases, and out-of-scope effects before implementation. It MUST identify a feature-specific
  learning objective only when the feature introduces or materially changes an educational claim;
  otherwise the project-level learning objective in Principle III governs without repetition.
2. Solver changes MUST include unit tests for equations and constraints, analytical reference cases,
   and regression scenarios for takeoff state, trajectory, angular motion, and energy behavior.
3. UI changes MUST be reviewed against the relevant `ui_wireframes/` screen and MUST test specified
   states, keyboard behavior, accessible names, responsive layout, stable region IDs, and data source
   honesty. Values unavailable from the physics core MUST remain visibly unavailable, never invented.
4. Playwright end-to-end tests MUST exercise each screen's primary workflow and every changed
  animation, chart, or canvas-bearing workflow at the supported desktop and tablet viewports. Tests
  MUST assert DOM and accessibility state plus rendered output through stable screenshots or canvas
  pixel checks. They MUST detect blank or incorrectly framed output, unintended overlap or clipping,
  layout shifts, and incorrect animation frames at deterministic checkpoints. Fixed sleeps MUST NOT
  be the sole synchronization mechanism.
5. Reviews MUST verify constitution compliance and explicitly justify new model complexity,
   dependencies, tolerances, and deviations from established physics or UX assumptions.
6. A release MUST publish the solver and scenario schema versions, known limitations, and validation
   results. A release MUST NOT describe visual similarity alone as physics validation.

## Governance

This constitution is the highest project-level authority for product and engineering decisions.
Specifications, plans, tasks, reviews, and releases MUST demonstrate compliance. An amendment MUST
include a written rationale, a Sync Impact Report, approval by the project maintainer, and migration
guidance when existing scenarios, solver behavior, or workflows are affected.

Constitution versions follow semantic versioning: MAJOR for incompatible principle removals or
redefinitions, MINOR for new principles or materially expanded governance, and PATCH for
non-semantic clarifications. Every feature review MUST include a constitution check; every release
review MUST confirm physics validation, reproducibility, wireframe conformance, a passing Playwright
UI suite, disclosed limitations, and scenario compatibility. Any approved exception MUST be
documented with its scope, owner, expiration condition, and remediation plan.

**Version**: 2.0.0 | **Ratified**: 2026-08-24 | **Last Amended**: 2026-08-26
