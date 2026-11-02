use physics_core::pose::{resolve_pose_edit, validate_pose_key};
use physics_core::scenario::Scenario;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

fn load_scenario() -> Scenario {
    serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture")
}

#[test]
fn valid_request_passes_unchanged() {
    let scenario = load_scenario();
    let baseline = scenario.pose_clip.keys[0].targets.clone();
    let baseline_validation = validate_pose_key(&scenario, 0, baseline.clone());
    assert!(
        baseline_validation.valid,
        "baseline conflicts: {:#?}",
        baseline_validation.conflicts
    );

    let resolution = resolve_pose_edit(&scenario, 0, baseline.clone(), baseline.clone()).unwrap();
    assert!(resolution.requested_valid);
    assert_eq!(resolution.requested_targets, baseline);
    assert_eq!(resolution.accepted_targets, resolution.requested_targets);
    assert!(resolution.limiting_conflicts.is_empty());
}

#[test]
fn invalid_request_bisects_only_the_baseline_to_request_segment() {
    let scenario = load_scenario();
    let baseline = scenario.pose_clip.keys[0].targets.clone();
    let mut requested = baseline.clone();
    requested.knee = scenario.rider.joints.knee.max + 0.5;

    let resolution = resolve_pose_edit(&scenario, 0, baseline.clone(), requested.clone()).unwrap();
    assert!(!resolution.requested_valid);
    assert_eq!(resolution.requested_targets, requested);
    assert!(resolution.validation.valid);
    assert!(resolution.accepted_targets.knee >= baseline.knee);
    assert!(resolution.accepted_targets.knee <= scenario.rider.joints.knee.max + 1.0e-5);
    assert_eq!(resolution.accepted_targets.hip, baseline.hip);
    assert_eq!(resolution.accepted_targets.spine, baseline.spine);
    assert!(
        resolution
            .limiting_conflicts
            .iter()
            .any(|conflict| conflict.kind == "joint-limit")
    );
}

#[test]
fn invalid_baseline_fails_without_rewriting_legacy_keys() {
    let scenario = load_scenario();
    let original_keys = scenario.pose_clip.keys.clone();
    let mut invalid_baseline = original_keys[0].targets.clone();
    invalid_baseline.knee = scenario.rider.joints.knee.max + 0.5;

    let error = resolve_pose_edit(
        &scenario,
        0,
        invalid_baseline,
        original_keys[1].targets.clone(),
    )
    .expect_err("invalid baseline must fail");
    assert_eq!(error, "invalid-baseline");
    assert_eq!(scenario.pose_clip.keys, original_keys);
}

#[test]
fn resolver_uses_the_authored_key_and_never_inspects_interpolation() {
    let mut scenario = load_scenario();
    scenario.pose_clip.interpolation = physics_core::scenario::PoseInterpolation::Cubic;
    let baseline = scenario.pose_clip.keys[0].targets.clone();
    let resolution = resolve_pose_edit(&scenario, 0, baseline.clone(), baseline).unwrap();

    assert_eq!(resolution.validation.key_index, 0);
    assert_eq!(resolution.validation.s, scenario.pose_clip.keys[0].s);
    assert_eq!(resolution.validation.sample.s, scenario.pose_clip.keys[0].s);
}
