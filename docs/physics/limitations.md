# Physics Limitations

Jump Lab is a deterministic side-view teaching model. It is not a calibrated bicycle-dynamics,
equipment-rating or safety model. This page lists what it leaves out and where its numbers stop being
meaningful. See [model.md](model.md) for what it does model.

## Not modelled

- **Tires:** rigid, frictionless, non-rolling wheel colliders. No traction, braking, rolling
  resistance, tire deformation or restitution. Wheels are point masses, so wheel spin and gyroscopic
  effects are absent.
- **Suspension:** fork and rear-shock travel and sag are stored and drawn, but nothing compresses
  or rebounds. Landing loads go straight into the rigid frame and the rider's legs and arms.
- **Air:** no aerodynamic drag.
- **Rider anatomy:** the rider is one rigid body with constant inertia. Limbs are reconstructed
  kinematically from the rider's position for drawing, crash checks and workspace limits; they have
  no mass or dynamics of their own. The workspace limits leg and arm reach but not saddle or frame
  contact, so under extreme loads (about 4 g or more in a transition) a fully folded rider can sink
  below pedal height.
- **Rider control:** the rider follows the authored pose clip with a force-limited actuator. The only
  feedback is the bounded rider instinct in the air; there is no balance control on the ground, no
  pedalling and no braking.
- **Steering, lean and frame flex:** the bike is a rigid side-plane body; there is no third
  dimension.

## Numerical limits

- The physics rate must be at least 240 Hz. The schema rejects slower configurations, and the
  migration raises older scenarios to 240 Hz.
- At 240 Hz a heavy landing can push the rider about 8 cm past the skeletal stop for a few steps.
  Higher rates reduce it.
- Terrain is a polyline sampled at about 0.05 m. Contact normals are blended within 0.05 m of each
  vertex to stop vertex kicks; elsewhere they are the facet normals.
- A run ends 3 s after touchdown, at the end of the terrain, at 10 s, or when it stalls.
- WASM solves take about 300–370 ms for the standard scenario. The library speed window runs a sweep
  of solves and takes several seconds.

## Interpreting results

- **Forces** are interval averages of solver contact impulses, not load-cell measurements.
- **Landing classification** uses fixed thresholds: the sweet spot is 15–50% of the landing length
  and the attitude tolerance is 0.17 rad. Treat them as teaching labels, not safety criteria.
- **Crashes** mean that a reconstructed rider joint reached the terrain or the bike turned more than
  90° from the slope. They don't predict injury.
- **Speed windows** are reported as unavailable when no swept speed lands clean (the step-up preset
  is one example). An unavailable window is never shown as zero.
- **Pose clearance** uses finite rider and bike envelopes with a 1 mm touch tolerance. Only authored
  keyframes are checked; poses between keyframes are not.

## Input ranges

Scenario schema 4 accepts:

- **Jump:** lip height 0.2–4 m. Kicker lip angle 0.05–1.5 rad, with transition length derived from
  height and angle (0.5–30 m). Drop exit angle −0.35 to 0.35 rad with an authored length. Gap
  0–20 m, step delta −5 to 5 m (sign set by jump kind), landing angle 0.05–1.2 rad, landing length
  1–40 m, rollout 0–60 m.
- **Rider:** height 1.2–2.2 m, mass 35–160 kg, strength scale above 0 up to 3. Coupling frequencies
  5–80 rad/s, damping ratio 0.2–3, fore/aft strength 0.1–4, vertical strength 0.1–6, pitch lever
  0.05–1 m.
- **Instinct:** shift limit 0–0.25 m, lean limit 0–0.5 rad.
- **Bike:** 26, 27.5 or 29 inch wheels, wheelbase 0.8–1.5 m, mass 5–30 kg, and geometry within
  the geometry-model-1 ranges, which must close the steering assembly within 0.010 m.
- **Entry:** speed 0.5–30 m/s, start x −100 to −0.1 m.
- **Solver:** `dt` of 1/960 to 1/60 s with 1–16 substeps, at least 240 Hz in total, and output at
  60–960 Hz dividing the physics rate.

These ranges are what the schema accepts, not evidence that every combination has been tested.
