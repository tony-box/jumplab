# Contract: Frame Layout v2 and the Bike Anchor

**Feature**: [../spec.md](../spec.md) | **Status**: Design | **Frame layout version**: 2

This contract is the single written definition of what the solver reports per frame and what those
numbers mean geometrically. Renderer, reports, and tests MUST read it rather than infer meaning from
either side's code.

## 1. Coordinate and Anchor Contract

**World frame**: `+x` forward (direction of travel), `+y` up, origin at the base of the takeoff
transition, so `x = 0` is where the lip curve begins. Units are metres.

**Body-local frame**: `+x` toward the front wheel, `+y` up, origin on the bike's contact line
directly below the axle midpoint.

### Anchor definition (normative)

`frame.x` and `frame.y` are the world coordinates of the bike body-frame origin. In body-local
coordinates the rear axle is at `(-wheelbase / 2, wheelRadius)` and the front axle is at
`(+wheelbase / 2, wheelRadius)`. When the bike rests level on flat ground at height `h`, the anchor
is exactly `(x, h)` and both axle centres are at `h + wheelRadius`.

### Pitch definition (normative)

`frame.pitch` is the body's rotation about its own origin, in radians, positive counter-clockwise in
the `+x` forward and `+y` up world frame. Positive pitch is nose-up.

### Transform

```text
world.x = frame.x + local.x * cos(pitch) - local.y * sin(pitch)
world.y = frame.y + local.x * sin(pitch) + local.y * cos(pitch)
```

### Required consumer changes

- `apps/web/src/rendering/canvas/workbench-stage.ts` currently computes `cos(-frame.pitch)` and
  `sin(-frame.pitch)`. It MUST use `+frame.pitch` to match this contract.
- `apps/web/src/rendering/geometry/bike-geometry.ts` already places axles at `y = wheelRadius`; that
  placement is now contractual and MUST NOT change without a version bump.

### Conformance test

A contract test MUST assert that for a level bike on flat ground the renderer's computed world axle
height equals `frame.y + wheelRadius`, and that each rendered wheel's lowest point equals `frame.y`
within `1e-6` m. A positive-pitch case MUST also assert that the rendered front axle is higher than
the rear axle, catching a reversed pitch sign.

## 2. Frame Buffer Layout

Stride is 36 float32 values per frame. Offsets 0 to 30 are byte-compatible with version 1.

| Offset | Name | Unit | Type | Semantics |
| --- | --- | --- | --- | --- |
| 0 | `t` | s | f32 | Frame time from solve start |
| 1 | `x` | m | f32 | Body-frame origin, world x |
| 2 | `y` | m | f32 | Body-frame origin, world y |
| 3 | `pitch` | rad | f32 | Measured body rotation, positive counter-clockwise |
| 4 | `vx` | m/s | f32 | Linear velocity, world x |
| 5 | `vy` | m/s | f32 | Linear velocity, world y |
| 6 | `airborne` | n/a | f32 | `1.0` when neither wheel has supporting impulse above epsilon |
| 7 | `contactImpulse` | N·s | f32 | Measured total normal impulse across both wheels |
| 8 | `shoulder` | rad | f32 | Achieved rider joint angle |
| 9 | `elbow` | rad | f32 | Achieved rider joint angle |
| 10 | `knee` | rad | f32 | Achieved rider joint angle |
| 11 | `hip` | rad | f32 | Achieved rider joint angle |
| 12 | `spine` | rad | f32 | Achieved rider joint angle |
| 13 to 30 | landmark pairs | m | f32 | `pedalContact`, `ankle`, `knee`, `hip`, `shoulder`, `elbow`, `hand`, `handlebarContact`, `head` as `x,y` |
| 31 | `groundedRear` | n/a | f32 | `1.0` when rear impulse exceeds `CONTACT_IMPULSE_EPSILON` |
| 32 | `groundedFront` | n/a | f32 | `1.0` when front impulse exceeds `CONTACT_IMPULSE_EPSILON` |
| 33 | `normalForceRear` | N | f32 | Rear normal impulse divided by substep duration |
| 34 | `normalForceFront` | N | f32 | Front normal impulse divided by substep duration |
| 35 | `minClearance` | m | f32 | Signed minimum gap from either wheel surface to the ground |

### Field invariants

These MUST hold for every frame of every valid solve and are the basis of the acceptance tests:

1. Raw impulses at or below `CONTACT_IMPULSE_EPSILON` are normalized to zero in reported frame
  fields; therefore `airborne == 1.0` implies `contactImpulse == 0`, `normalForceRear == 0`, and
  `normalForceFront == 0` exactly.
2. `airborne == 0.0` implies `contactImpulse > 0`.
3. `airborne == 1.0` if and only if `groundedRear == 0.0` and `groundedFront == 0.0`.
4. `normalForceRear >= 0` and `normalForceFront >= 0`.
5. `minClearance >= -0.01`.
6. All 36 values are finite.
7. Boolean-valued fields are exactly `0.0` or `1.0`.

`CONTACT_IMPULSE_EPSILON` is a fixed positive solver constant justified against the validated mass,
gravity, and time-step ranges. It is independent of rendering and display frame rate.

### Angular-motion and energy accounting

Analytical and regression tests MUST verify pitch follows a constant slope, remains stable through
the lip crest, and evolves deterministically in flight. Because the retained horizontal-speed
constraint performs external work, energy validation MUST account for it explicitly:

```text
E(t + dt) - E(t) = W_speed_constraint + W_contact + residual
```

The model documentation MUST define the terms and a bounded residual tolerance. A raw mechanical
energy-conservation assertion that omits `W_speed_constraint` is invalid for this solver version.

### Removed behaviour

- The penetration-derived `contact_impulse` expression ending in `* 500.0` is deleted.
- `detect_takeoff` and its clearance threshold are deleted.
- Pose-derived `pitch`, computed as `hip * 0.25 + spine * 0.45`, is deleted.

Any reintroduction of a synthesised value in these fields is a contract violation.

## 3. Telemetry Buffer

Unchanged: stride 4, channels `[contactImpulse, motorWork, speed, y]`. `contactImpulse` now carries
the measured value. Metric aggregation in `build_metrics` continues to consume `step_by(4)`.

## 4. Version Signalling

| Identifier | Value |
| --- | --- |
| `FRAME_LAYOUT_VERSION` | `2` |
| `SOLVER_VERSION` | new value distinct from the previous string |
| `MODEL_VERSION` | new value reflecting the two-wheel contact model |
| `PROTOCOL_VERSION` | `2` |
| logical persistence version | `2` |

Five identifiers change: solver, model, protocol, frame layout, and logical persistence. Scenario
schema remains version 1. Dexie database schema versioning is separate and advances from 2 to 3.

The worker's advertised `frameLayout` descriptor in `apps/web/src/solver/physics.worker.ts` MUST
declare `strideFloat32: 36` and list all fields above. `apps/web/src/app/version-manifest.ts` MUST
report the same values, and `tests/contracts/physics-worker.test.ts` MUST assert agreement between
the advertised descriptor and this table.
