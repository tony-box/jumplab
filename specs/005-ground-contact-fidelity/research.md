# Phase 0 Research: Ground Contact Fidelity

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-08-26

This document records the investigation of the reported defect and the design decisions that resolve
it. No unresolved Technical Context items remain.

## Root Cause Analysis

The report "the bicycle just falls through the ground" is not one bug. Code inspection found four
independent defects that combine to produce it. Each is addressed by a decision below.

### RC-1: The drawn ground is not the simulated ground

`apps/web/src/rendering/canvas/terrain-profile.ts` builds a six-point schematic:

```ts
{ x: -scenario.jump.transitionRadius, y: 0 },
{ x: lipX /* = 0 */, y: scenario.jump.lipHeight },
```

The drawn surface therefore reaches full `lipHeight` at `x = 0`. The solver's
`generate_terrain_profile` in `crates/physics-core/src/geometry.rs` keeps the approach flat until
`x = 0` and only then curves upward across `lip_len = transition_radius * lip_angle`:

```rust
let y = jump.lip_height * ComplexField::powf(ratio, 1.35);
```

The two surfaces disagree by up to the full lip height over the entire approach, and the drawn
landing terminates at a hardcoded `y: -0.2` unrelated to the simulated landing slope. A bike
correctly resting on the simulated ground is therefore drawn well below the painted ground. This is
the dominant visual cause of the report.

### RC-2: The frame anchor and the renderer's bike origin disagree

The solver initialises and reports the wheel-centre height:

```rust
let initial_y = terrain_height_at(&terrain, scenario.entry.start_x) + bike_model.wheel_radius_m;
```

The renderer maps bike-local `(0,0)` to `(frame.x, frame.y)`, but
`apps/web/src/rendering/geometry/bike-geometry.ts` places both axles at local `y = wheelRadius`:

```ts
const rearAxle: Point2 = { x: -bike.wheelbase / 2, y: wheelRadius };
const frontAxle: Point2 = { x: bike.wheelbase / 2, y: wheelRadius };
```

Bike-local origin is the ground line, but the solver reports an axle height. The drawn bike is
consistently offset by one wheel radius from where the simulation says it is. There is no shared,
written definition of what `frame.y` means, so both sides are self-consistent and mutually wrong.

### RC-3: Contact is not constrained, only measured after the fact

The solver simulates a single ball with no orientation coupling, and its reported contact force is a
display proxy rather than a solved quantity:

```rust
let contact_impulse =
    (terrain_height_at(&terrain, pos.x) + bike_model.wheel_radius_m - pos.y).max(0.0) * 500.0;
```

The multiplier `500.0` is arbitrary and the value is never fed back into the body. Airborne state
comes from a geometric guess in `bike.rs` rather than from contact:

```rust
pub fn detect_takeoff(rear_clearance: f32, front_clearance: f32, threshold: f32) -> bool {
    front_clearance > threshold && rear_clearance >= 0.0
}
```

Rapier does resolve the ball against the polyline, so gross penetration is limited, but nothing
constrains the drawn multi-metre bike-and-rider body, and nothing reports true contact.

### RC-4: A single contact point cannot produce terrain-following orientation

Reported `pitch` is synthesised from rider pose, not from body dynamics:

```rust
let pitch = sample.targets.hip * 0.25 + sample.targets.spine * 0.45;
```

With one ball collider there is no torque from the ground, so the bike cannot rotate up the
transition or nose down onto a landing. Even with RC-1 and RC-2 fixed, the bike would slide along the
surface at a pose-derived angle, still visibly intersecting the terrain at the lip and landing.

## Decisions

### D-1: Two wheel colliders on one rigid bike body

**Decision**: Replace the single dynamic ball with one dynamic rigid body carrying two ball
colliders at the rear and front axle positions derived from `wheelbase` and `wheel_size`. Leave
rotation free. Keep collider `friction(0.0)` and `restitution(0.0)`.

**Rationale**: Satisfies FR-001, FR-002, and FR-003 with the solver already in the project. Rapier
resolves non-penetration and produces genuine normal impulses at both contacts, and two separated
contact points generate the torque that makes pitch follow terrain slope. This deliberately does not
satisfy the full rider-coupling requirement in Constitution Principle II; the bounded temporary
exception and its required follow-up are documented in D-8.

**Alternatives considered**:

- Keep one ball and post-process orientation from terrain slope. Rejected: orientation would be a
  drawn decoration rather than a computed result, which Principle I forbids.
- Full articulated multibody with suspension joints. Rejected: the spec scopes suspension travel and
  rider load coupling out, and it would make regressions unattributable.
- Custom analytic contact solver. Rejected: duplicates Rapier, adds unvalidated numerics, and widens
  the surface for determinism defects.

### D-2: Frame anchor is the bike body-frame origin, defined once and shared

**Decision**: Define the reported `(x, y)` as the world position of the bike body-frame origin, where
body-local coordinates place the axles at `(±wheelbase/2, wheelRadius)`. The origin is therefore the
contact line directly beneath the axle midpoint. Report `pitch` as the body's rotation, positive
counter-clockwise in a `+x` forward, `+y` up world.

**Rationale**: This is exactly the convention `bike-geometry.ts` already assumes, so the renderer
needs no geometric rework and RC-2 disappears. Writing it down as a contract
([contracts/frame-layout-v2.md](contracts/frame-layout-v2.md)) prevents the two sides drifting apart
again, and makes FR-007 mechanically checkable.

**Alternatives considered**:

- Move the renderer's origin to the axle midpoint. Rejected: `bike-geometry.ts` is shared with the
  pose editor, where a ground-line origin is the natural reference.
- Report both an axle position and a ground position. Rejected: two sources of truth invite the same
  class of drift.

**Consequence**: `workbench-stage.ts` currently rotates by `-frame.pitch`. Under the stated
convention it must rotate by `+frame.pitch`; this sign fix is part of the work.

### D-3: Contact state is measured from the solver's contact pairs

**Decision**: After each step, read the narrow-phase contact pairs for both wheel colliders. Record
touching separately from supporting contact. A wheel is grounded only when its normal impulse
exceeds a fixed `CONTACT_IMPULSE_EPSILON`; smaller values are normalized to zero in reported support
fields. Derive per-wheel grounded flags, per-wheel normal force, total `contactImpulse`, and signed
minimum clearance to actual terrain segments. Delete `detect_takeoff` and the `* 500.0` proxy.
`airborne` becomes "neither wheel has supporting impulse above epsilon".

**Rationale**: Satisfies FR-004, FR-005, and FR-012. Replaces two invented values with measured ones,
which Principle III requires. Minimum clearance gives tests a single scalar to assert SC-001 against
without recomputing terrain in the test.

**Alternatives considered**:

- Keep the penetration proxy and rename it. Rejected: the spec forbids a substitute value derived
  from sink depth.
- Emit Rapier contact-force events. Rejected: event thresholds add tuning and can drop light
  contacts; direct contact-pair inspection is deterministic and complete.

### D-4: The solver exports segmented terrain that covers the complete approach

**Decision**: Add a `terrainProfileJson(scenarioJson, step)` WebAssembly export backed by the same
`generate_terrain_profile` the solve path uses, expose it as a `terrain` worker command, and have
`terrain-profile.ts` return its separate surface segments. Generate approach support back to at
least `entry.startX - wheelbase / 2 - wheelRadius`. Table jumps receive a deck segment; gap,
step-up, and step-down jumps have no segment between lip and landing. Build one static collider per
segment and make terrain/clearance queries return no surface inside voids. Persist only the sampling
step (`terrainSampleStep`) in model metadata; the profile is re-derived deterministically from the
stored scenario snapshot.

**Rationale**: Satisfies FR-006 by construction: there is exactly one terrain generator, the
renderer cannot approximate it, the standard `startX = -14` entry has actual support, and real gaps
do not acquire phantom collision edges. Storing the step rather than sampled segments keeps run
artifacts small while remaining exactly reproducible, consistent with Principle IV.

**Alternatives considered**:

- Reimplement the profile in TypeScript. Rejected: two implementations of one curve is precisely the
  defect being fixed.
- Embed the full sampled polyline in every artifact. Rejected: roughly 5 KB per run of derivable
  data, and it can contradict the scenario snapshot after a migration.

### D-5: Append contact fields and keep existing frame offsets stable

**Decision**: Extend the frame stride from 31 to 36 by appending `groundedRear`, `groundedFront`,
`normalForceRear`, `normalForceFront`, and `minClearance`. Existing offsets 0 to 30 keep their
meaning and position. Redefine offset 7 (`contactImpulse`) as the measured total normal impulse. Bump
`FRAME_LAYOUT_VERSION` from 1 to 2. Leave the telemetry buffer at stride 4.

**Rationale**: Appending avoids touching landmark offsets, limiting churn in decoding code and
fixtures. Holding telemetry stride at 4 avoids reworking the `step_by(4)` metric aggregation and the
worker's telemetry descriptor, keeping the change set attributable.

**Alternatives considered**:

- Reorder fields into logical groups. Rejected: gratuitous churn across fixtures and tests for no
  behavioural gain.
- Add contact channels to the telemetry buffer. Rejected: contact state is per-frame state, not a
  sampled signal, and the frame buffer is where per-frame state already lives.

### D-6: Regenerate legacy runs in place on load

**Decision**: When a stored artifact's solver or frame-layout metadata differs from current values,
migrate its scenario snapshot to the current scenario schema, validate it, verify the stored hash
using the hash rules for the snapshot's original schema version, then re-solve and replace the
derived solution while preserving `runId`, `createdAt`, and the saved scenario inputs. A current
solver version paired with an invalid frame stride is corruption and must also trigger regeneration
or an explicit refusal. Use Dexie schema version 3 for new persistence fields because database
schema version 2 already exists. If migration, validation, or solving fails, surface an explicit
"cannot regenerate" state and refuse to replay the stored solution.

**Rationale**: Implements the recorded clarification and FR-015. Preserving run identity keeps report
links and baselines intact, while replacing only derived data guarantees nothing on screen was
produced by the known-defective solver.

**Alternatives considered**:

- Warn and keep replaying old frames. Rejected by the clarification, and it would keep showing the
  exact defect this feature fixes.
- Delete incompatible runs. Rejected: destroys user data and breaks baseline references.
- Re-solve into a new run. Rejected by the clarification; it duplicates history and orphans links.

### D-7: Guard the validated operating range instead of silently tunnelling

**Decision**: Before solving, verify that per-substep horizontal displacement is below the wheel
radius, and enable Rapier CCD on the wheel colliders when `scenario.solver.ccd` is set. If the check
fails, reject the solve with a diagnostic naming the offending setting.

**Rationale**: Satisfies FR-009 and the constitution's requirement that the solver reject or flag
configurations outside its validated range, rather than emitting a run that ignores the ground.

**Alternatives considered**:

- Always force CCD on. Rejected: hides misconfiguration and costs performance on every run.
- Silently clamp the time step. Rejected: changes results without telling the user, breaking
  reproducibility expectations.

### D-8: Temporary Principle II exception requires a coupled-physics follow-up

**Decision**: Feature 005 may combine rider and bicycle mass into one rigid body only for honest
two-wheel contact, non-penetration, terrain-following pitch, and measured support loads. It MUST NOT
claim that rider posture, rider movement, suspension setup, or frame type changes takeoff, flight,
landing, or contact loading. The project maintainer owns this exception. It expires before any such
claim ships and is retired only by a follow-up specification that models rider position and weight
transfer, active movement, suspension compression and rebound, and their coupled effects through
takeoff, airborne rotation, landing, and ground loads.

**Rationale**: Keeps the ground-contact defect small enough to validate while making the current
model boundary explicit rather than incorrectly marking full Principle II compliance. The required
follow-up is registered in `docs/architecture/follow-up-features.md` and must publish a new model
version.

**Alternatives considered**:

- Expand feature 005 into full rider and suspension dynamics. Rejected: it prevents isolating and
  validating the immediate terrain-contact defect.
- Leave posture controls visually active without a warning. Rejected: it would present controls
  that cannot influence computed motion, violating Principle II and data-source honesty.

## Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| The retained horizontal-speed pin fights the contact solver when the bike is driven into a steep face, such as the near side of a gap. | Apply the pin to the linear `x` component only, leaving vertical and angular motion free. Cover the drive-into-face case with a regression scenario and assert non-penetration rather than a specific trajectory. |
| Free rotation lets the body spin unrealistically during long flight. | Angular damping stays at zero for determinism; flight rotation is bounded by the takeoff state. Capture a flight-rotation regression scenario so future changes are visible. |
| Polyline contact can jitter at the lip crest where slope changes abruptly. | Assert a stability checkpoint at the crest in the regression suite; if jitter appears, reduce the terrain sampling step rather than adding damping that would mask it. |
| The horizontal-speed constraint makes raw mechanical energy non-conservative. | Account for its external work explicitly and assert a bounded residual for `ΔE - W_speed_constraint - W_contact`; never claim raw energy conservation. |
| Golden determinism hashes and stored fixtures all change at once. | Bump versions first, then regenerate fixtures in a single dedicated step so review can distinguish expected regeneration from unexpected behaviour change. |
| Visual snapshots fail everywhere because the terrain and the bike both move. | Land the terrain and anchor corrections together, then refresh snapshots once, with the ground-contact assertions rather than the images acting as the real gate. |

## Open Questions

None. All Technical Context entries are resolved, and the single specification clarification
(legacy-run handling) is recorded in [spec.md](spec.md) and implemented by D-6.
