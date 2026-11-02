# Follow-up Features

Work the current model deliberately leaves out, roughly in order of how much it would change
results. Each item changes physics output, so each one must publish a new model and solver version,
update the golden hash and parity fixtures, and add acceptance tests to
`crates/physics-core/tests`.

## Suspension

Make the fork and rear shock real prismatic joints with spring and damper forces from the stored
travel, sag, spring rate and damping. Landing loads would then compress the suspension before they
reach the rider, and preload and rebound would add to pop. Telemetry should report travel used.

## Variable rider inertia

Rider inertia is constant for the run. Folding and extending the body changes it, which matters for
in-air rotation. Computing inertia from the reconstructed skeleton each step needs care to keep
angular momentum exactly conserved.

## Rolling wheels and traction

Wheels are frictionless point masses. Rolling wheels with tire friction would add wheel inertia,
gyroscopic effects, braking and rolling resistance, and would let a front-wheel touchdown pitch the
bike realistically.

## Rider workspace

The workspace limits leg and arm reach but not saddle or top-tube contact, so under extreme loads a
fully folded rider can sink below the pedals. Adding those limits would make deep compressions
realistic.

## Ground balance control

The rider instinct only acts in the air. A ground controller (weighting the wheels, manualling)
would let authored poses be less exact.
