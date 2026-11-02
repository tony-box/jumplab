use physics_core::bike::combine_bike_and_rider_mass_properties;
use physics_core::geometry::inspect_bike_geometry;
use physics_core::pose::sample_pose;
use physics_core::scenario::{JumpKind, Scenario};
use physics_core::solver::{CONTACT_IMPULSE_EPSILON, Frame, solve_scenario};

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");
const GRAVITY: f32 = 9.81;

fn standard_scenario() -> Scenario {
    serde_json::from_str(STANDARD_SCENARIO).expect("valid standard scenario")
}

fn flat_scenario() -> Scenario {
    let mut scenario = standard_scenario();
    scenario.jump.kind = JumpKind::Table;
    scenario.jump.lip_height = 0.0;
    scenario.jump.lip_angle = 0.05;
    scenario.jump.gap = 0.0;
    scenario.jump.step_delta = 0.0;
    scenario.jump.landing_angle = 0.0;
    scenario.jump.landing_length = 30.0;
    scenario.jump.rollout = 30.0;
    scenario.entry.start_x = -10.0;
    scenario.entry.speed = 1.0;
    scenario
}

fn mechanical_energy(frame: &Frame, mass: f32) -> f32 {
    0.5 * mass * (frame.vx * frame.vx + frame.vy * frame.vy) + mass * GRAVITY * frame.y
}

#[test]
fn resting_equilibrium_balances_weight_and_preserves_height() {
    let scenario = flat_scenario();
    let output = solve_scenario(&scenario, "equilibrium").expect("flat solve");
    let settled = &output.frames[20..];
    assert!(settled.iter().all(|frame| !frame.airborne));

    let min_y = settled
        .iter()
        .map(|frame| frame.y)
        .fold(f32::INFINITY, f32::min);
    let max_y = settled
        .iter()
        .map(|frame| frame.y)
        .fold(f32::NEG_INFINITY, f32::max);
    assert!(max_y - min_y < 0.001);

    let average_normal_force = settled
        .iter()
        .map(|frame| frame.normal_force_rear + frame.normal_force_front)
        .sum::<f32>()
        / settled.len() as f32;
    let weight = (scenario.rider.mass + scenario.bike.mass) * GRAVITY;
    assert!(CONTACT_IMPULSE_EPSILON > 0.0);
    assert!(
        settled
            .iter()
            .all(|frame| frame.contact_impulse > CONTACT_IMPULSE_EPSILON * 1_000.0)
    );
    assert!((average_normal_force - weight).abs() / weight < 0.02);
}

#[test]
fn measured_separation_follows_closed_form_ballistics() {
    let mut scenario = standard_scenario();
    let fixed_targets = scenario.pose_clip.keys[0].targets.clone();
    for key in &mut scenario.pose_clip.keys {
        key.targets = fixed_targets.clone();
    }
    let output = solve_scenario(&scenario, "ballistic").expect("standard solve");
    let start_index = output
        .frames
        .windows(25)
        .position(|window| window.iter().all(|frame| frame.airborne))
        .expect("sustained airborne interval");
    let end_index = start_index + 24;
    let start = &output.frames[start_index];
    let end = &output.frames[end_index];
    assert!(
        output.frames[start_index..=end_index]
            .iter()
            .all(|frame| frame.airborne)
    );

    let elapsed = end.t - start.t;
    let pose = sample_pose(
        &scenario.pose_clip,
        start.x,
        &scenario.rider,
        &scenario.bike,
    );
    let local_com = combine_bike_and_rider_mass_properties(
        inspect_bike_geometry(&scenario.bike).mass_properties,
        &scenario.rider,
        &pose.landmarks,
    )
    .center_of_gravity;
    let world_com_y =
        |frame: &Frame| frame.y + frame.pitch.sin() * local_com.x + frame.pitch.cos() * local_com.y;
    let start_com_y = world_com_y(start);
    let end_com_y = world_com_y(end);
    let expected_y = start_com_y + start.vy * elapsed - 0.5 * GRAVITY * elapsed * elapsed;
    assert!((end_com_y - expected_y).abs() < 0.01);
}

#[test]
fn both_wheel_colliders_retain_landing_contact_with_distributed_mass() {
    let mut scenario = standard_scenario();
    scenario.jump.kind = JumpKind::Gap;
    scenario.jump.lip_height = 0.4;
    scenario.jump.lip_angle = 0.2;
    scenario.jump.transition_length = 0.4;
    scenario.jump.lip_angle = libm::atanf(1.5 * scenario.jump.lip_height / 0.4) + 0.01;
    scenario.jump.gap = 0.5;
    scenario.jump.step_delta = 0.0;
    scenario.jump.landing_angle = 0.12;
    scenario.jump.landing_length = 12.0;
    scenario.jump.rollout = 12.0;
    scenario.entry.start_x = -4.0;
    scenario.entry.speed = 4.0;
    let output = solve_scenario(&scenario, "slope-pitch").expect("slope solve");
    let landing_start = scenario.jump.transition_length + scenario.jump.gap;
    let slope_frames: Vec<_> = output
        .frames
        .iter()
        .filter(|frame| !frame.airborne && frame.x > landing_start + 1.0)
        .collect();
    assert!(
        !slope_frames.is_empty(),
        "scenario must reach supported landing slope"
    );
    assert!(slope_frames.iter().all(|frame| frame.pitch.is_finite()));
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
    let scenario = standard_scenario();
    let first = solve_scenario(&scenario, "rotation-a").expect("first solve");
    let second = solve_scenario(&scenario, "rotation-b").expect("second solve");
    let airborne_pitch: Vec<_> = first
        .frames
        .iter()
        .zip(&second.frames)
        .filter(|(left, _)| left.airborne)
        .map(|(left, right)| {
            assert_eq!(left.pitch, right.pitch);
            left.pitch
        })
        .collect();
    assert!(airborne_pitch.len() > 2);
    assert!((airborne_pitch.last().unwrap() - airborne_pitch[0]).abs() > 0.001);
}

#[test]
fn energy_residual_accounts_for_speed_constraint_and_contact_work() {
    let scenario = flat_scenario();
    let output = solve_scenario(&scenario, "energy").expect("flat solve");
    let frames = &output.frames[20..];
    let mass = scenario.rider.mass + scenario.bike.mass;
    let energy_change =
        mechanical_energy(frames.last().unwrap(), mass) - mechanical_energy(&frames[0], mass);
    let mut speed_constraint_work = 0.0;
    let mut contact_work = 0.0;
    for pair in frames.windows(2) {
        speed_constraint_work += 0.5 * mass * (scenario.entry.speed.powi(2) - pair[0].vx.powi(2));
        let average_normal_force = 0.5
            * (pair[0].normal_force_rear
                + pair[0].normal_force_front
                + pair[1].normal_force_rear
                + pair[1].normal_force_front);
        contact_work += average_normal_force * (pair[1].y - pair[0].y);
    }
    let residual = energy_change - speed_constraint_work - contact_work;
    assert!(residual.abs() < 1.0, "energy residual {residual} J");
}
