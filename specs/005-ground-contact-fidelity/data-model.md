# Phase 1 Data Model: Ground Contact Fidelity

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Research**: [research.md](research.md)

Entities below refine the three named in the specification (Ground Profile, Contact State, Run
Frame) into concrete fields, units, validation rules, and state transitions. All lengths are metres,
forces newtons, impulses newton-seconds, angles radians, and times seconds.

## Entity: GroundProfile

The single authoritative collection of discontinuous side-view surface segments for a scenario.
Produced by `generate_terrain_profile` in `crates/physics-core/src/geometry.rs` and consumed by both
the contact solver and the stage renderer.

| Field | Type | Unit | Description |
| --- | --- | --- | --- |
| `segments` | `GroundSegment[]` | n/a | Separate polylines; no implicit edge exists between segments |
| `approachStartX` | `f32` | m | First supported approach coordinate |
| `lipX` | `f32` | m | Horizontal position of the takeoff crest |
| `landingStartX` | `f32` | m | Horizontal position where the landing surface begins |
| `sampleStep` | `f32` | m | Sampling interval used to generate `points` (default `0.1`) |

Each `GroundSegment` has a stable `id`, a `kind` (`approach-takeoff`, `table-deck`,
`landing-face`, or `landing-rollout`), and at least two finite points. Table jumps include a deck;
gap, step-up, and step-down jumps have no segment connecting lip to landing. The landing face is a
separate vertical segment from the landing-end elevation to the landing-start elevation.

### GroundProfile validation rules

- Every segment MUST contain at least two vertices and every component MUST be finite.
- Points are ordered along each segment; no interpolation or collision edge may be created between
  the final point of one segment and the first point of another.
- `approachStartX <= entry.startX - wheelbase / 2 - wheelRadius`, ensuring the rear wheel has ground
  beneath it in the initial frame. The generated approach extends farther when needed rather than
  deriving its start solely from transition radius.
- `sampleStep > 0`. A non-positive value falls back to `0.25`, matching existing behaviour.
- The profile MUST be a pure function of the scenario and `sampleStep`. Identical inputs MUST
  produce byte-identical output, because the renderer re-derives it from the stored scenario
  snapshot rather than from stored geometry (research decision D-4).
- Point or clearance queries return no surface for coordinates inside an intentional void. Signed
  wheel clearance is computed against the nearest actual segment, never against an interpolated
  height spanning a void.

### GroundProfile relationships

- Derived from `Scenario.jump`.
- Referenced by every `ContactState` sample as the surface contacts are resolved against.
- Serialised to the client through the `terrain` worker command
  ([contracts/terrain-profile.md](contracts/terrain-profile.md)).

## Entity: BikeContactGeometry

The rigid contact body derived from the bike specification. Replaces the single-ball model.

| Field | Type | Unit | Description |
| --- | --- | --- | --- |
| `wheelRadius` | `f32` | m | `wheelSize * 0.0254 / 2` |
| `rearAxle` | `Point2` | m | Body-local `(-wheelbase / 2, wheelRadius)` |
| `frontAxle` | `Point2` | m | Body-local `(+wheelbase / 2, wheelRadius)` |
| `mass` | `f32` | kg | Combined bike and rider mass |
| `centreOfMass` | `Point2` | m | Body-local centre of mass governing rotational response |
| `ccdEnabled` | `bool` | n/a | Whether continuous collision detection is active for wheel colliders |

### BikeContactGeometry validation rules

- `wheelRadius > 0` and `wheelbase > 0`; otherwise the scenario is rejected before solving.
- Both axles MUST sit at exactly `y = wheelRadius` in body-local space. This is what makes the body
  origin the contact line and keeps the renderer's existing geometry correct (research decision D-2).
- `mass > 0`. Mass properties are assigned so the body origin remains the reported anchor while the
  centre of mass governs rotation.

### BikeContactGeometry relationships

- Derived from `Scenario.bike` and `Scenario.rider`.
- Must stay numerically identical to the renderer's `buildBikeGeometry` axle placement in
  `apps/web/src/rendering/geometry/bike-geometry.ts`; a contract test asserts this.

## Entity: ContactState

Per-frame measured contact result. Replaces the penetration proxy and the clearance heuristic.

| Field | Type | Unit | Description |
| --- | --- | --- | --- |
| `touchingRear` | `bool` | n/a | Rear wheel has an active contact manifold, including zero impulse |
| `touchingFront` | `bool` | n/a | Front wheel has an active contact manifold, including zero impulse |
| `groundedRear` | `bool` | n/a | Rear supporting impulse exceeds `CONTACT_IMPULSE_EPSILON` |
| `groundedFront` | `bool` | n/a | Front supporting impulse exceeds `CONTACT_IMPULSE_EPSILON` |
| `normalForceRear` | `f32` | N | Accumulated rear normal impulse divided by substep duration |
| `normalForceFront` | `f32` | N | Accumulated front normal impulse divided by substep duration |
| `contactImpulse` | `f32` | N·s | Total measured normal impulse across both wheels |
| `minClearance` | `f32` | m | Signed minimum gap between either wheel surface and the ground |
| `airborne` | `bool` | n/a | Derived as `!groundedRear && !groundedFront` |

### ContactState validation rules

- Normal forces MUST be greater than or equal to zero. A negative value means the surface is pulling
  the bike down and MUST fail the constraint test (FR-002).
- `CONTACT_IMPULSE_EPSILON` MUST be a fixed, documented positive solver constant justified against
  the validated mass, gravity, and time-step ranges. It MUST NOT vary with rendering or frame rate.
- When `airborne` is true, `contactImpulse`, `normalForceRear`, and `normalForceFront` MUST all be
  less than or equal to `CONTACT_IMPULSE_EPSILON` and reported supporting force MUST be zero
  (SC-002).
- When `airborne` is false, at least one wheel's supporting impulse MUST exceed
  `CONTACT_IMPULSE_EPSILON` (SC-002).
- `minClearance >= -0.01` at every reported frame (SC-001). Negative values denote penetration.
- `airborne` MUST be computed from contact flags only; no geometric fallback is permitted (FR-004).

### ContactState transitions

| From | To | Trigger | Emitted phase marker |
| --- | --- | --- | --- |
| grounded | airborne | Both wheels fall to or below the support-impulse epsilon | `takeoff` |
| airborne | grounded | Either wheel exceeds the support-impulse epsilon | `landing` |
| grounded | grounded | Contacts persist, possibly transferring between wheels | `approach` or `rollout` |
| airborne | airborne | No contacts; ballistic motion under gravity only | `flight` |

Phase intervals are derived from these transitions rather than from the first and last airborne frame
indices, so a bike that never leaves the ground yields no `takeoff` or `flight` interval.

## Entity: RunFrame

The per-frame record written to the frame buffer and read by the renderer, reports, and tests.
Offsets 0 to 30 are unchanged from frame layout version 1; offsets 31 to 35 are new.

| Offset | Field | Unit | Change |
| --- | --- | --- | --- |
| 0 | `t` | s | unchanged |
| 1 to 2 | `x`, `y` | m | redefined as the bike body-frame origin |
| 3 | `pitch` | rad | redefined as measured body rotation |
| 4 to 5 | `vx`, `vy` | m/s | unchanged |
| 6 | `airborne` | n/a | redefined as measured contact state |
| 7 | `contactImpulse` | N·s | redefined as measured normal impulse |
| 8 to 12 | `shoulder` through `spine` | rad | unchanged |
| 13 to 30 | landmark `x`/`y` pairs | m | unchanged |
| 31 | `groundedRear` | n/a | new; supporting impulse exceeds epsilon |
| 32 | `groundedFront` | n/a | new; supporting impulse exceeds epsilon |
| 33 | `normalForceRear` | N | new |
| 34 | `normalForceFront` | N | new |
| 35 | `minClearance` | m | new |

Full field semantics are specified in [contracts/frame-layout-v2.md](contracts/frame-layout-v2.md).

### RunFrame validation rules

- Stride is exactly 36 floats, so `frameBuffer.length % 36 == 0`.
- Every value MUST be finite. A non-finite value fails the solve rather than being written.
- Boolean-valued fields are encoded as exactly `0.0` or `1.0`.

## Entity: ModelMetadata (extended)

Stored per run in the artifact and used to decide whether regeneration is required.

| Field | Type | Change |
| --- | --- | --- |
| `scenarioSchemaVersion` | `int` | unchanged (`1`) |
| `solverVersion` | `string` | bumped; drives the regeneration decision |
| `modelVersion` | `string` | bumped to reflect the contact model |
| `assumptionsId` | `string` | unchanged |
| `unitSystemId` | `string` | unchanged |
| `metricDefinitionVersion` | `string` | unchanged |
| `terrainSampleStep` | `f32` | new; lets the renderer re-derive the exact ground profile |

### ModelMetadata validation rules

- `terrainSampleStep > 0` and MUST equal the step the solve actually used.
- `model.solverVersion` MUST continue to equal `manifest.solverVersion`; the existing
  `runArtifactSchema` refinement already enforces this and MUST keep passing after regeneration.

## Version Registry Impact

| Domain | Before | After | Migration |
| --- | --- | --- | --- |
| `scenario` | 1 | 1 | none; scenario shape is unchanged |
| `protocol` | 1 | 2 | new `terrain` command added to the worker protocol |
| `frame-layout` | 1 | 2 | stride 31 to 36, appended contact fields |
| `persistence` | 1 | 2 | stored runs re-solved in place on load (D-6) |

The logical persistence contract version above is distinct from the Dexie database schema version.
The database already has schema versions 1 and 2, so implementation adds Dexie schema version 3 for
new metadata and detection fields; it MUST NOT attempt to redefine the existing version-2 upgrade.

`tests/contracts/compatibility.test.ts` currently asserts that version `1` is current and version `2`
throws for all four domains. It MUST be updated so `protocol`, `frame-layout`, and `persistence`
report `2` as current with `1` resolvable through a migration path, while `scenario` still reports
`1` as current.
