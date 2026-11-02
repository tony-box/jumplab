use physics_core::geometry::generate_terrain_profile;
use physics_core::scenario::{JumpKind, Scenario, kicker_transition_length};

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

#[test]
fn derives_deterministic_terrain() {
    let scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");

    let terrain = generate_terrain_profile(&scenario, 0.25);
    let terrain_second = generate_terrain_profile(&scenario, 0.25);
    assert_eq!(terrain.segments, terrain_second.segments);
}

#[test]
fn jump_shape_controls_do_not_move_the_fixed_approach() {
    let scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).unwrap();
    let expected_start = scenario.entry.start_x
        - scenario.bike.wheelbase * 0.5
        - scenario.bike.wheel_size * 0.0254 * 0.5;

    for mutate in [
        |scenario: &mut Scenario| scenario.jump.transition_length = 6.0,
        |scenario: &mut Scenario| scenario.jump.lip_height = 3.0,
        |scenario: &mut Scenario| scenario.jump.lip_angle = 1.0,
    ] {
        let mut changed = scenario.clone();
        mutate(&mut changed);
        let terrain = generate_terrain_profile(&changed, 0.05);
        assert!((terrain.approach_start_x - expected_start).abs() < 1e-6);
    }
}

#[test]
fn kicker_height_and_angle_set_the_arc_length_and_feature_positions() {
    let scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).unwrap();

    for (height, angle) in [(2.0, 0.82), (1.2, 0.9), (0.6, 0.5)] {
        let mut changed = scenario.clone();
        changed.jump.lip_height = height;
        changed.jump.lip_angle = angle;
        let length = kicker_transition_length(height, angle);
        let terrain = generate_terrain_profile(&changed, 0.05);
        assert!((terrain.lip_x - length).abs() < 1.0e-5);
        assert!((terrain.landing_start_x - (length + changed.jump.gap)).abs() < 1.0e-5);
    }
}

#[test]
fn drops_take_their_authored_transition_length() {
    let mut drop: Scenario = serde_json::from_str(STANDARD_SCENARIO).unwrap();
    drop.jump.kind = JumpKind::Drop;
    drop.jump.lip_angle = 0.0;
    drop.jump.step_delta = -1.5;
    drop.jump.transition_length = 3.0;
    drop.validate().expect("valid drop");
    let terrain = generate_terrain_profile(&drop, 0.05);
    assert_eq!(terrain.lip_x, 3.0);
    assert_eq!(terrain.landing_start_x, 3.0 + drop.jump.gap);
}

#[test]
fn kicker_transition_length_must_match_the_arc() {
    let mut scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).unwrap();
    scenario.validate().expect("fixture is consistent");
    scenario.jump.transition_length += 0.1;
    let error = scenario.validate().unwrap_err();
    assert!(error.contains("derived kicker length"), "{error}");
}
#[test]
fn bezier_surfaces_are_monotone_and_join_rollout_horizontally() {
    let scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).unwrap();
    let terrain = generate_terrain_profile(&scenario, 0.05);
    let takeoff = terrain
        .segments
        .iter()
        .find(|segment| segment.kind == "approach-takeoff")
        .unwrap();
    let landing = terrain
        .segments
        .iter()
        .find(|segment| segment.kind == "landing-rollout")
        .unwrap();

    assert!(
        takeoff
            .points
            .windows(2)
            .all(|pair| pair[1][0] > pair[0][0])
    );
    assert!(
        takeoff
            .points
            .windows(2)
            .all(|pair| pair[1][1] >= pair[0][1])
    );
    assert!(
        landing
            .points
            .windows(2)
            .all(|pair| pair[1][0] > pair[0][0])
    );
    assert!(
        landing
            .points
            .windows(2)
            .all(|pair| pair[1][1] <= pair[0][1])
    );

    let landing_end = landing.points[landing.points.len() - 2];
    let rollout_end = landing.points[landing.points.len() - 1];
    assert_eq!(landing_end[1], rollout_end[1]);

    let curved_edges = takeoff.points[1..]
        .windows(2)
        .chain(landing.points[..landing.points.len() - 1].windows(2));
    for pair in curved_edges {
        let edge = ((pair[1][0] - pair[0][0]).powi(2) + (pair[1][1] - pair[0][1]).powi(2)).sqrt();
        assert!(edge <= 0.075, "sampled edge too long: {edge}");
    }
}

#[test]
fn takeoff_slope_rises_to_the_requested_lip_angle_without_rolling_over() {
    let scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).unwrap();
    let terrain = generate_terrain_profile(&scenario, 0.01);
    let takeoff = terrain
        .segments
        .iter()
        .find(|segment| segment.kind == "approach-takeoff")
        .unwrap();
    let lip_points: Vec<_> = takeoff
        .points
        .iter()
        .copied()
        .filter(|point| point[0] >= 0.0)
        .collect();
    let slopes: Vec<_> = lip_points
        .windows(11)
        .map(|window| {
            let first = window.first().unwrap();
            let last = window.last().unwrap();
            (last[1] - first[1]) / (last[0] - first[0])
        })
        .collect();

    assert!(
        slopes.windows(2).all(|pair| pair[1] + 0.02 >= pair[0]),
        "takeoff slope rolled over: {slopes:?}"
    );
    let requested = libm::tanf(scenario.jump.lip_angle);
    assert!((slopes.last().unwrap() - requested).abs() < 0.05);
}

#[test]
fn drops_roll_off_a_level_or_falling_edge() {
    let scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).unwrap();

    let mut drop = scenario.clone();
    drop.jump.kind = physics_core::scenario::JumpKind::Drop;
    drop.jump.gap = 0.0;
    drop.jump.step_delta = -1.5;
    drop.jump.lip_angle = -0.2;
    drop.validate()
        .expect("drops accept a falling exit tangent");

    let profile = generate_terrain_profile(&drop, 0.05);
    let takeoff = profile
        .segments
        .iter()
        .find(|segment| segment.kind == "approach-takeoff")
        .unwrap();
    let tail = &takeoff.points[takeoff.points.len() - 3..];
    let exit_slope = (tail[2][1] - tail[0][1]) / (tail[2][0] - tail[0][0]);
    assert!(exit_slope < 0.0, "drop edge should fall away: {exit_slope}");

    let mut flat = drop.clone();
    flat.jump.lip_angle = 0.0;
    flat.validate().expect("drops accept a level edge");

    let mut over_kicked = drop;
    over_kicked.jump.lip_angle = 0.6;
    assert!(over_kicked.validate().is_err());

    // Ordinary takeoffs keep the rollover guard.
    let mut table = scenario;
    table.jump.lip_angle = -0.2;
    assert!(table.validate().is_err());
}

#[test]
fn vertical_faces_follow_the_junction_between_neighbouring_surfaces() {
    let scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).unwrap();
    let table = generate_terrain_profile(&scenario, 0.05);
    assert!(
        table
            .segments
            .iter()
            .all(|segment| segment.kind != "landing-face")
    );

    let mut stepdown = scenario.clone();
    stepdown.jump.kind = physics_core::scenario::JumpKind::Stepdown;
    stepdown.jump.gap = 0.0;
    stepdown.jump.step_delta = -0.5;
    let touching = generate_terrain_profile(&stepdown, 0.05);
    let crest = *touching
        .segments
        .iter()
        .find(|segment| segment.kind == "approach-takeoff")
        .unwrap()
        .points
        .last()
        .unwrap();
    let landing_start = touching
        .segments
        .iter()
        .find(|segment| segment.kind == "landing-rollout")
        .unwrap()
        .points[0];
    let face = touching
        .segments
        .iter()
        .find(|segment| segment.kind == "landing-face")
        .expect("touching surfaces expose the step between them");

    assert_eq!(face.points[0], landing_start);
    assert_eq!(face.points[1][0], landing_start[0]);
    assert_eq!(face.points[1][1], crest[1]);

    let mut gap = scenario;
    gap.jump.kind = physics_core::scenario::JumpKind::Gap;
    let gap = generate_terrain_profile(&gap, 0.05);
    assert!(
        gap.segments
            .iter()
            .any(|segment| segment.kind == "landing-face")
    );
}
