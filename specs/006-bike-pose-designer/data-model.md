# Data Model: Bike and Pose Designer

## Scenario Version 3

`Scenario` remains the persisted and hashed calculation input. Version 3 adds explicit bicycle
geometry while preserving jump, rider, entry, pose clip, solver, existing bike dimensions, and all
pose targets.

| Field | Type | Rule |
| --- | --- | --- |
| `schemaVersion` | literal `3` | Required after migration |
| `bike` | `BicycleDesign` | One static design per scenario |
| `poseClip` | `PoseClip` | Two to 64 authored keys |
| remaining fields | Existing v2 types | Unchanged except version stamps |

### Migration

A v2 scenario migrates to v3 by adding `bike.geometry` from the documented v2 schematic values and
by deriving a closing fork length against that scenario's wheelbase, chainstay, bottom-bracket
height, reach, stack, head angle, head-tube length, and fork offset. Pose targets, identifiers,
metadata, frame type, suspension, mass, and existing bike dimensions do not change. Scenario-file
envelopes migrate their own version and recompute content hashes when saved.

## BicycleDesign

Persisted under `Scenario.bike`. Existing fields remain authoritative.

| Field | Type/unit | Range or relationship |
| --- | --- | --- |
| `frameType` | `rigid \| hardtail \| full` | Existing rear-shock relationship applies |
| `wheelSize` | inches | `26 \| 27.5 \| 29` |
| `wheelbase` | m | `0.80..1.50` |
| `chainstay` | m | `0.30..0.65`; must reach rear axle to bottom bracket |
| `bbHeight` | m | `0.20..0.50` |
| `mass` | kg | `5..30`; independent of dimensions |
| `fork` | `SuspensionSpec` | Existing limits |
| `rearShock` | `SuspensionSpec \| null` | Required only for `full` |
| `geometry` | `BikeGeometrySpec` | Required v3 measured geometry |

Bicycle design is scenario-level. It has no keyframe identity, timeline state, or per-frame authored
variant.

## BikeGeometrySpec

All values are finite. New lengths use metres and angles use radians in persisted data; Designer may
present millimetres and degrees while showing units explicitly.

| Field | Type/unit | Initial supported range | Meaning |
| --- | --- | --- | --- |
| `modelVersion` | literal `1` | `1` | Geometry/envelope convention |
| `reach` | m | `0.30..0.60` | BB to head-tube top, horizontal |
| `stack` | m | `0.45..0.80` | BB to head-tube top, vertical |
| `headTubeLength` | m | `0.06..0.25` | Head-tube axis length |
| `headTubeAngle` | rad | `0.87..1.40` | Steering axis from forward horizontal |
| `forkLength` | m | `0.30..0.65` | Crown to front axle along steering assembly |
| `forkOffset` | m | `0.00..0.10` | Front-axle offset perpendicular to steering axis |
| `seatTubeLength` | m | `0.25..0.65` | BB to frame seat-tube top |
| `seatTubeAngle` | rad | `1.05..1.45` | Seat axis from forward horizontal |
| `saddleHeight` | m | `0.30..0.90` | BB to saddle center along seat axis |
| `saddleSetback` | m | `-0.15..0.25` | Rearward saddle offset; negative is forward |
| `crankLength` | m | `0.145..0.190` | BB to pedal contact |
| `handlebarOffsetX` | m | `-0.10..0.30` | Grip forward offset from head-tube top |
| `handlebarOffsetY` | m | `-0.15..0.25` | Grip vertical offset from head-tube top |

### Semantic geometry rules

- Wheel radius, axle positions, and bottom bracket must be finite.
- `chainstay²` must be at least the squared rear-axle-to-BB vertical difference.
- Frame and steering members must be non-inverted and non-zero length.
- The fork/head assembly's predicted front axle must be within 0.010 m of the wheelbase-defined
  front axle.
- Saddle, crank, and handlebar contacts must remain connected to their owning assembly.
- Present frame members must not unintentionally self-intersect.
- Rear-shock landmarks exist only for `full`; suspension inputs do not create geometry keyframes.

## CanonicalBikeGeometry

Derived by `physics-core`; never persisted as scenario input.

| Field | Type | Description |
| --- | --- | --- |
| `modelVersion` | integer | Geometry convention used |
| `valid` | boolean | Whether semantic geometry rules pass |
| `issues` | `GeometryIssue[]` | Stable codes, fields, parts, and messages |
| `closureResidual` | m | Distance from predicted to wheelbase-defined front axle |
| `landmarks` | named `Point2` map | Axles, BB, frame junctions, contacts, steering, saddle, shocks |
| `members` | `BikeMember[]` | Named connected drawing members |
| `protectedShapes` | `ProtectedShape[]` | Collision envelopes used for clearance and drawing; pair-specific collision layers apply during validation |
| `massProperties` | `BikeMassProperties` | Derived CoG and planar inertia |

`Point2` uses bike-local metres with positive x forward and positive y up. Geometry remains fixed in
this frame; calculated run translation, rotation, wheel rotation, and supported suspension state are
separate.

## ProtectedShape

A named bike-local envelope shared by validation and rendering.

| Field | Type | Description |
| --- | --- | --- |
| `part` | stable enum | Wheel, frame, crank, saddle, fork, steering, or handlebar part |
| `shape` | capsule, circle, ring, or convex segment | Finite 2D envelope |
| `contactSurface` | none, hand, foot, or saddle-top | Permitted one-sided contact |
| `radius` | m, where applicable | Versioned representative component thickness |

## BikeMassProperties

Derived from `bike.mass`, canonical landmarks, and mass-distribution model version 1.

| Field | Type/unit | Rule |
| --- | --- | --- |
| `totalMass` | kg | Exactly equals authored `bike.mass` |
| `centerOfGravity` | `Point2`, m | Weighted component centers |
| `planarInertia` | kg·m² | Component inertia plus parallel-axis terms |
| `distributionVersion` | literal `1` | Published model assumption |

Component shares are constants, sum exactly to one, and are not user controls. The solver combines
bike properties with rider segment masses placed at the sampled pose landmarks.

## PoseKeyValidation

Derived for one authored `PoseKey`; never persisted.

| Field | Type | Description |
| --- | --- | --- |
| `keyIndex` | integer | Stable index in sorted clip |
| `s` | m | Authored key distance |
| `valid` | boolean | All keyframe gates pass |
| `sample` | `PoseSample` | Achieved targets and landmarks |
| `minimumSeparation` | m | Smallest signed rider/bike separation |
| `contacts` | `ContactResult[]` | Hand, foot, and inferred saddle contact state |
| `conflicts` | `DesignConflict[]` | All clearance, reach, and joint-limit reasons |

A separation of at least `-0.001 m` passes. Interpolated states do not produce this entity and do not
gate calculation. The side-view collision matrix ignores only projected pairs between limb capsules
(`leftThigh`, `leftShank`, `leftUpperArm`, `leftForearm`) and central frame tubes (`topTube`,
`downTube`, `seatTube`, `chainstay`, `seatstay`). Those shapes remain protected and rendered; all
other rider/bike pairs retain normal clearance or designated-contact rules.

## PoseEditResolution

Derived for one direct edit request.

| Field | Type | Description |
| --- | --- | --- |
| `requestedTargets` | `PoseTargets` | User request |
| `acceptedTargets` | `PoseTargets` | Request or furthest valid bisection result |
| `requestedValid` | boolean | Whether the request passed unchanged |
| `validation` | `PoseKeyValidation` | Result for accepted targets |
| `limitingConflicts` | `DesignConflict[]` | Reasons the request was constrained |

The accepted baseline must already be valid. Fixed-iteration bisection is deterministic and searches
only the segment from baseline to request.

## DesignConflict

| Field | Type | Description |
| --- | --- | --- |
| `code` | stable enum | Machine-testable reason |
| `kind` | geometry, clearance, contact, reach, or joint limit | User-facing category |
| `keyIndex` | integer or null | Affected pose key |
| `riderPart` | stable enum or null | Conflicting rider part |
| `bikePart` | stable enum or null | Conflicting bike part |
| `separation` | m or null | Signed distance when applicable |
| `message` | string | Concise correction guidance |

## DesignValidation

Aggregate derived result for the active scenario.

| Field | Type | Description |
| --- | --- | --- |
| `geometry` | `CanonicalBikeGeometry` | One scenario-level inspection |
| `poseKeys` | `PoseKeyValidation[]` | Exactly one result per authored key |
| `canSolve` | boolean | Geometry valid and every authored key valid |
| `conflictCount` | integer | Total blocking conflicts |

## DesignerDraft

Web-only state; not persisted, exported, or sent to solve until geometry is valid.

| Field | Type | Description |
| --- | --- | --- |
| `bike` | `BicycleDesign` | Current field values |
| `inspection` | geometry result or pending | Latest worker result |
| `dirty` | boolean | Differs from applied scenario bike |
| `requestId` | integer | Rejects stale worker responses |

### State transitions

1. **Applied → Editing**: a bike field changes; update draft and mark pending.
2. **Editing → Draft invalid**: structural or semantic geometry validation fails; retain fields, do not
   update the scenario, show all geometry issues.
3. **Editing → Applied with valid poses**: geometry passes; update scenario bike and batch validation;
   `canSolve` remains true.
4. **Editing → Applied with pose conflicts**: geometry passes and is saved to the scenario; preserve
   every pose target, list affected keys, and set `canSolve` false.
5. **Pose request → Constrained**: return and commit the furthest valid target; expose limiting
   conflicts.
6. **Apply to Run**: enabled only when latest draft is applied and `DesignValidation.canSolve` is
   true.
