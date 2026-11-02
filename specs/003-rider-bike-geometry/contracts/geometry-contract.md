# Shared Rider and Bicycle Geometry Contract

## Purpose

Define the internal contract that keeps Pose and Workbench geometry identical, deterministic, source-honest, and independent of Canvas implementation details.

## Ownership Boundaries

- Physics core owns pose interpolation, all joint clamping, pedal-anchored leg kinematics, handlebar-constrained shoulder/elbow reach, achieved rider/contact landmarks, and constraint status.
- Run frame layout owns immutable sampled pose transport for replay.
- Shared web geometry adapters own deterministic conversion from returned landmarks to drawing paths plus representative non-contact bicycle landmarks.
- Canvas stages own styling, layering, viewport transforms, and drawing only.
- Renderers must not invoke the solver, interpolate movement, clamp joint values, change segment lengths, or move contacts to conceal invalid state.

## Coordinate Contract

- Geometry uses meters.
- Positive x points toward the bicycle front.
- Positive y points upward.
- Bike-local origin and axle reference are identical for Pose and Workbench.
- Workbench applies one rigid transform from bike-local coordinates using frame `x`, `y`, and `pitch`.
- Viewport scale, device-pixel ratio, and far-limb visual separation do not change logical geometry.

## Input Contract

### Bicycle geometry builder

Requires a validated `BikeSpec` and optional supported measured bike state.

Must derive:

- Wheel radius and axle separation from `wheelSize` and `wheelbase`.
- Bottom bracket from rear axle, `chainstay`, and `bbHeight`.
- Connected frame, fork, steering, crank, pedals, seat support, saddle, and handlebar landmarks.
- Rigid, hardtail, or full-suspension topology from `frameType`.
- Deterministic representative proportions for unspecified dimensions.

Must not:

- Treat representative saddle, bar, tube, or crank proportions as measured setup.
- Animate suspension compression without corresponding measured frame state.
- Add or expose editable physical controls for representative proportions.

### Rider geometry adapter

Requires:

- One complete physics-returned target set: ankle, knee, hip, spine, shoulder, elbow.
- Physics-returned logical rider landmarks, handlebar/pedal contacts, and constraint status.

Must provide to drawing:

- Connected head, torso, pelvis, paired arm, and paired leg paths from one logical skeleton.
- One shared logical pose for both arm and leg pairs.
- Optional visual-only far-pair separation that preserves logical hand and foot contacts.

Must not:

- Accept an authored elbow target.
- Create independent near/far limb state.
- Recompute, clamp, or repair logical human kinematics.
- Silently substitute neutral values for missing run-frame fields.

## Output Contract

The builders return immutable `RenderGeometry` with:

- Named `BikeLandmarks` and `RiderLandmarks`.
- Explicit paths or segment endpoint pairs for frame tubes and body segments.
- `LandmarkSource` classification for measured, calculated, representative, and unavailable groups.
- Constraint status and reason.
- No Canvas coordinates, colors, line widths, DOM references, or mutable state.

## Deterministic Proportion Registry

All representative bicycle and display-only rider proportions must be defined once in a named registry next to the geometry builders. Each value includes:

- Canonical name.
- Dimensionless ratio or meter value.
- Reference dimension.
- Clamp bounds where needed.
- `representative` source classification.
- Short rationale in code or design documentation.

Pose and Workbench may not override these values.

## Solver Frame Contract

New frame layout fields are appended after the existing elbow field in this order:

1. `ankle`
2. `knee`
3. `hip`
4. `spine`
5. Named x/y pairs for pedal/foot contact, ankle, knee, hip, pelvis, shoulder, elbow, hand/handlebar contact, and head center

Rules:

- Joint fields have length 1 and store radians; landmark coordinate fields store meters.
- Existing field names, meanings, and offsets remain unchanged.
- `strideFloat32` increases to include all appended fields.
- `frameLayout.version` remains 1.
- Native and WebAssembly frame buffers expose identical values and layout metadata.
- Fixture buffers and solver manifests use the same field names and offsets.
- Readers access values by field name and validate bounds.
- Older layouts remain readable; missing full-pose fields produce an explicit unavailable rider state.

## Pose-to-Workbench Parity Contract

For the same Scenario snapshot and movement coordinate:

- Sampled joint values match within `1e-4 rad`.
- Physics-returned bike-local rider/contact landmarks match within `1e-5 m`.
- Segment connectivity and contact identities match exactly by landmark name.
- Workbench differs only by its frame rigid transform, camera, overlays, and visual styling.
- The parity checkpoint includes the sampled movement coordinate, joint values, constraint status, and bike-local landmarks.

## Constraint and Failure Contract

- Non-finite achieved state never leaves physics sampling or reaches Canvas drawing.
- Reach or joint saturation returns a finite connected achieved pose plus a named limiting state.
- Missing required frame fields return `unavailable`, never a partial invented body.
- Unknown frame fields are ignored by older readers.
- Unsupported measured suspension state remains unavailable; configured static topology may still render as representative.
- Geometry errors preserve stage dimensions and show a readable fallback.

## Source-Honesty Contract

| Geometry | Classification |
| -------- | -------------- |
| Frame position, pitch, sampled joints | Solver-derived run state |
| Wheel size, wheelbase, chainstay, bottom-bracket height | Scenario physical input |
| Rider segment positions and contacts | Calculated by physics from scenario dimensions and sampled state |
| Frame tubes, saddle, bars, crank length without explicit fields | Representative schematic geometry |
| Suspension compression without telemetry | Unavailable |

Each relevant view discloses that unspecified bike-fit landmarks are schematic. The disclosure must not imply that measured joint or frame state is representative.

## Rendering and Accessibility Contract

- Preserve `pose-canvas`, `stage-column`, `overlay-bar`, and existing stable region IDs.
- Preserve Canvas accessible names used by test hooks.
- Draw the far limb pair first and use restrained visual separation so the near pair remains readable.
- Draw bicycle behind the rider; contacts and joints remain visible without requiring color alone.
- Constraint state remains perceivable in text outside the Canvas.
- Desktop and tablet stages retain stable dimensions and complete framing without page-wide horizontal overflow.

## Test Contract

### Numeric

- All logical landmarks finite in Rust and worker contracts.
- Segment lengths and connected endpoints: tolerance `1e-5 m` in Rust.
- Hand/handlebar and foot/pedal contacts: tolerance `1e-5 m` in physics-owned bike-local geometry.
- Frame-field transport: tolerance `1e-4 rad`.
- Continuous interpolation adjacent-frame delta: at most `0.05 rad` in dedicated fixtures; step mode is exempt at key boundaries.

### Browser

- Deterministic checkpoints: neutral, authored, constrained, interpolated, rigid, hardtail, full-suspension topology, and same-keyframe cross-view parity.
- Canvas pixel sampling proves nonblank output.
- Screenshots use the repository's 2% maximum differing-pixel ratio.
- Desktop Chromium and iPad Pro 11 visual baselines verify framing, overlap, clipping, and layout stability.
- Primary workflows retain keyboard and accessible-name coverage.
