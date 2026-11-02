use physics_core::geometry::rider_link_lengths;
use physics_core::pose::sample_pose;
use physics_core::scenario::Scenario;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

const LENGTH_TOLERANCE_M: f32 = 1e-5;

fn load_scenario() -> Scenario {
    serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture")
}

#[test]
fn neutral_pose_is_finite_and_connected_with_real_segment_lengths() {
    let scenario = load_scenario();
    let links = rider_link_lengths(&scenario.rider);

    let sample = sample_pose(
        &scenario.pose_clip,
        scenario.pose_clip.keys[0].s,
        &scenario.rider,
        &scenario.bike,
    );
    let landmarks = sample.landmarks;

    assert!(landmarks.is_finite(), "achieved landmarks must be finite");

    assert!(
        (landmarks.knee.distance(&landmarks.ankle) - links.shank).abs() < LENGTH_TOLERANCE_M,
        "shank segment must preserve its derived length"
    );
    assert!(
        (landmarks.hip.distance(&landmarks.knee) - links.thigh).abs() < LENGTH_TOLERANCE_M,
        "thigh segment must preserve its derived length"
    );
    assert!(
        (landmarks.shoulder.distance(&landmarks.elbow) - links.upper_arm).abs()
            < LENGTH_TOLERANCE_M,
        "upper arm segment must preserve its derived length"
    );
}

#[test]
fn foot_and_hand_align_with_pedal_and_handlebar_contacts_when_reachable() {
    let scenario = load_scenario();

    let sample = sample_pose(
        &scenario.pose_clip,
        scenario.pose_clip.keys[1].s,
        &scenario.rider,
        &scenario.bike,
    );
    let landmarks = sample.landmarks;

    assert_eq!(
        landmarks.ankle.distance(&landmarks.pedal_contact),
        0.0,
        "ankle must coincide exactly with the pedal contact"
    );

    assert!(
        landmarks.hand.distance(&landmarks.handlebar_contact) < 1e-4,
        "hand must reach the handlebar contact when the arm is not constrained"
    );
}

#[test]
fn out_of_range_targets_are_clamped_to_declared_joint_limits() {
    let mut scenario = load_scenario();
    scenario.rider.joints.knee.min = -0.1;
    scenario.rider.joints.knee.max = 0.2;

    let sample = sample_pose(
        &scenario.pose_clip,
        scenario.pose_clip.keys[0].s,
        &scenario.rider,
        &scenario.bike,
    );

    assert!(
        sample.targets.knee <= 0.2 + 1e-6 && sample.targets.knee >= -0.1 - 1e-6,
        "achieved knee target must respect the declared joint limit"
    );
    assert!(
        sample.derived_arm.constrained,
        "clamped targets must be reported as constrained"
    );
}

#[test]
fn unreachable_handlebar_reports_constrained_without_disconnecting_the_arm() {
    let mut scenario = load_scenario();
    scenario.rider.arm_ratio = 0.30;

    let sample = sample_pose(
        &scenario.pose_clip,
        scenario.pose_clip.keys[0].s,
        &scenario.rider,
        &scenario.bike,
    );
    let links = rider_link_lengths(&scenario.rider);

    assert!(sample.derived_arm.constrained);
    assert!(sample.landmarks.is_finite());
    assert!(
        (sample.landmarks.shoulder.distance(&sample.landmarks.elbow) - links.upper_arm).abs()
            < LENGTH_TOLERANCE_M,
        "upper arm length must remain valid even when the reach is constrained"
    );
    assert!(
        sample
            .landmarks
            .hand
            .distance(&sample.landmarks.handlebar_contact)
            < 1e-4,
        "hands must stay locked to the handlebar grip even when reach is constrained"
    );
}

#[test]
fn positive_knee_target_increases_forward_knee_offset() {
    let scenario = load_scenario();
    let mut flexed = scenario.pose_clip.keys[0].clone();
    flexed.targets.knee = 0.6;
    let mut extended = scenario.pose_clip.keys[0].clone();
    extended.targets.knee = 0.1;

    let links = rider_link_lengths(&scenario.rider);
    let pedal = physics_core::geometry::bike_contact_points(&scenario.bike).pedal_contact;

    let flexed_x = pedal.x + flexed.targets.knee.sin() * links.shank;
    let extended_x = pedal.x + extended.targets.knee.sin() * links.shank;

    assert!(
        flexed_x > extended_x,
        "canonical convention: larger positive knee flexion moves the knee further forward"
    );
}
