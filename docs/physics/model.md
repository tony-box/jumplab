# Physics Model

## Scope and ownership

`physics-core` owns terrain generation, pose sampling, joint-limit clamping, connected rider
kinematics, constrained arm geometry, fixed-step dynamics, telemetry, and result hashes. TypeScript
adapts validated inputs and visualizes returned values; it is not an authoritative physics
implementation and MUST NOT reclamp or recompute achieved joint values or landmarks.

All scenario lengths use metres, mass uses kilograms, time uses seconds, angles use radians, force
uses newtons, impulse uses newton-seconds, and energy uses joules. Gravity is constant:

$$\mathbf{g}=(0,-9.81)\ \mathrm{m/s^2}.$$

Rapier advances one combined rider/bike rigid body against deterministic segmented polyline terrain
with fixed integration step

$$\Delta t_{physics}=\frac{\Delta t_{scenario}}{N_{substeps}}.$$

The solve frequency must be an integer multiple of the output frequency. The canonical fixture uses
960 Hz physics and 120 Hz stored output. After genuine flight reaches 0.05 m surface clearance, the
simulation ends 3 seconds after the first subsequent grounded frame or at 10 seconds total,
whichever occurs first. Runs that reach the end of modeled terrain stop there. The flat run-out is
extended far enough to support the full post-landing window at the configured entry speed.

## Canonical measured bicycle geometry

Scenario v3 stores bike dimensions using common side-view measurement conventions. Coordinates are
bike-local with positive x forward and positive y up. Angles are measured from forward horizontal;
reach and stack run from the bottom bracket to the head-tube top; fork length is axle-to-crown; fork
offset is perpendicular to the steering axis; saddle height starts at the bottom bracket; and saddle
setback is rearward from the seat axis. Designer may display millimetres and degrees, but persisted
lengths and angles remain metres and radians.

For wheel radius $r$, wheelbase $w$, chainstay length $c$, and bottom-bracket height $h$, the rear
axle $R$, front axle $F$, and bottom bracket $B$ are

$$
R=(-w/2,r),\qquad F=(w/2,r),\qquad
B=\left(R_x+\sqrt{c^2-(h-r)^2},h\right).
$$

Reach and stack place the head-tube top. Head-tube length and head angle place its bottom; fork
length and offset then predict a front axle $F'$. The authored combination is valid only when

$$\lVert F'-F\rVert\leq0.010\ \mathrm{m}.$$

This 10 mm closure allowance covers rounded source measurements. It is not the rider clearance
tolerance. Once closure passes, canonical members connect to the exact wheelbase-defined axle; the
residual remains reported. Frame members, contacts, drawing geometry, protected shapes, CoG, and
inertia all consume these same Rust-returned landmarks. Bicycle geometry is authored once per
scenario, has no keyframes, and remains static while pose keys and run frames change.

## Terrain and contact body

Terrain is a collection of separate polyline segments, not one continuous height field. Let wheel
radius be $r_w=0.0254\,d_w/2$, where $d_w$ is wheel size in inches. The supported approach starts at

$$x_{approach}=x_{entry}-\frac{L}{2}-r_w,$$

where $L$ is wheelbase. This supports the initial rear wheel without allowing a shape control to
change the authored 5 m approach travel. The takeoff starts at $x=0$ and ends at
$(\ell,h_{lip})$, where $\ell$ is transition length. It is a cubic Bezier with
$P_0=(0,0)$, $P_1=(\ell/3,0)$, $P_3=(\ell,h_{lip})$, and
$P_2=(\ell-d,h_{lip}-d\tan\theta_{lip})$. The bounded handle
$d=\min(\ell/3,h_{lip}/(2\tan\theta_{lip}))$ keeps the curve monotone while matching the lip tangent
with finite curvature; a level or falling exit cannot overshoot, so it uses the full $d=\ell/3$.
To keep the slope increasing through the lip rather than rolling over near
the crest, kicker scenarios require

$$\tan\theta_{lip}\geq\frac{3h_{lip}}{2\ell}.$$

Workbench height and transition-length edits raise the lip angle to the next 0.01 rad step when
needed, and the angle control exposes that dynamic minimum. `drop` jumps are the exception: they
roll off an edge instead of kicking, so they waive that invariant and accept
$\theta_{lip}\in[-0.35,0.35]$ rad, where a negative angle crests before the edge and falls away.
Drops land below the lip and therefore require a negative `stepDelta`. Non-table gaps are true
voids: there is
no collider, rendered edge, or
height interpolation between the lip and landing. Table jumps instead receive a separate deck.
Vertical faces are stitched from the junction between neighbouring surfaces rather than assumed:
when the preceding surface ends at the landing start the face spans exactly those two surface
heights, and across a true gap the landing carries its own leading face up from its lowest point.
Faces are collidable body boundaries, so the renderer fills them as terrain instead of stroking
them as rideable surface. `landing-rollout` uses a cubic Bezier that begins at the requested
downslope and ends with a horizontal tangent before the flat rollout. Terrain coordinates are
quantized to 1 mm for exact native/WASM parity. General segments become static Rapier polyline
colliders. Landing contacts use the analytical cubic normal, and rollout contacts use a vertical
normal, so polyline facet boundaries cannot kick a wheel. Every segment
becomes its own static Rapier polyline collider and is exported unchanged for rendering. The solve
path limits sampled curve edges to approximately 0.05 m.

The dynamic body carries two zero-density ball colliders. In body-local coordinates their centres
are $(-L/2,r_w)$ and $(L/2,r_w)$. They define wheel contact only; both use zero friction and zero
restitution. Explicit additional mass properties supply the combined rider/bike mass, center of
gravity, and planar inertia described below.

The reported `(x, y)` is the world position of the body-local origin: the contact-line point below
the axle midpoint. Thus a level bike on flat ground of height $h$ has anchor $(x,h)$ and axle height
$h+r_w$. `pitch` is the solved body rotation in radians, positive counter-clockwise (nose-up) in a
world with `+x` forward and `+y` up. A local point is transformed by

$$
\begin{aligned}
x_w &= x + x_l\cos\theta-y_l\sin\theta,\\
y_w &= y + x_l\sin\theta+y_l\cos\theta.
\end{aligned}
$$

## Supporting contact and clearance

The solver reads each wheel's active Rapier contact pairs after every physics substep and accumulates
their non-negative total impulse magnitude until the next output frame. An active manifold means
the wheel is touching, but touching alone is not support: a zero-impulse manifold remains
non-supporting. Touching is retained internally for consistency assertions and is not a frame-buffer
field.

The implemented support threshold is exactly

$$\mathtt{CONTACT\_IMPULSE\_EPSILON}=10^{-5}\ \mathrm{N\,s}.$$

A wheel is grounded only when its accumulated impulse is strictly greater than this value. An
impulse at or below it is reported as zero. The bike is airborne exactly when neither wheel is
grounded; airborne frames therefore report zero total contact impulse and zero normal force.
`contactImpulse` is the sum of the two measured supporting impulses. Each wheel's `normalForce` is
its accumulated supporting impulse divided by the measured output interval, so it is an average
normal force over that interval rather than an instantaneous load.

`minClearance` is the smaller signed wheel-surface distance to the nearest actual terrain segment.
Negative values denote penetration. Canonical regression scenarios require
`minClearance >= -0.01 m` at every output frame. Clearance does not create support and is not used
to decide airborne state.

Authored-pose rider/bike clearance uses finite capsules, circles, and wheel rings with a 1 mm
zero-penetration tolerance. Because this is a side-view model, thigh, shank, upper-arm, and forearm
capsules occupy lateral rider planes while the top tube, down tube, seat tube, chainstay, and
seatstay occupy the bicycle center plane. Their 2D projected crossings are recorded in minimum
separation but are not collisions. Pelvis/top-tube direction and every rider collision with wheels,
crank or non-designated pedals, fork, head/steering, handlebar except the designated hand, and
saddle except inferred pelvis contact remain blocking.

Signed separation $q\geq-0.001\ \mathrm{m}$ counts as touching and passes; deeper overlap blocks the
design. This adds no safety gap. Matching hands/grips and feet/pedals are designated contacts, and
upper-saddle pelvis contact is inferred geometrically. Only authored pose keyframes are checked.
Interpolated poses between valid keys are not sampled for clearance and carry no clearance
guarantee.

## Representative mass properties

Bike mass-distribution model 1 preserves the authored total bike mass and allocates fixed shares:

| Component group         | Share |
| ----------------------- | ----: |
| Frame members           |  0.24 |
| Rear wheel and tire     |  0.10 |
| Front wheel and tire    |  0.09 |
| Fork and steering       |  0.15 |
| Cockpit                 |  0.07 |
| Drivetrain and crank    |  0.20 |
| Saddle and seat support |  0.06 |
| Rear hardware           |  0.09 |

Member-group mass is distributed by member length; wheels use their axles; drivetrain mass uses the
bottom bracket and rearward drive line; other groups use their canonical member centers and
landmarks. These shares sum to one and are representative constants, not measured component
weights or user controls. For elements with mass $m_i$, center $c_i$, and local planar inertia
$I_i$, the bicycle properties are

$$
c=\frac{\sum_i m_i c_i}{\sum_i m_i},\qquad
I=\sum_i\left(I_i+m_i\lVert c_i-c\rVert^2\right).
$$

Rider segment shares are placed on achieved pose landmarks and combined with the bicycle using the
same parallel-axis calculation. The solver updates the combined CoG and inertia as the sampled rider
pose changes; this is mass placement only and does not create independently articulated bodies or
rider-applied forces.

## Rider joint sign convention

Every represented rider joint uses one canonical, documented sign so achieved values, limits, and
displayed geometry agree across Pose and Workbench:

- **Knee, hip, spine**: authored, distance-relative targets. Positive values represent
  flexion in the direction that bends the joint toward a tucked riding posture; each target is the
  absolute angle (from vertical) of the segment it drives, not a relative bend at the joint. There
  is no ankle joint target: the foot is rigidly planted on the pedal contact (the `ankle` landmark
  always coincides with `pedalContact`), so ankle rotation carries no independent visual or
  physical meaning and was removed.
- **Shoulder, elbow**: calculated only. `shoulder` is the upper-arm segment's absolute angle
  (from the positive x-axis) that reaches the handlebar contact; `elbow` is the interior flexion
  angle between the upper arm and forearm. Neither has an authored target.

Rust clamps every authored/interpolated knee, hip, and spine target, and every calculated
shoulder/elbow value, to the active `RiderSpec.joints` limits before returning a sample (FR-021).
`PoseSample.derivedArm.constrained` is `true` when any target was clamped, the arm reach could not
be satisfied exactly, or the calculated shoulder/elbow value was clamped.

## What actually limits a pose

Because knee/hip/spine targets are _absolute segment angles_, their declared `RiderSpec.joints`
ranges are posture envelopes, not anatomical joint limits. They are deliberately wide, and resting
exactly on one is a valid pose — a `{joint}-joint-limit` conflict is raised only when an authored
target falls _outside_ its declared range, never when sampling clamps a value onto the boundary.

Two independent limits do the real work:

1. **Anatomical relative bends.** The bend between adjacent segments is what must stay possible:
   `kneeFlexion = knee - hip` (zero is a straight leg, negative is hyperextension) and
   `hipFlexion = pi - |wrap(spine - hip - pi)|` (zero is a straight hip). These raise
   `knee-hyperextension`, `knee-overflexion`, `hip-overextension`, and `hip-overflexion`. Without
   them, two individually in-range absolute targets could combine into a backward-bending knee.
2. **Bike contact clearance.** The saddle, top tube, handlebars and steering, tires, and pedals
   bound the pose through `rider-bike-overlap`, `saddle-crossing`, and `pelvis-below-top-tube`.
   Lateral limb/central-tube projections stay exempt (see `limitations.md`).

The `pelvis-below-top-tube` and saddle-contact rules measure from the seat contact
(`SEAT_CONTACT_DROP_RATIO` below the hip joint centre), not from a full pelvis radius: the hip
landmark is the joint centre, which sits near the bottom of the pelvis, so a full radius of
mandatory headroom would stop the rider well short of the frame.

## Rider kinematics (achieved pose landmarks)

Given rider dimensions (`height`, `legRatio`, `armRatio`) and bike dimensions (`wheelbase`,
`chainstay`, `bbHeight`), Rust derives one connected side-plane skeleton per sample:

1. **Segment lengths** (`rider_link_lengths`): thigh = 53% and shank = 47% of `height * legRatio`;
   upper arm = 55% and forearm = 45% of `height * armRatio`; torso =
   `max(height - legLength - armLength * 0.5, 0.2)`; head = `height * 0.12`.
2. **Bike contact points** (`bike_contact_points`): reference geometry matches a modern (2020s)
   size-large 29" trail/enduro hardtail (reach ~470 mm, stack ~630 mm, head angle ~65 deg from
   horizontal, effective seat angle ~76 deg from horizontal). The pedal contact is
   `crankRadius = 0.17 m` forward of the bottom bracket (`bbX = -wheelbase/2 + chainstay`,
   `bbY = bbHeight`); the handlebar contact is `x = bbX + reach(0.47) + stemForward(0.05)`,
   `y = bbY + stack(0.63) + barRise(0.03) + hip * 0.03`.
3. **Leg** (bottom-up, anchored at the pedal contact so the foot always coincides with the pedal):
   `ankle = pedalContact`; `knee = ankle + shankLength * (sin(knee), cos(knee))`;
   `hip = knee + thighLength * (sin(hip), cos(hip))`.
4. **Torso**: `shoulder = hip + torsoLength * (sin(spine), cos(spine))`;
   `head = shoulder + headLength * (sin(spine), cos(spine))`.
5. **Arm** (two-link reach from the shoulder to the handlebar contact, law-of-cosines solve):
   `elbow = shoulder + upperArmLength * (cos(shoulderAngle), sin(shoulderAngle))`, where
   `shoulderAngle = base - shoulderOffset` (subtracting, not adding, `shoulderOffset` from the
   shoulder-to-grip direction `base`) so the elbow tucks behind/below the arm rather than jutting
   forward past the hand. `shoulderAngle` is clamped to the declared shoulder joint limit before
   the elbow landmark is built, so the elbow never visually exceeds that limit (FR-021). `hand`
   always equals the handlebar contact exactly (hands stay locked to the grips); when the true
   shoulder-to-grip distance falls outside `[min_d, max_d]`, or the shoulder angle needed exceeds
   its declared limit, the elbow bend absorbs the infeasible reach instead and
   `derived_arm.constrained` reports it. A forward-leaning attack position typically needs a
   shoulder angle well past vertical-down (for example -90 to -140 deg), so the default rider's
   `shoulder` joint limit is asymmetric (for example `[-2.8, 1.4]` rad) rather than the narrower
   symmetric range used before this correction.

Both displayed arms share this achieved skeleton with a visual near/far offset. The displayed left
leg reuses the achieved thigh and shank lengths, solves its knee toward the diametrically opposite
pedal, and keeps its ankle on that pedal. Pose authoring accepts a candidate only when both leg
chains can reach their respective pedals without changing segment lengths.

Pose sampling still determines rider landmarks and motor-work telemetry, but it does not determine
body pitch.

## Frame layout and versions

Frame layout 2 contains 36 little-endian `Float32` values. It keeps the original fields through the
nine landmark pairs at offsets 0-30, then appends `groundedRear`, `groundedFront`,
`normalForceRear`, `normalForceFront`, and `minClearance`. `contactImpulse` now means measured total
normal impulse, while position, pitch, and airborne state use the definitions above. The complete
offset contract is in
[`frame-layout-v2.md`](../../specs/005-ground-contact-fidelity/contracts/frame-layout-v2.md).

Current identities are scenario schema 3, protocol 3, frame layout 2, logical persistence 2,
geometry model 1, mass-distribution model 1, model
`rigid-two-wheel-contact-v4-geometry-v1-mass-distribution-v1`, and solver
`rapier-0.35.2-two-wheel-contact-v5-geometry-v1-mass-distribution-v1`.

## Constraint work and energy accounting

At the start of every physics substep, the solver sets horizontal velocity to the scenario entry
speed while leaving vertical and angular velocity free. This is an external constraint that may add
or remove work; horizontal motion is not derived solely from contact forces. The tested accounting
uses translational mechanical energy

$$E=\frac12M(v_x^2+v_y^2)+Mgy$$

and checks

$$\Delta E=W_{speed\ constraint}+W_{contact}+R.$$

For each tested output-frame pair,
$W_{speed\ constraint}=\tfrac12M(v_{entry}^2-v_{x,previous}^2)$ and contact work is approximated by
the trapezoidal average of total reported normal force times anchor vertical displacement. The flat
equilibrium analytical test, after its first 20 frames, requires $|R|<1\ \mathrm{J}$. This is the
implemented test bound, not a claim of general rigid-body energy conservation; rotational kinetic
energy is not included in that test equation.

Canonical scenario JSON and frame/telemetry bytes are SHA-256 hashed. Repeat runs and native,
Node-WASM, Chromium, Firefox, and Playwright WebKit runs must produce identical result hashes.

## Numerical validation

- Fixed-step convergence is checked against analytical ballistic motion.
- Repeat runs must be byte-identical.
- Native and WASM results must match exactly for the golden scenario.
- Solver `dt` is one of $1/960$, $1/480$, $1/240$, $1/120$, or $1/60$ seconds, with 1-16
  substeps. Output is 60, 120, 240, 480, or 960 Hz and must divide the resulting fixed physics
  frequency exactly.
- CCD follows `solver.ccd` on the rigid body. Independently of that flag, the solve is rejected
  unless $v_{entry}(dt/N_{substeps})<r_w$; the equality boundary is covered by a regression test.
- On the flat analytical case, settled height drift is below 0.001 m and average measured normal
  force agrees with combined weight within 2%. Sustained airborne motion agrees with closed-form
  vertical ballistics within 0.01 m.
- Pure rider/contact geometry (segment lengths, connected endpoints, and required contacts) is
  verified in Rust to a `1e-5 m` tolerance; sampled joint transport across the worker boundary is
  verified to a `1e-4 rad` tolerance; continuous-mode adjacent-frame joint deltas are bounded to
  `0.05 rad` in dedicated fixtures.
- The standard solve p95 limit is 5 seconds; cancellation p95 is 250 ms.
- Stored replay is index-based and cannot feed back into the solver.

The validated input range is the intersection of the scenario schema, Rust validation, the
substep-displacement guard, and the exercised analytical/regression fixtures. Schema ranges are
summarized in [limitations.md](limitations.md); accepting a value is not evidence that every
combination has been calibrated or empirically validated.

## Known limitations

- Canonical landmarks use authored industry-style measurements, but protected component radii and
  mass shares remain versioned representative assumptions rather than measured tube profiles or
  component weights.
- Fork and rear-shock compression are shown using their configured static travel/sag; no measured
  suspension compression telemetry exists yet, so animated compression remains unavailable rather
  than invented.
- A one-time bundled correction (FR-021) aligned canonical rider joint limits (notably `knee` and
  `elbow`) with their authored flexion targets and achieved geometric ranges in
  `tests/fixtures/scenarios/standard-v1.json`; this did not change the scenario schema version or
  require user-data migration.
- A second bundled correction replaced the bike's schematic contact/frame proportions with the
  modern-hardtail reference geometry above (previously a much taller, farther, less realistic
  handlebar position) and widened the `spine` joint limit (from `[-0.6, 0.6]` to `[-0.6, 1.1]`
  rad) so an authored forward torso lean sufficient for a credible seated attack position is no
  longer silently clamped. Default `poseClip` keyframes across fixtures were retuned to a verified
  (numerically checked via `parity_probe`) crouched attack posture that keeps the derived arm
  unconstrained with a natural elbow bend.
- A third bundled correction removed the vestigial `ankle` rider joint entirely: it never drove the
  `ankle` landmark (always `pedalContact`), the then-used pose-derived pitch, or motor-work telemetry,
  so it was authorable but had no physical or visual effect. It also flipped the elbow IK branch (see the arm
  step above) and widened the `shoulder` joint limit (from `[-1.4, 1.4]` to `[-2.8, 1.4]` rad) to
  accommodate the corrected, more rearward elbow tuck without spurious clamping. That correction
  reduced the then-current pose payload from 32 to 31 `Float32` values; frame layout 2 later appended
  five ground-contact fields and now has stride 36. Older stored runs remain readable by
  name-addressed field lookup.
