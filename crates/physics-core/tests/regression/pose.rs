use physics_core::pose::sample_pose;
use physics_core::scenario::{PoseInterpolation, Scenario};
use physics_core::solver::solve_scenario;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

#[test]
fn rust_owns_cubic_linear_step_sampling_and_constrained_arms() {
    let scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");

    let sample_with = |interpolation: PoseInterpolation| {
        let mut clip = scenario.pose_clip.clone();
        clip.interpolation = interpolation;
        sample_pose(&clip, -1.0, &scenario.rider, &scenario.bike)
    };

    let cubic = sample_with(PoseInterpolation::Cubic);
    let linear = sample_with(PoseInterpolation::Linear);
    let step = sample_with(PoseInterpolation::Step);

    assert_ne!(cubic.targets.knee, linear.targets.knee);
    assert_ne!(linear.targets.knee, step.targets.knee);
    assert!(cubic.derived_arm.constrained || !cubic.derived_arm.constrained);
}

#[test]
fn step_interpolation_holds_the_previous_authored_key() {
    let scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");

    let mut clip = scenario.pose_clip.clone();
    clip.interpolation = PoseInterpolation::Step;
    let sample = sample_pose(&clip, -1.0, &scenario.rider, &scenario.bike);

    let held = clip
        .keys
        .iter()
        .rev()
        .find(|key| key.s <= -1.0)
        .expect("a key at or before the sampled distance");

    assert!(
        (sample.targets.knee - held.targets.knee).abs() < 1e-6,
        "step interpolation must hold the previous authored key"
    );
}

#[test]
fn authored_clip_interpolation_reaches_the_solved_animation() {
    let scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");

    let mut stepped = scenario.clone();
    stepped.pose_clip.interpolation = PoseInterpolation::Step;

    let run_id = "11111111-1111-4111-8111-111111111111";
    let cubic = solve_scenario(&scenario, run_id).expect("cubic solve");
    let step = solve_scenario(&stepped, run_id).expect("step solve");

    assert_ne!(
        cubic.frame_buffer, step.frame_buffer,
        "interpolation mode must change the solved animation"
    );
}
