# Bike Geometry and Clearance Contract

## Authority and Units

`physics-core` is the sole authority for bike-local landmarks, members, protected shapes, rider
contacts, geometry closure, center of gravity, inertia, and pose clearance. Persisted new lengths are
metres and angles are radians. Designer may display millimetres and degrees but must convert only at
the input/output boundary.

Coordinates use positive x forward and positive y up. The body transform places this static local
geometry into each run frame; whole-bike pitch does not change local rider-to-bike clearance.

## Canonical Landmark Construction

Given wheel radius $r$, wheelbase $w$, chainstay length $c$, and bottom-bracket height $h$:

$$
R = (-w/2, r), \qquad F = (w/2, r)
$$

$$
B_y = h, \qquad B_x = R_x + \sqrt{c^2 - (h-r)^2}
$$

The square-root argument must be non-negative. Reach and stack place the head-tube top:

$$
H_t = (B_x + \text{reach}, B_y + \text{stack})
$$

For head angle $\theta_h$ measured from forward horizontal, the down-forward axis is
$d_h=(\cos\theta_h,-\sin\theta_h)$. Head-tube bottom is
$H_b=H_t+L_h d_h$. Fork length and offset predict front axle $F'$ using the same axis and its
forward perpendicular. Geometry closes when $\lVert F'-F\rVert\leq0.010\ \text{m}$.

For seat angle $\theta_s$, the up-rear axis is $d_s=(-\cos\theta_s,\sin\theta_s)$. Seat-tube top,
saddle center, and setback derive from the bottom bracket and this axis. Handlebar contact is the
head-tube top plus the authored x/y offsets. Pedal contacts are opposite points at authored crank
length, with the active contact initially at the forward horizontal position.

All returned landmarks are finite. Applied members connect exactly at returned endpoints; the front
fork draws to the exact wheelbase-defined axle after closure passes.

## Geometry Issue Contract

Geometry inspection returns every applicable issue in deterministic order: field range, impossible
chainstay/BB triangle, zero-length or inverted member, steering closure, disconnected contact,
self-intersection, then frame/suspension relationship. Each issue includes a stable code and affected
field paths. Rendering may preview finite draft members but may not hide, snap, or repair an issue.

## Protected Geometry

The geometry result supplies the same named shapes used by clearance and drawing:

- Ring envelopes for both tires and rims.
- Capsule members for chainstays, seatstays, seat tube, top tube, down tube, head tube, fork, seat
  support, crank arms, and handlebar/stem.
- A saddle envelope with a one-sided permitted upper contact surface.
- Pedal and grip contact regions with designated foot and hand exemptions.
- Versioned representative radii for components without authored thickness controls.

Absent frame members produce neither a drawing member nor a protected shape.

## Rider Envelope

Rider centerlines come from the achieved pose landmarks. Limbs and torso use height-scaled capsules;
the pelvis and head use finite circles/compound shapes. Envelope ratios are versioned model constants
and are used identically by clearance diagnostics and rendering. A centerline-only test is forbidden.

## Clearance Rules

For every rider-shape/bike-shape pair, calculate signed closest separation $q$. The pair passes when

$$
q \geq -0.001\ \text{m}.
$$

Values within the 1 mm tolerance count as boundary touching, not penetration. There is no extra
safety gap. Report the global minimum and every violating pair in stable part-name order.

Side-view collision layers treat the thigh, shank, upper-arm, and forearm capsules as occupying
lateral rider planes and the `topTube`, `downTube`, `seatTube`, `chainstay`, and `seatstay` capsules
as occupying the bicycle center plane. A projected crossing only between one of those limb capsules
and one of those central frame tubes is not a collision. This pair exception does not remove either
shape from geometry or minimum-separation telemetry and does not apply to pelvis/top-tube direction,
wheels, crank or pedals, fork, head/steering, handlebar, saddle, torso, head, hands, or feet.

Hand-to-grip and foot-to-pedal contacts are permitted only for their matching body parts. Pelvis
contact is inferred when the lower pelvis reaches the saddle's upper contact surface; touching or
resting is allowed while crossing through the saddle remains invalid. Contact exemptions do not
disable collision against the rest of the owning component.

The pelvis must remain on or above the top-tube boundary while horizontally within that member's
span. This directional rule is reported separately from generic shape overlap.

Only authored pose keys are checked. Interpolated movement is deliberately outside the clearance
gate.

## Direct Edit Resolution

The resolver receives one valid baseline and one requested target vector. A valid request is returned
unchanged. For an invalid request, run a fixed number of bisection iterations on the target-space
segment from baseline to request and return the furthest valid value. The response reports conflicts
from the original request and validation for the accepted value. It never searches unrelated poses.

Batch validation after bike changes never calls edit resolution and never rewrites pose targets.

## Representative Bike Mass Distribution

Model version 1 assigns authored bike mass using fixed shares that sum to one:

| Component group | Share | Placement basis |
| --- | --- | --- |
| Frame members | 0.24 | Length-weighted member midpoints |
| Rear wheel/tire | 0.10 | Rear axle |
| Front wheel/tire | 0.09 | Front axle |
| Fork and steering | 0.15 | Fork/head member centers |
| Cockpit | 0.07 | Head top to grip |
| Drivetrain and crank | 0.20 | Bottom bracket and rearward drive line |
| Saddle and seat support | 0.06 | Seat axis and saddle center |
| Rear hardware | 0.09 | Rear axle/frame junction region |

The model computes weighted CoG and planar inertia using component-local inertia plus the
parallel-axis theorem. Rider segment masses use the existing anthropometric distribution at achieved
landmarks. Their combined mass properties replace the current approximation that puts all rider and
bike mass uniformly into two wheel colliders.

These shares are an explicit approximation, not measured component weights. Documentation and
version metadata must name the distribution version.

## Versioning and Determinism

- Scenario and scenario-file versions become 3.
- Geometry/envelope model version starts at 1.
- Model and solver identifiers change because contacts and mass properties affect motion.
- Frame layout remains unchanged unless mass-property telemetry is added to each frame.
- Native and WASM geometry, validation, CoG, inertia, and solve outputs must match within documented
  float tolerance; repeated identical inputs must be byte-stable where JSON canonicalization applies.
