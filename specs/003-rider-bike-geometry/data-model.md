# Data Model: Coherent Rider and Bike Geometry

## Overview

This feature keeps the persisted Scenario schema unchanged. It extends PoseSample and newly solved run frames with complete achieved bike-local rider/contact landmarks and introduces transient representative bicycle/drawing entities shared by Pose and Workbench.

## Existing Persisted Entities

### Scenario

The authoritative editable setup and immutable run snapshot.

**Relevant relationships**:

- Owns exactly one `RiderSpec`, `BikeSpec`, and `PoseClip`.
- A solved run references an exact validated Scenario snapshot and schema version.
- Geometry builders receive a validated Scenario; they do not mutate or repair it.

### RiderSpec

Existing physical rider dimensions and joint constraints.

| Field | Meaning | Validation |
| ----- | ------- | ---------- |
| `height` | Overall rider height in meters | Existing range: 1.2 to 2.2 |
| `legRatio` | Total leg length relative to height | Existing range: 0.35 to 0.6 |
| `armRatio` | Total arm length relative to height | Existing range: 0.3 to 0.5 |
| `joints.*` | Limits for ankle, knee, hip, spine, shoulder, and elbow | Existing finite min/max rules |

**Derived segment lengths**:

- `legLength = height * legRatio`
- `thighLength = legLength * 0.53`
- `shankLength = legLength * 0.47`
- `armLength = height * armRatio`
- `upperArmLength = armLength * 0.55`
- `forearmLength = armLength * 0.45`
- Torso length follows the existing physical rider segment derivation and has a positive lower bound.

No near/far limb fields are added. Both displayed limb pairs use the same sampled state.

### BikeSpec

Existing physical and configuration fields used to derive bicycle landmarks.

| Field | Meaning | Landmark use |
| ----- | ------- | ------------ |
| `frameType` | `rigid`, `hardtail`, or `full` | Selects connected schematic frame/suspension topology |
| `wheelSize` | Nominal wheel diameter in inches | `wheelRadius = wheelSize * 0.0127` meters |
| `wheelbase` | Axle-to-axle distance | Positions rear and front axle |
| `chainstay` | Rear-axle-to-bottom-bracket distance | Constrains bottom bracket location |
| `bbHeight` | Bottom bracket height above ground | Positions crank center vertically |
| `fork`, `rearShock` | Configured suspension parameters | Static configured/schematic presentation only until measured state exists |

No saddle, handlebar, crank-length, head-angle, or tube-layout fields are persisted by this feature. Missing fit landmarks use documented representative proportions.

### PoseTargets

Authored keyframe values and sampled achieved values.

| Field | Unit | Ownership |
| ----- | ---- | --------- |
| `ankle` | radians | Authored and physics-sampled |
| `knee` | radians | Authored and physics-sampled |
| `hip` | radians | Authored and physics-sampled |
| `spine` | radians | Authored and physics-sampled |

The elbow is intentionally absent from authored targets.

### DerivedArm

Physics-calculated achieved arm state.

| Field | Unit | Rule |
| ----- | ---- | ---- |
| `shoulder` | radians | Calculated from shoulder, handlebar contact, and segment lengths; constrained to limits |
| `elbow` | radians | Calculated by two-link reach; constrained to limits |
| `constrained` | boolean | True when reach or joint limits prevent the unconstrained request |

### AchievedPoseLandmarks

Physics-owned logical side-plane landmarks returned by every pose sample.

| Landmark | Meaning |
| -------- | ------- |
| `pedalContact`, `footContact` | Required active foot-to-pedal contact |
| `ankle`, `knee`, `hip` | Leg-chain joints derived from achieved targets and segment lengths |
| `pelvis`, `shoulder` | Torso endpoints derived from the leg chain and achieved hip/spine state |
| `elbow`, `handContact` | Arm-chain joints derived from shoulder, arm lengths, and handlebar contact |
| `handlebarContact` | Required hand-to-bike contact |
| `headCenter` | Head landmark derived from achieved torso orientation and rider height |

All points are finite bike-local meter coordinates. One logical skeleton is returned; paired visual limbs do not create additional physical state.

## Extended Run Entity

### SampledPoseFrame

A self-contained posture embedded in every newly solved run frame.

| Field | Unit | Source | Required for new runs |
| ----- | ---- | ------ | --------------------- |
| `t` | seconds | Solver | Yes |
| `x`, `y` | meters | Solver body state | Yes |
| `pitch` | radians | Solver | Yes |
| `vx`, `vy` | meters/second | Solver | Yes |
| `airborne` | boolean encoded as scalar | Solver contact state | Yes |
| `contactImpulse` | newton-seconds | Solver | Yes |
| `shoulder`, `elbow` | radians | Physics pose sample | Yes |
| `ankle`, `knee`, `hip`, `spine` | radians | Physics pose sample | Yes, appended by this feature |
| Achieved pose landmark x/y fields | meters | Physics kinematics sample | Yes, appended by this feature |

**Layout transition**:

- Frame layout remains version 1 because field meaning and addressing do not change.
- New scalar fields are appended after existing fields and increase `strideFloat32`.
- Readers address fields by name, not fixed stride offsets.
- Existing run artifacts with the old stride remain valid for reports and metrics. If required pose/landmark fields are absent, Workbench must expose rider posture as unavailable for that legacy frame rather than inventing a complete pose.
- Representative fixture runs are regenerated with the new fields for primary demo journeys.

## Transient Geometry Entities

### Point2

A finite bike-local coordinate in meters.

| Field | Type | Rule |
| ----- | ---- | ---- |
| `x` | finite number | Positive is forward |
| `y` | finite number | Positive is upward |

Workbench transforms bike-local points by run-frame pitch and translation. Pose uses the same local points directly in its viewport.

### LandmarkSource

Canonical source classification for visible geometry.

- `measured`: Direct run-frame or scenario physical quantity.
- `calculated`: Deterministic result from measured/sampled values and documented equations.
- `representative`: Schematic proportion filling a missing visual dimension; never a physical control or measured outcome.
- `unavailable`: Required source data is absent.

### BikeLandmarks

The complete connected bicycle geometry for one displayed state.

**Measured/calculated landmarks**:

- `rearAxle`, `frontAxle`
- `wheelRadius`
- `bottomBracket`
- `groundReference`

**Representative landmarks when no physical field exists**:

- `seatTubeTop`, `saddleFront`, `saddleRear`
- `headTubeTop`, `headTubeBottom`
- `handlebarStem`, `handlebarContact`
- `crankCenter`, `nearPedalContact`, `farPedalContact`
- Frame-type-specific pivot and shock endpoints

**Connectivity relationships**:

- Rear axle connects to bottom bracket and seat support.
- Bottom bracket connects to seat support and head tube.
- Head tube/fork connects to front axle and handlebar stem.
- Crank center equals bottom bracket; each pedal connects to crank center.
- The required hand contact equals `handlebarContact`.
- The required active foot contact equals the corresponding pedal contact.

### RiderLandmarks

The complete articulated rider for one sampled pose, adapted directly from physics-owned `AchievedPoseLandmarks`.

**Landmarks**:

- `pelvis`, `torsoTop`, `neck`, `headCenter`
- `nearShoulder`, `nearElbow`, `nearHand`
- `farShoulder`, `farElbow`, `farHand`
- `nearHip`, `nearKnee`, `nearAnkle`, `nearFoot`
- `farHip`, `farKnee`, `farAnkle`, `farFoot`
- `centerOfMass` when supplied or calculated by the existing presentation contract

**Rules**:

- Every logical point is finite before it crosses the worker boundary.
- Adjacent logical landmark distance equals its rider segment length within `1e-5 m` in Rust tests.
- Both arm pairs share shoulder/elbow state; both leg pairs share ankle/knee/hip state.
- Optional far-limb separation is visual-only and preserves the same angles, lengths, and logical contacts.
- Hands coincide with handlebar contacts and active feet coincide with pedal contacts within `1e-5 m` in physics-owned bike-local geometry.
- If constraints prevent exact reach, the returned pose remains finite and connected, and includes the solver's limiting state.

### RenderGeometry

The immutable input consumed by both Canvas stages.

| Field | Type | Purpose |
| ----- | ---- | ------- |
| `bike` | `BikeLandmarks` | Shared bicycle paths and contacts |
| `rider` | `RiderLandmarks` or unavailable state | Shared achieved rider paths |
| `authoredRider` | optional `RiderLandmarks` | Pose-only target overlay |
| `sources` | landmark/source map | Disclosure and test evidence |
| `constraint` | status and reason | Pose limit presentation |

No Canvas renderer is allowed to alter these landmarks to make a drawing appear connected.

## State Transitions

### Pose view

1. Select or edit an authored keyframe.
2. Existing gateway requests a physics pose sample.
3. Stale responses are rejected by existing request identity rules.
4. The sample already contains achieved RiderLandmarks and authoritative contacts; shared web builders derive only representative bicycle paths around those contacts.
5. Pose renders authored and achieved geometry; constraint status remains synchronized.
6. Valid edits update the active Scenario and mark any displayed run stale.

### Solve and Workbench replay

1. Solver samples, clamps, and solves PoseTargets, DerivedArm, and AchievedPoseLandmarks at each output frame.
2. All six achieved joint values and logical landmark coordinates are written into the named frame layout.
3. Run artifact validation and storage preserve the immutable buffer and Scenario snapshot.
4. Playback reads fields by name for the selected frame.
5. Shared adapters reconstruct the same returned landmarks used by Pose, derive representative bicycle paths, then Workbench applies frame translation and pitch.
6. Scrubbing, playback, resize, camera, and overlays never invoke pose sampling or mutate run state.

### Legacy run fallback

1. Reader validates the older name-based layout.
2. Existing metrics, report, and bike motion remain available.
3. If full pose fields are absent, the rider overlay reports unavailable legacy posture; it does not substitute current scenario edits or a decorative neutral pose.

## Validation Summary

- Scenario and PoseClip schemas remain unchanged; no persisted migration is required.
- New solver frames must contain finite values for all named pose fields.
- Rust pose sampling rejects or constrains non-finite/invalid kinematics before export; web adapters return explicit unavailable status for missing legacy fields.
- Canonical positive knee/elbow flexion and all other sign conventions are documented; Rust owns target and derived-joint clamping.
- Pure geometry parity uses `1e-5 m`; sampled joint transport parity uses `1e-4 rad`.
- Continuous interpolation fixtures limit adjacent-frame joint changes to `0.05 rad`; step mode permits jumps only at key boundaries.
- Source classification is required for every landmark group.
