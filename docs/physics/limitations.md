# Physics Limitations

This is a deterministic side-view teaching model, not a calibrated production bicycle-dynamics or
safety model. It now resolves segmented terrain and measured two-wheel normal contact, but the
following boundaries remain.

## Excluded effects

- Tire friction, rolling resistance, tire deformation, contact restitution, and unmodelled damping
  are zero. The solver therefore does not model traction, braking, cornering, drivetrain force,
  energy loss through rolling, tire compliance, or a calibrated impact patch.
- Aerodynamic drag is zero.
- Rider and bicycle are one rigid body. Achieved rider pose changes the body's representative CoG
  and planar inertia, but no limb is an independently articulated body and rider movement applies no
  force or momentum exchange.
- Fork and rear-shock travel, sag, spring rate, and damping remain scenario data, but suspension
  compression, rebound, and dynamic loading are not solved. Frame type does not select different
  contact dynamics.
- Reported normal force is measured solver impulse divided by the output measurement interval. It is
  a deterministic interval-average support load, not calibrated load-cell, component-stress, or
  injury evidence.
- After genuine flight reaches 0.05 m clearance, a solve ends 3 seconds after the first subsequent
  grounded frame, at the end of modeled terrain, or at the 10 second total limit. Terrain curve
  edges are sampled at approximately 0.05 m and coordinates are quantized to 1 mm.

## External horizontal-speed constraint

Horizontal velocity is reset to `entry.speed` before every physics substep. Any energy added or
removed by that reset is externally supplied constraint work; it is not produced by gravity,
traction, pedalling, or a drivetrain model. Energy validation includes this work explicitly, as
documented in [model.md](model.md). Results must not be interpreted as slope-driven acceleration,
deceleration, or speed loss on impact.

## Temporary Principle II exception

Feature 005 has an approved, temporary exception to Constitution Principle II. The project
maintainer owns it, and its scope is only terrain agreement, non-penetration, and measured normal
contact for a combined rigid rider/bike body with two wheel colliders.

The exception expires before the product claims that rider posture or movement, suspension setup,
or frame type affects takeoff, flight, landing, or contact loads. Retirement requires a follow-up
model of rider position and weight transfer, active rider movement, suspension compression and
rebound, and their coupled effects on takeoff, airborne rotation, landing, and ground loads. That
required work is registered in
[follow-up-features.md](../architecture/follow-up-features.md) and must publish a new model version
with analytical, energy, angular-motion, and regression validation.

## Validated range

Scenario schema 3 accepts the following finite input ranges:

- Jump: lip height 0.2-4 m, lip angle 0.05-1.5 rad, transition length 0.5-30 m, gap 0-20 m,
  step delta -5 to 5 m with jump-kind sign rules, landing angle 0.05-1.2 rad, landing length
  1-40 m, and rollout 0-60 m.
- Rider: height 1.2-2.2 m, mass 35-160 kg, leg ratio 0.35-0.6, arm ratio 0.3-0.5, and strength
  scale greater than 0 through 3.
- Bike: 26, 27.5, or 29 inch wheels; wheelbase 0.8-1.5 m; chainstay 0.3-0.65 m; bottom-bracket
  height 0.2-0.5 m; mass 5-30 kg. Geometry model 1 permits reach 0.3-0.6 m, stack 0.45-0.8 m,
  head-tube length 0.06-0.25 m, head angle 0.87-1.4 rad, fork length 0.3-0.65 m, fork offset
  0-0.1 m, seat-tube length 0.25-0.65 m, seat angle 1.05-1.45 rad, saddle height 0.3-0.9 m,
  saddle setback -0.15-0.25 m, crank length 0.145-0.19 m, and handlebar x/y offsets
  -0.1-0.3 m and -0.15-0.25 m. Valid values must also form the chainstay triangle and close the
  steering assembly within 0.010 m. Suspension data permits travel 0-0.3 m and sag 0-0.12 m with
  `sag <= travel`, but those values are not dynamically solved.
- Entry: speed 0.5-30 m/s and start x -100 to -0.1 m.
- Solver: `dt` of $1/960$, $1/480$, $1/240$, $1/120$, or $1/60$ s; 1-16 substeps; output at
  60, 120, 240, 480, or 960 Hz dividing the physics frequency exactly. The solver additionally
  rejects configurations where horizontal travel per substep is at least one wheel radius.

These are acceptance ranges, not evidence that every cross-product has been tested. Canonical
ground-contact regressions establish at most 0.01 m penetration at reported frames; flat analytical
tests establish less than 0.001 m settled height drift and normal force within 2% of combined
weight; an airborne reference interval matches vertical ballistics within 0.01 m; and the tested
flat-run energy residual is below 1 J. Do not extrapolate these bounds to safety, injury,
equipment-rating, or real-world jump-design advice.

Authored-pose clearance uses finite rider and protected-bike envelopes. Signed separation down to
-0.001 m is treated as boundary touch; this numerical tolerance is not a safety clearance. Only
authored keyframes gate solving. Interpolated poses are not clearance-tested. Projected crossings
between limb capsules (thigh, shank, upper arm, forearm) in lateral rider planes and central frame
tubes (top, down, seat, chainstay, seatstay) are exempt in this side-view model. The exception does
not establish a measured lateral offset and does not apply to wheels, crank/pedals, fork,
head/steering, handlebar, saddle, pelvis, torso, head, hands, or feet.

## UI and validation boundaries

- Scenario schema 3, protocol 3, frame layout 2, model
  `rigid-two-wheel-contact-v4-geometry-v1-mass-distribution-v1`, and solver
  `rapier-0.35.2-two-wheel-contact-v5-geometry-v1-mass-distribution-v1` identify the current
  evidence boundary.
- Validation rows labelled `representative-fixture` are deterministic presentation fixtures, not
  substitute solver, convergence, determinism, or parity evidence.
- Library speed windows may be measured or unavailable; unavailable windows never display a zero
  range. Report comparisons remain blank when assumptions, units, schema, or metric definitions differ.
- Canvas and SVG output is intended for explanation and regression review, not engineering drawings,
  equipment ratings, injury predictions, or safety certification.
- Bicycle landmarks use authored side-view measurements, but envelope radii, component mass shares,
  and rider segment shares remain representative assumptions. CoG and inertia are deterministic
  estimates, not scales, structural analysis, fit certification, or measured component properties.
- Fork and rear-shock compression are shown at their configured static travel/sag; no measured
  suspension compression telemetry exists yet, so animated compression remains unavailable rather
  than invented.
- Bicycle dimensions remain static throughout a scenario. The model has no bicycle keyframes,
  steering motion, frame flex, manufacturing tolerances, material strength, fatigue, component-load
  ratings, three-dimensional fit, or crash/injury prediction. Canvas output is not an engineering
  drawing, bike-fit prescription, jump-design approval, or safety certification.
