use physics_core::scenario::{JumpKind, Scenario, kicker_transition_length};
use physics_core::simulation::SimFrame;
use physics_core::solver::{CONTACT_IMPULSE_EPSILON, SolveOutput, solve_scenario};

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");
const GRAVITY: f32 = 9.81;

fn standard_scenario() -> Scenario {
    serde_json::from_str(STANDARD_SCENARIO).expect("valid standard scenario")
}

/// A long, slow approach: the run ends at the time limit before reaching the jump.
fn flat_scenario() -> Scenario {
    let mut scenario = standard_scenario();
    scenario.entry.start_x = -60.0;
    scenario.entry.speed = 1.0;
    scenario
}

fn system_com_y(output: &SolveOutput, frame: &SimFrame) -> f32 {
    let inertia = &output.simulation.inertia;
    (inertia.bike_mass * frame.bike.com.y + inertia.rider_mass * frame.rider.com.y)
        / (inertia.bike_mass + inertia.rider_mass)
}

fn system_velocity_y(output: &SolveOutput, frame: &SimFrame) -> f32 {
    let inertia = &output.simulation.inertia;
    frame.linear_momentum.y / (inertia.bike_mass + inertia.rider_mass)
}

#[test]
fn resting_equilibrium_balances_weight_and_preserves_height() {
    let scenario = flat_scenario();
    let output = solve_scenario(&scenario, "equilibrium").expect("flat solve");
    let settled = &output.frames()[60..];
    assert!(settled.iter().all(|frame| !frame.airborne));

    let heights: Vec<f32> = settled.iter().map(|frame| frame.bike_origin.y).collect();
    let min_y = heights.iter().copied().fold(f32::INFINITY, f32::min);
    let max_y = heights.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    assert!(max_y - min_y < 0.001);

    let average_normal_force = settled
        .iter()
        .map(|frame| frame.normal_force_rear + frame.normal_force_front)
        .sum::<f32>()
        / settled.len() as f32;
    let weight = (scenario.rider.mass + scenario.bike.mass) * GRAVITY;
    assert!(
        settled
            .iter()
            .all(|frame| frame.contact_impulse > CONTACT_IMPULSE_EPSILON * 1_000.0)
    );
    assert!((average_normal_force - weight).abs() / weight < 0.02);
}

#[test]
fn measured_flight_follows_closed_form_ballistics() {
    let mut scenario = standard_scenario();
    scenario.entry.speed = 11.0;
    let fixed_targets = scenario.pose_clip.keys[0].targets.clone();
    for key in &mut scenario.pose_clip.keys {
        key.targets = fixed_targets.clone();
    }
    let output = solve_scenario(&scenario, "ballistic").expect("standard solve");
    let frames = output.frames();
    let start_index = frames
        .windows(25)
        .position(|window| window.iter().all(|frame| frame.airborne))
        .expect("sustained airborne interval");
    let end_index = start_index + 24;
    let (start, end) = (&frames[start_index], &frames[end_index]);

    let elapsed = end.t - start.t;
    let expected_y = system_com_y(&output, start) + system_velocity_y(&output, start) * elapsed
        - 0.5 * GRAVITY * elapsed * elapsed;
    assert!((system_com_y(&output, end) - expected_y).abs() < 0.01);
    let expected_vx = start.linear_momentum.x;
    assert!((end.linear_momentum.x - expected_vx).abs() / expected_vx.abs() < 1.0e-3);
}

#[test]
fn launch_follows_the_lip_tangent_and_loses_speed_climbing() {
    let mut scenario = standard_scenario();
    scenario.entry.speed = 11.0;
    let output = solve_scenario(&scenario, "launch").expect("standard solve");
    let takeoff = output.simulation.takeoff.expect("takeoff");
    let velocity = takeoff.system_velocity;
    let speed = (velocity.x * velocity.x + velocity.y * velocity.y).sqrt();
    let direction = velocity.y.atan2(velocity.x);

    // The rider's legs absorb part of the lip's turn, so a neutral rider leaves flatter than the
    // lip but never steeper.
    let lip = scenario.jump.lip_angle;
    assert!(
        direction > 0.4 * lip && direction < lip + 0.05,
        "launched at {direction} rad from a {lip} rad lip"
    );
    // Climbing the lip converts kinetic energy into height: never faster than entry.
    let entry = scenario.entry.speed;
    assert!(speed < entry, "launched at {speed} m/s from {entry} m/s");
    let conserved = (entry * entry - 2.0 * GRAVITY * scenario.jump.lip_height).sqrt();
    assert!(
        (speed - conserved).abs() / conserved < 0.1,
        "launched at {speed} m/s; energy conservation predicts about {conserved} m/s"
    );
}

#[test]
fn both_wheel_colliders_retain_landing_contact_with_distributed_mass() {
    let mut scenario = standard_scenario();
    scenario.jump.kind = JumpKind::Gap;
    scenario.jump.lip_height = 0.4;
    scenario.jump.lip_angle = 0.5;
    scenario.jump.transition_length = kicker_transition_length(0.4, 0.5);
    scenario.jump.gap = 0.5;
    scenario.jump.step_delta = 0.0;
    scenario.jump.landing_angle = 0.12;
    scenario.jump.landing_length = 12.0;
    scenario.jump.rollout = 12.0;
    scenario.entry.start_x = -4.0;
    scenario.entry.speed = 5.0;
    let output = solve_scenario(&scenario, "slope-pitch").expect("slope solve");
    let landing_start = scenario.jump.transition_length + scenario.jump.gap;
    let slope_frames: Vec<_> = output
        .frames()
        .iter()
        .filter(|frame| !frame.airborne && frame.bike_origin.x > landing_start + 1.0)
        .collect();
    assert!(
        !slope_frames.is_empty(),
        "scenario must reach supported landing slope"
    );
    assert!(
        slope_frames
            .iter()
            .all(|frame| frame.bike.angle.is_finite())
    );
    assert!(
        slope_frames
            .iter()
            .any(|frame| frame.grounded_rear && frame.normal_force_rear > 0.0),
        "rear wheel must retain landing contact"
    );
    assert!(
        slope_frames
            .iter()
            .any(|frame| frame.grounded_front && frame.normal_force_front > 0.0),
        "front wheel must retain landing contact"
    );
}

#[test]
fn airborne_rotation_is_deterministic() {
    let mut scenario = standard_scenario();
    scenario.entry.speed = 11.0;
    let first = solve_scenario(&scenario, "rotation-a").expect("first solve");
    let second = solve_scenario(&scenario, "rotation-b").expect("second solve");
    assert_eq!(first.result_hash, second.result_hash);
    let airborne_pitch: Vec<_> = first
        .frames()
        .iter()
        .zip(second.frames())
        .filter(|(left, _)| left.airborne)
        .map(|(left, right)| {
            assert_eq!(left.bike.angle, right.bike.angle);
            left.bike.angle
        })
        .collect();
    assert!(airborne_pitch.len() > 2);
    assert!((airborne_pitch.last().unwrap() - airborne_pitch[0]).abs() > 0.001);
}

#[test]
fn flat_ground_conserves_energy_without_rider_work() {
    let scenario = flat_scenario();
    let output = solve_scenario(&scenario, "energy").expect("flat solve");
    let frames = &output.frames()[60..];
    let residual = |frame: &SimFrame| frame.energy - frame.actuator_work;
    let drift = residual(frames.last().unwrap()) - residual(&frames[0]);
    // Ten seconds of resting contact: allow 0.5% of the system's mechanical energy.
    assert!(drift.abs() < 5.0, "energy residual drifted {drift} J");
    let speed_drift = frames.last().unwrap().linear_momentum.x - frames[0].linear_momentum.x;
    assert!(
        speed_drift.abs() < 0.5,
        "momentum drifted {speed_drift} kg m/s on flat ground"
    );
}
