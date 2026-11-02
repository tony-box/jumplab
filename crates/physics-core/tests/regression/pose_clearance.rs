use physics_core::geometry::inspect_bike_geometry;
use physics_core::pose::{sample_pose, validate_design, validate_pose_key, validate_pose_sample};
use physics_core::scenario::Scenario;
use physics_core::solver::solve_scenario;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

fn load_scenario() -> Scenario {
    serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture")
}

#[test]
fn designated_hand_and_foot_contacts_do_not_exempt_other_parts() {
    let scenario = load_scenario();
    let validation = validate_pose_key(&scenario, 0, scenario.pose_clip.keys[0].targets.clone());

    assert!(validation.contacts.iter().any(|contact| {
        contact.kind == "hand"
            && contact.rider_part == "leftHand"
            && contact.bike_part == "handlebar"
            && contact.active
    }));
    assert!(validation.contacts.iter().any(|contact| {
        contact.kind == "foot"
            && contact.rider_part == "leftFoot"
            && contact.bike_part == "pedalForward"
            && contact.active
    }));
    assert!(!validation.conflicts.iter().any(|conflict| {
        (conflict.rider_part.as_deref() == Some("leftHand")
            && conflict.bike_part.as_deref() == Some("handlebar"))
            || (conflict.rider_part.as_deref() == Some("leftFoot")
                && conflict.bike_part.as_deref() == Some("pedalForward"))
    }));
}

#[test]
fn lateral_limb_tube_projections_are_ignored_but_wheel_and_fork_overlaps_are_rejected() {
    let scenario = load_scenario();
    let geometry = inspect_bike_geometry(&scenario.bike);
    let baseline = validate_pose_key(&scenario, 0, scenario.pose_clip.keys[0].targets.clone());

    assert!(
        baseline.valid,
        "baseline conflicts: {:#?}",
        baseline.conflicts
    );
    assert!(!baseline.conflicts.iter().any(|conflict| {
        matches!(
            conflict.rider_part.as_deref(),
            Some("leftThigh" | "leftShank" | "leftUpperArm" | "leftForearm")
        ) && matches!(
            conflict.bike_part.as_deref(),
            Some("topTube" | "downTube" | "seatTube" | "chainstay" | "seatstay")
        )
    }));

    let mut wheel_overlap = baseline.sample.clone();
    let rear_axle = geometry.landmarks["rearAxle"];
    let rear_tire_top = physics_core::geometry::Point2::new(
        rear_axle.x,
        rear_axle.y + scenario.bike.wheel_size * 0.0254 * 0.5,
    );
    wheel_overlap.landmarks.knee = rear_tire_top;
    wheel_overlap.landmarks.hip = rear_tire_top;
    let wheel_validation = validate_pose_sample(0, &scenario.rider, &geometry, wheel_overlap);
    assert!(wheel_validation.conflicts.iter().any(|conflict| {
        conflict.rider_part.as_deref() == Some("leftThigh")
            && conflict.bike_part.as_deref() == Some("rearTire")
    }));

    let mut fork_overlap = baseline.sample;
    let fork = geometry
        .members
        .iter()
        .find(|member| member.name == "fork")
        .expect("fork member");
    let fork_midpoint = fork.start.midpoint(&fork.end);
    fork_overlap.landmarks.shoulder = fork_midpoint;
    fork_overlap.landmarks.elbow = fork_midpoint;
    let fork_validation = validate_pose_sample(0, &scenario.rider, &geometry, fork_overlap);
    assert!(fork_validation.conflicts.iter().any(|conflict| {
        conflict.rider_part.as_deref() == Some("leftUpperArm")
            && conflict.bike_part.as_deref() == Some("fork")
    }));
}

#[test]
fn lateral_plane_exception_does_not_exempt_torso_frame_or_limb_crank_overlap() {
    let scenario = load_scenario();
    let geometry = inspect_bike_geometry(&scenario.bike);
    let baseline = validate_pose_key(&scenario, 0, scenario.pose_clip.keys[0].targets.clone());

    let mut torso_overlap = baseline.sample.clone();
    let top_tube = geometry
        .members
        .iter()
        .find(|member| member.name == "topTube")
        .expect("top tube");
    let top_tube_midpoint = top_tube.start.midpoint(&top_tube.end);
    torso_overlap.landmarks.hip = top_tube_midpoint;
    torso_overlap.landmarks.shoulder = top_tube_midpoint;
    let torso_validation = validate_pose_sample(0, &scenario.rider, &geometry, torso_overlap);
    assert!(torso_validation.conflicts.iter().any(|conflict| {
        conflict.rider_part.as_deref() == Some("torso")
            && conflict.bike_part.as_deref() == Some("topTube")
    }));

    let mut crank_overlap = baseline.sample;
    let crank = geometry
        .members
        .iter()
        .find(|member| member.name == "crankRearward")
        .expect("rearward crank");
    let crank_midpoint = crank.start.midpoint(&crank.end);
    crank_overlap.landmarks.knee = crank_midpoint;
    crank_overlap.landmarks.hip = crank_midpoint;
    let crank_validation = validate_pose_sample(0, &scenario.rider, &geometry, crank_overlap);
    assert!(crank_validation.conflicts.iter().any(|conflict| {
        conflict.rider_part.as_deref() == Some("leftThigh")
            && conflict.bike_part.as_deref() == Some("crankRearward")
    }));
}

#[test]
fn design_validation_checks_every_authored_key_without_interpolation() {
    let mut scenario = load_scenario();
    let last_key_index = scenario.pose_clip.keys.len() - 1;
    scenario.pose_clip.keys[last_key_index].targets.knee = scenario.rider.joints.knee.max + 0.5;

    let validation = validate_design(&scenario).expect("design validation");
    assert_eq!(validation.pose_keys.len(), scenario.pose_clip.keys.len());
    assert_eq!(
        validation
            .pose_keys
            .iter()
            .map(|key| key.key_index)
            .collect::<Vec<_>>(),
        (0..scenario.pose_clip.keys.len()).collect::<Vec<_>>()
    );
    assert!(!validation.can_solve);
    assert!(
        validation.pose_keys[last_key_index]
            .conflicts
            .iter()
            .any(|conflict| conflict.kind == "joint-limit")
    );
}

#[test]
fn solve_scenario_rejects_a_structurally_valid_design_with_an_invalid_authored_key() {
    let mut scenario = load_scenario();
    scenario.pose_clip.keys[0].targets.knee = scenario.rider.joints.knee.max + 0.5;

    scenario
        .validate()
        .expect("scenario remains structurally valid");
    let error = solve_scenario(&scenario, "design-invalid").expect_err("solve must be gated");
    assert_eq!(error, "design-invalid");
}

#[test]
fn pelvis_below_top_tube_is_a_directional_conflict() {
    let scenario = load_scenario();
    let geometry = inspect_bike_geometry(&scenario.bike);
    let mut sample = sample_pose(
        &scenario.pose_clip,
        scenario.pose_clip.keys[0].s,
        &scenario.rider,
        &scenario.bike,
    );
    let top_tube = geometry
        .members
        .iter()
        .find(|member| member.name == "topTube")
        .expect("top tube");
    sample.landmarks.hip = top_tube.start.midpoint(&top_tube.end);

    let validation = validate_pose_sample(0, &scenario.rider, &geometry, sample);
    assert!(validation.conflicts.iter().any(|conflict| {
        conflict.code == "pelvis-below-top-tube"
            && conflict.rider_part.as_deref() == Some("pelvis")
            && conflict.bike_part.as_deref() == Some("topTube")
    }));
}

#[test]
fn hyperextended_leg_is_rejected_even_inside_the_declared_target_range() {
    let scenario = load_scenario();
    let mut targets = scenario.pose_clip.keys[0].targets.clone();
    // Both values sit inside their declared absolute ranges, but together they
    // bend the knee backward past a straight leg.
    targets.knee = scenario.rider.joints.knee.min;
    targets.hip = 1.0;
    assert!(targets.hip <= scenario.rider.joints.hip.max);

    let validation = validate_pose_key(&scenario, 0, targets);
    assert!(
        validation
            .conflicts
            .iter()
            .any(|conflict| conflict.code == "knee-hyperextension"),
        "a backward-bending knee must be rejected by anatomy, not by the absolute target range"
    );
}

#[test]
fn a_target_resting_exactly_on_its_declared_limit_is_not_a_conflict() {
    let scenario = load_scenario();
    let mut targets = scenario.pose_clip.keys[0].targets.clone();
    targets.spine = scenario.rider.joints.spine.max;

    let validation = validate_pose_key(&scenario, 0, targets);
    assert!(
        !validation
            .conflicts
            .iter()
            .any(|conflict| conflict.code == "spine-joint-limit"),
        "sampling clamps targets onto the limit, so resting on it must stay a valid pose"
    );
}

#[test]
fn pelvis_clears_the_top_tube_from_a_realistic_seat_contact_height() {
    let scenario = load_scenario();
    let geometry = inspect_bike_geometry(&scenario.bike);
    let mut sample = sample_pose(
        &scenario.pose_clip,
        scenario.pose_clip.keys[0].s,
        &scenario.rider,
        &scenario.bike,
    );
    let top_tube = geometry
        .members
        .iter()
        .find(|member| member.name == "topTube")
        .expect("top tube");
    // A full pelvis radius above the tube used to be the floor; the hip joint
    // centre sits far lower than that, so this height must now clear.
    sample.landmarks.hip = top_tube.start.midpoint(&top_tube.end);
    sample.landmarks.hip.y += scenario.rider.height * 0.06;

    let validation = validate_pose_sample(0, &scenario.rider, &geometry, sample);
    assert!(
        !validation
            .conflicts
            .iter()
            .any(|conflict| conflict.code == "pelvis-below-top-tube"),
        "the hip must be able to drop close to the top tube before conflicting"
    );
}

#[test]
fn saddle_contact_is_inferred_only_from_above() {
    let scenario = load_scenario();
    let geometry = inspect_bike_geometry(&scenario.bike);
    let saddle = geometry.landmarks["saddleCenter"];
    let mut above = sample_pose(
        &scenario.pose_clip,
        scenario.pose_clip.keys[0].s,
        &scenario.rider,
        &scenario.bike,
    );
    above.landmarks.hip.x = saddle.x;
    above.landmarks.hip.y = saddle.y + scenario.rider.height * 0.055;
    let contact = validate_pose_sample(0, &scenario.rider, &geometry, above);
    assert!(contact.contacts.iter().any(|result| {
        result.kind == "saddle" && result.bike_part == "saddle" && result.active
    }));
    assert!(!contact.conflicts.iter().any(|conflict| {
        conflict.rider_part.as_deref() == Some("pelvis")
            && conflict.bike_part.as_deref() == Some("saddle")
    }));

    let mut crossed = contact.sample.clone();
    crossed.landmarks.hip.y = saddle.y - scenario.rider.height * 0.055;
    let penetration = validate_pose_sample(0, &scenario.rider, &geometry, crossed);
    assert!(penetration.conflicts.iter().any(|conflict| {
        conflict.code == "saddle-crossing"
            && conflict.rider_part.as_deref() == Some("pelvis")
            && conflict.bike_part.as_deref() == Some("saddle")
    }));
}

#[test]
fn clearance_conflicts_are_stable_and_absent_members_are_not_reported() {
    let scenario = load_scenario();
    let first = validate_pose_key(&scenario, 0, scenario.pose_clip.keys[0].targets.clone());
    let repeated = validate_pose_key(&scenario, 0, scenario.pose_clip.keys[0].targets.clone());

    assert_eq!(first.conflicts, repeated.conflicts);
    assert!(
        !first
            .conflicts
            .iter()
            .any(|conflict| { conflict.bike_part.as_deref() == Some("rearShock") })
    );
}

#[test]
fn extreme_supported_rider_sizes_produce_finite_key_validation() {
    for height in [1.2, 2.2] {
        let mut scenario = load_scenario();
        scenario.rider.height = height;
        let validation =
            validate_pose_key(&scenario, 0, scenario.pose_clip.keys[0].targets.clone());
        assert!(validation.minimum_separation.is_finite());
        assert!(validation.sample.landmarks.is_finite());
    }
}
