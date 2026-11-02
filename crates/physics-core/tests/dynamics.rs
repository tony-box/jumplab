//! Acceptance tests for the two-body rider/bicycle model: the authored pose must move the bike
//! through internal forces only, with momentum and energy accounted for.

use physics_core::rider_dynamics::CouplingGains;
use physics_core::scenario::{JumpKind, PoseKey, PoseTargets, Scenario};
use physics_core::simulation::{SimFrame, Simulation, SimulationOptions, simulate};

const STANDARD_SCENARIO: &str = include_str!("../../../tests/fixtures/scenarios/standard-v1.json");

fn standard() -> Scenario {
    serde_json::from_str(STANDARD_SCENARIO).expect("valid standard scenario")
}

/// A long gap with a gentle transition so the bike spends about a second in the air.
fn long_flight() -> Scenario {
    let mut scenario = standard();
    scenario.jump.kind = JumpKind::Gap;
    scenario.jump.transition_length = 3.0;
    scenario.jump.lip_angle = 0.82;
    scenario.jump.gap = 7.0;
    scenario.jump.landing_length = 12.0;
    scenario.entry.speed = 9.0;
    scenario
}

fn targets(knee: f32, hip: f32, spine: f32) -> PoseTargets {
    PoseTargets { knee, hip, spine }
}

fn key(s: f32, targets: PoseTargets) -> PoseKey {
    PoseKey {
        s,
        label: format!("s{s}"),
        targets,
    }
}

fn with_keys(mut scenario: Scenario, keys: Vec<PoseKey>) -> Scenario {
    scenario.pose_clip.keys = keys;
    scenario
}

const NEUTRAL: (f32, f32, f32) = (0.3, -0.5, 0.75);

fn neutral_keys() -> Vec<PoseKey> {
    let (knee, hip, spine) = NEUTRAL;
    vec![
        key(-10.0, targets(knee, hip, spine)),
        key(40.0, targets(knee, hip, spine)),
    ]
}

fn run(scenario: &Scenario) -> Simulation {
    simulate(
        scenario,
        &SimulationOptions {
            gains: None,
            reconstruct: true,
        },
    )
    .expect("simulation succeeds")
}

fn flight_range(simulation: &Simulation) -> (usize, usize) {
    let frames = &simulation.frames;
    let start = frames
        .iter()
        .position(|frame| frame.airborne && frame.min_clearance > 0.05)
        .expect("the run reaches real flight");
    let end = frames[start..]
        .iter()
        .position(|frame| !frame.airborne)
        .map(|offset| start + offset)
        .expect("the run lands");
    (start, end)
}

/// Angular momentum of both bodies about their combined centre of mass.
fn angular_momentum_about_com(simulation: &Simulation, frame: &SimFrame) -> f32 {
    let inertia = &simulation.inertia;
    let total = inertia.bike_mass + inertia.rider_mass;
    let com_x =
        (inertia.bike_mass * frame.bike.com.x + inertia.rider_mass * frame.rider.com.x) / total;
    let com_y =
        (inertia.bike_mass * frame.bike.com.y + inertia.rider_mass * frame.rider.com.y) / total;
    let vel_x = (inertia.bike_mass * frame.bike.velocity.x
        + inertia.rider_mass * frame.rider.velocity.x)
        / total;
    let vel_y = (inertia.bike_mass * frame.bike.velocity.y
        + inertia.rider_mass * frame.rider.velocity.y)
        / total;
    [
        (&frame.bike, inertia.bike_mass, inertia.bike_inertia),
        (&frame.rider, inertia.rider_mass, inertia.rider_inertia),
    ]
    .iter()
    .map(|(body, mass, rotational)| {
        let rx = body.com.x - com_x;
        let ry = body.com.y - com_y;
        let vx = body.velocity.x - vel_x;
        let vy = body.velocity.y - vel_y;
        rotational * body.angular_velocity + mass * (rx * vy - ry * vx)
    })
    .sum()
}

fn residual_energy(frame: &SimFrame) -> f32 {
    frame.energy - frame.actuator_work
}

#[test]
fn rider_and_bike_conserve_momentum_in_flight_under_changing_targets() {
    let (knee, hip, _) = NEUTRAL;
    let scenario = with_keys(
        long_flight(),
        vec![
            key(-10.0, targets(knee, hip, 0.75)),
            key(4.0, targets(knee, hip, 0.75)),
            key(5.0, targets(knee, hip, 1.4)),
            key(6.0, targets(knee, hip, 0.2)),
            key(40.0, targets(knee, hip, 0.75)),
        ],
    );
    let simulation = run(&scenario);
    let (start, end) = flight_range(&simulation);
    let flight = &simulation.frames[start + 1..end];
    assert!(
        flight.len() > 60,
        "expected a long flight, got {} frames",
        flight.len()
    );

    let total_mass = simulation.inertia.bike_mass + simulation.inertia.rider_mass;
    let reference_l = angular_momentum_about_com(&simulation, &flight[0]);
    for pair in flight.windows(2) {
        let dt = pair[1].t - pair[0].t;
        let expected_vy = pair[0].linear_momentum.y / total_mass - 9.81 * dt;
        assert!((pair[1].linear_momentum.x - pair[0].linear_momentum.x).abs() < 1.0e-2);
        assert!((pair[1].linear_momentum.y / total_mass - expected_vy).abs() < 1.0e-3);
    }
    for frame in flight {
        let drift = angular_momentum_about_com(&simulation, frame) - reference_l;
        assert!(
            drift.abs() < 0.05,
            "angular momentum drifted by {drift} at t={}",
            frame.t
        );
    }
}

#[test]
fn leaning_the_torso_in_the_air_counter_rotates_the_bike() {
    let (knee, hip, spine) = NEUTRAL;
    let neutral = run(&with_keys(long_flight(), neutral_keys()));
    let leaning = run(&with_keys(
        long_flight(),
        vec![
            key(-10.0, targets(knee, hip, spine)),
            key(4.0, targets(knee, hip, spine)),
            key(6.0, targets(knee, hip, spine + 0.6)),
            key(40.0, targets(knee, hip, spine + 0.6)),
        ],
    ));
    let (start, end) = flight_range(&neutral);
    let probe_t = neutral.frames[start].t + 0.8 * (neutral.frames[end].t - neutral.frames[start].t);
    let at = |simulation: &Simulation| {
        simulation
            .frames
            .iter()
            .find(|frame| frame.t >= probe_t)
            .expect("probe frame")
            .clone()
    };
    let (neutral_frame, leaning_frame) = (at(&neutral), at(&leaning));
    assert!(leaning_frame.airborne);

    // Leaning forward turns the rider clockwise, so the bike must turn counter-clockwise.
    let rider_turn = leaning_frame.rider.angle - neutral_frame.rider.angle;
    let bike_turn = leaning_frame.bike.angle - neutral_frame.bike.angle;
    assert!(rider_turn < -0.1, "rider turned {rider_turn}");
    assert!(bike_turn > 0.1, "bike turned {bike_turn}");
}

#[test]
fn shifting_the_hips_in_the_air_rotates_the_bike() {
    let neutral = run(&with_keys(long_flight(), neutral_keys()));
    let (knee, hip, spine) = NEUTRAL;
    let shifted = run(&with_keys(
        long_flight(),
        vec![
            key(-10.0, targets(knee, hip, spine)),
            key(4.0, targets(knee, hip, spine)),
            key(6.0, targets(knee + 0.4, hip - 0.4, spine)),
            key(40.0, targets(knee + 0.4, hip - 0.4, spine)),
        ],
    ));
    let (start, end) = flight_range(&neutral);
    let probe_t = neutral.frames[start].t + 0.8 * (neutral.frames[end].t - neutral.frames[start].t);
    let pitch = |simulation: &Simulation| {
        simulation
            .frames
            .iter()
            .find(|frame| frame.t >= probe_t)
            .expect("probe frame")
            .bike
            .angle
    };
    let difference = pitch(&shifted) - pitch(&neutral);
    assert!(
        difference.abs() > 0.05,
        "hip shift changed pitch by only {difference}"
    );
}

#[test]
fn extending_at_the_lip_pops_the_system_higher() {
    let mut scenario = standard();
    scenario.jump.transition_length = 3.0;
    scenario.entry.speed = 8.0;
    let compressed = targets(0.9, -1.0, 0.85);
    let extended = targets(0.15, -0.25, 0.6);
    let lip = scenario.jump.transition_length;
    let held = run(&with_keys(
        scenario.clone(),
        vec![
            key(-10.0, compressed.clone()),
            key(40.0, compressed.clone()),
        ],
    ));
    let popped = run(&with_keys(
        scenario,
        vec![
            key(-10.0, compressed.clone()),
            key(lip - 1.6, compressed),
            key(lip - 0.2, extended.clone()),
            key(40.0, extended),
        ],
    ));
    let launch_vy = |simulation: &Simulation| {
        let total = simulation.inertia.bike_mass + simulation.inertia.rider_mass;
        let (start, _) = flight_range(simulation);
        simulation.frames[start].linear_momentum.y / total
    };
    let (held_vy, popped_vy) = (launch_vy(&held), launch_vy(&popped));
    assert!(
        popped_vy > held_vy + 0.2,
        "pop launched at {popped_vy} m/s vertical versus {held_vy} m/s held"
    );
    let (start, _) = flight_range(&popped);
    assert!(
        popped.frames[start].actuator_work_positive > held.frames[start].actuator_work_positive
    );
}

#[test]
fn pumping_through_a_concave_transition_gains_speed() {
    // Extending where the terrain curves up pushes against a normal force larger than weight,
    // so the rider does more work than the potential energy it adds. The same extension on flat
    // ground only buys back exactly the potential energy it costs.
    let mut scenario = standard();
    scenario.jump.kind = JumpKind::Table;
    scenario.jump.lip_height = 0.0;
    scenario.jump.lip_angle = 0.05;
    scenario.jump.gap = 0.0;
    scenario.jump.landing_angle = 0.6;
    scenario.jump.landing_length = 6.0;
    scenario.entry.speed = 4.0;
    let compressed = targets(0.9, -1.0, 0.85);
    let extended = targets(0.15, -0.25, 0.6);
    let slope_start = scenario.jump.transition_length + scenario.jump.gap;
    let slope_end = slope_start + scenario.jump.landing_length;
    let extend_between = |from: f32, to: f32| {
        run(&with_keys(
            scenario.clone(),
            vec![
                key(-10.0, compressed.clone()),
                key(from, compressed.clone()),
                key(to, extended.clone()),
                key(60.0, extended.clone()),
            ],
        ))
    };
    let in_transition = extend_between(slope_end - 3.5, slope_end - 0.5);
    let on_flat = extend_between(slope_end + 3.0, slope_end + 6.0);
    let exit_x = slope_end + 9.0;
    let exit_speed = |simulation: &Simulation| {
        let total = simulation.inertia.bike_mass + simulation.inertia.rider_mass;
        let frame = simulation
            .frames
            .iter()
            .find(|frame| frame.bike_origin.x >= exit_x)
            .expect("reaches the run-out");
        frame.linear_momentum.x / total
    };
    let (flat_speed, pumped_speed) = (exit_speed(&on_flat), exit_speed(&in_transition));
    assert!(
        pumped_speed > flat_speed + 0.05,
        "pumping the transition exited at {pumped_speed} m/s versus {flat_speed} m/s on the flat"
    );
}

#[test]
fn energy_balance_closes_on_flat_ground_ramps_and_in_flight() {
    let mut scenario = long_flight();
    scenario.jump.transition_length = 5.0;
    scenario.jump.lip_angle = 0.6;
    let simulation = run(&scenario);
    let frames = &simulation.frames;
    let initial_kinetic = 0.5
        * (simulation.inertia.bike_mass + simulation.inertia.rider_mass)
        * scenario.entry.speed
        * scenario.entry.speed;

    let approach_end = frames
        .iter()
        .position(|frame| frame.bike_origin.x > -1.0)
        .expect("approach");
    let settled = &frames[20..approach_end];
    let flat_drift = residual_energy(settled.last().unwrap()) - residual_energy(&settled[0]);
    assert!(
        flat_drift.abs() < 0.5,
        "flat approach drifted {flat_drift} J"
    );

    let lip_frame = frames
        .iter()
        .position(|frame| frame.bike_origin.x > scenario.jump.transition_length - 0.7)
        .expect("lip");
    let ramp_loss = residual_energy(&frames[lip_frame]) - residual_energy(&frames[approach_end]);
    assert!(
        ramp_loss.abs() < 0.01 * initial_kinetic,
        "ramp changed residual energy by {ramp_loss} J"
    );

    let (start, end) = flight_range(&simulation);
    let flight_drift = residual_energy(&frames[end - 1]) - residual_energy(&frames[start + 1]);
    assert!(flight_drift.abs() < 0.5, "flight drifted {flight_drift} J");
}

#[test]
fn every_supported_step_stays_stable_with_saturating_actuators() {
    let (knee, hip, spine) = NEUTRAL;
    let rates: [(f32, u32); 6] = [
        (1.0 / 240.0, 1),
        (1.0 / 480.0, 1),
        (1.0 / 960.0, 1),
        (1.0 / 240.0, 4),
        (1.0 / 120.0, 2),
        (1.0 / 60.0, 4),
    ];
    for (dt, substeps) in rates {
        let mut scenario = with_keys(
            long_flight(),
            vec![
                key(-10.0, targets(knee, hip, spine)),
                key(2.0, targets(0.9, -1.0, 0.9)),
                key(3.0, targets(0.1, -0.2, 0.4)),
                key(6.0, targets(knee, hip, spine + 0.6)),
                key(40.0, targets(knee, hip, spine)),
            ],
        );
        scenario.solver.dt = dt;
        scenario.solver.substeps = substeps;
        scenario.solver.output_hz = 60;
        let simulation = run(&scenario);
        assert!(simulation.frames.len() > 60);
        for frame in &simulation.frames {
            let offset = ((frame.relative.com.x - frame.target.com.x).powi(2)
                + (frame.relative.com.y - frame.target.com.y).powi(2))
            .sqrt();
            assert!(frame.energy.is_finite() && frame.bike.angle.is_finite());
            // A saturated rider may sink deep into a squat under high transition loads, but the
            // skeletal workspace bounds how far it can go.
            assert!(
                offset < 0.6,
                "dt={dt} rider drifted {offset} m from target at t={}",
                frame.t
            );
            assert!(
                frame.bike.angular_velocity.abs() < 20.0,
                "dt={dt} bike spun at {} rad/s",
                frame.bike.angular_velocity
            );
            assert!(
                frame.min_clearance > -0.05,
                "dt={dt} penetrated {} m",
                frame.min_clearance
            );
        }
    }
}

#[test]
fn achieved_skeleton_is_always_reconstructable() {
    let (knee, hip, spine) = NEUTRAL;
    let scenario = with_keys(
        long_flight(),
        vec![
            key(-10.0, targets(knee, hip, spine)),
            key(2.0, targets(0.9, -1.0, 0.9)),
            key(3.0, targets(0.1, -0.2, 0.4)),
            key(6.0, targets(knee, hip, spine + 0.6)),
            key(40.0, targets(knee, hip, spine)),
        ],
    );
    let simulation = run(&scenario);
    for frame in &simulation.frames {
        let skeleton = frame.skeleton.as_ref().expect("reconstruction requested");
        assert!(skeleton.landmarks.is_finite());
        assert_eq!(skeleton.landmarks.ankle, skeleton.landmarks.pedal_contact);
        assert_eq!(
            skeleton.landmarks.hand,
            skeleton.landmarks.handlebar_contact
        );
        assert!(
            skeleton.projected || skeleton.residual < 1.0e-3,
            "unprojected skeleton missed the rider centre of mass by {} m at t={}",
            skeleton.residual,
            frame.t
        );
    }
}

#[test]
fn landing_surface_holds_under_maximum_rider_loads() {
    let mut scenario = with_keys(
        long_flight(),
        vec![
            key(-10.0, targets(0.3, -0.5, 0.75)),
            key(9.0, targets(0.1, -0.2, 0.6)),
            key(10.5, targets(1.0, -1.1, 0.9)),
            key(12.0, targets(0.1, -0.2, 0.6)),
            key(40.0, targets(0.3, -0.5, 0.75)),
        ],
    );
    scenario.rider.strength_scale = 3.0;
    let simulation = simulate(
        &scenario,
        &SimulationOptions {
            gains: Some(CouplingGains::representative(&scenario.rider)),
            reconstruct: false,
        },
    )
    .expect("simulation succeeds");
    let (_, landing) = flight_range(&simulation);
    for frame in &simulation.frames[landing..] {
        assert!(
            frame.min_clearance >= -0.01,
            "penetrated {} m at t={}",
            frame.min_clearance,
            frame.t
        );
    }
}

#[test]
fn repeated_runs_are_bit_identical() {
    let first = run(&long_flight());
    let second = run(&long_flight());
    assert_eq!(first.frames, second.frames);
}
