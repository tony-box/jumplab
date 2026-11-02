# Physics Model

Jump Lab simulates a mountain bike and rider in the side plane. The rider's authored body position
drives how the bike moves through a jump: the rider is a separate body that pushes and pulls on the
bike through the pedals and grips, so pumping a transition, popping off a lip, and rotating in the
air come from the pose rather than from scripted motion.

- Scenario schema 4, worker protocol 4, frame layout 3, telemetry layout 2.
- Model `two-body-rider-coupling-v1-geometry-v1-mass-distribution-v2`.
- Solver `rapier-0.35.2-two-body-v6-geometry-v1-mass-distribution-v2`.

All quantities are SI: metres, seconds, kilograms, newtons, radians. Angles are counter-clockwise
positive; world $+x$ points downhill along the run and $+y$ points up. Gravity is $9.81\ \mathrm{m/s^2}$.

## Bodies

| Body  | Collider                     | Mass         | Inertia                                                |
| ----- | ---------------------------- | ------------ | ------------------------------------------------------ |
| Bike  | Two wheel balls at the axles | `bike.mass`  | Frame and wheels as point masses at measured landmarks |
| Rider | None                         | `rider.mass` | From the segment model in the reference pose           |

Both inertias are constant for the run. The rider body has no collider: it touches the world only
through the bike. Wheels are rigid, frictionless and do not roll; suspension travel is stored but not
simulated (see [limitations.md](limitations.md)).

## Terrain

The approach is flat. Kickers are circular arcs that start tangent to the approach and leave the lip
at the lip angle, so the transition length is derived:

$$L = h \cot(\theta/2)$$

for lip height $h$ and lip angle $\theta$. Drops keep an authored length and a Bezier edge whose exit
angle may be level or falling (−0.35 to 0.35 rad). The landing is a straight slope followed by a flat
rollout. Terrain is a polyline sampled at about 0.05 m.

Ball-on-polyline contact kicks a wheel at every vertex and loses energy. A contact hook therefore
replaces the contact normal with a normal blended between the two adjacent facets, only within
0.05 m of each vertex, so long facets keep their true normal.

## Entry speed

`entry.speed` is the bike's speed at `entry.startX`. It is applied once. After that only gravity,
terrain contact and the rider's internal forces change the motion, so the bike slows up the kicker
and speeds up down the landing.

## Rider coupling

The pose clip is sampled by distance travelled, $s = \max(s_{prev}, x_{bike})$, which never goes
backwards. Each sample passes through the kinematic skeleton (feet on pedals, hands on grips) and
yields a target rider centre of mass $\mathbf{c}^*$ and torso angle $\phi^*$ in bike-local axes.

A force-limited PD actuator pulls the rider toward that target. For each linear axis, with rider mass
$m_r$, reduced mass $\mu = m_r m_b / (m_r + m_b)$, natural frequency $\omega$ and damping ratio
$\zeta$:

$$k = m_r \omega^2, \qquad d = 2 \zeta m_r \omega$$

$$F = \frac{k e - (k\,\Delta t + d)\,\dot e}{1 + (k\,\Delta t^2 + d\,\Delta t)/\mu}$$

where $e$ is the target-minus-current error and $\dot e$ the current-minus-target rate. This is the
backward-Euler form, which stays stable at every supported step. Torque uses the same form with rider
inertia, the reduced inertia and the pitch frequency.

Forces are clamped to the rider's strength. With weight $W = m_r g \cdot$ `strengthScale`:

| Axis           | Limit                        | Default |
| -------------- | ---------------------------- | ------- |
| Fore/aft force | $W \cdot$ `foreAftStrength`  | 1.5     |
| Vertical force | $W \cdot$ `verticalStrength` | 3       |
| Torque         | $W \cdot$ `pitchLever` (m)   | 0.4     |

Default frequencies are 30 rad/s (linear) and 25 rad/s (pitch) with damping ratio 1.

Every actuator force is applied to the rider at its centre of mass, and the equal and opposite force
to the bike at the same world point; torques are likewise paired. The rider can only move momentum
between the two bodies. It never adds net external force or torque, so total linear and angular
momentum change only through gravity and ground contact.

### Skeletal stop

When the bike pushes the rider outside the reachable workspace (legs fully folded, arms fully
straight), a one-sided stiff spring at 160 rad/s carries the load. It is not limited by strength:
bones take that load, not muscles. At 240 Hz a heavy landing can overshoot the stop by about 8 cm
for a few steps.

### Rider instinct

With `solver.riderInstinct.enabled`, the rider makes small corrections in the air, the way a real
rider levels the bike for landing. Every 8 physics steps it predicts touchdown by integrating the
system's centre of mass ballistically and conserving angular momentum about it, assuming the
authored pose schedule continues. It then picks the fore/aft shift and lean, within `maxOffset`
(default 0.10 m) and `maxAngle` (default 0.17 rad), that best match the bike to the landing slope.
Corrections blend in and out with a 0.08 s time constant, are held during the last 0.05 s before
predicted touchdown, and are off whenever a wheel is on the ground. The authored pose is still the
main input: instinct is bounded and reported in the metrics.

## Integration

Rapier 0.35.2 with enhanced determinism. Supported `dt` is 1/960 to 1/60 s with 1–16 substeps, but
the effective physics rate must be at least 240 Hz; slower rates diverge with these contact and
coupling stiffnesses. Output is sampled at 60–960 Hz, which must divide the physics rate.

A run ends 3 s after the first touchdown, at the end of the terrain, at 10 s, or when progress stalls
(less than 0.05 m in 1 s).

## Events and outcome

Takeoff is the substep at which both wheels leave the ground after the lip; touchdown is the first
substep at which either wheel touches again. Each is recorded with its exact time and state.

A crash latches when the head, shoulder, hip, elbow or knee of the achieved skeleton reaches the
terrain, or when the bike is more than 90° from the terrain slope. The simulation keeps running
after a crash so the rollout stays visible.

The landing is classified by where and how the bike lands:

| Region     | Rule                                          |
| ---------- | --------------------------------------------- |
| Case       | First contact before the landing slope starts |
| Early      | Within the first 15% of the landing           |
| Sweet spot | 15–50% of the landing length                  |
| Late       | Past 50% of the landing                       |
| Overshoot  | Past the end of the landing                   |

Attitude is balanced when bike pitch is within 0.17 rad of the slope, otherwise nose-heavy or
tail-heavy. Severity and reasons are reported with the outcome.

## Metrics

Metrics come from the simulation; anything the model can't measure carries the source
`unavailable` and a reason instead of a number.

- **Takeoff:** speed and launch angle at the takeoff event. The launch angle is usually below the lip
  angle because the rider absorbs part of the lip.
- **Air:** airtime, jump distance, peak height above the lip, bike rotation.
- **Landing:** touchdown x, offset from the sweet-spot centre, pitch error against the slope, impulse
  and average force over the first 0.2 s, peak normal force.
- **Rider:** positive and negative actuator work, mean pose tracking error, and instinct lean, shift
  and time at its limit.
- **Energy:** the balance residual
  $\Delta(KE + PE) - W_{actuator} + E_{impact}$, and the energy lost at impact.

## Speed window

The library's entry-speed window is a sweep of real solves from 2 to 18 m/s in 1 m/s steps, refined
five times at each edge. The window is the widest interval of clean landings. If no speed lands clean,
the window is reported as unavailable, never as zero.

## Validation

`crates/physics-core/tests` holds the acceptance tests:

- **Analytical:** flat settling height and support load, ballistic flight, and energy on ramps.
- **Dynamics:** momentum is conserved by the coupling, pumping a concave transition adds speed
  compared with flat ground, launch direction follows the lip, a backward lean rotates the bike
  nose-up, instinct reduces landing pitch error within its bounds, and crashes are detected.
- **Convergence:** results at 240, 480 and 960 Hz agree.
- **Determinism:** a golden result hash for the standard scenario, plus repeat runs.

`tests/parity` checks that native Rust, Node WASM and Chromium, Firefox and WebKit produce the same
result hash, pose, geometry and design validation.
