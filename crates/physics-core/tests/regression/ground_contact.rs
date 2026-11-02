use std::fs;
use std::path::{Path, PathBuf};

use physics_core::geometry::{
    generate_terrain_profile, nearest_surface_clearance, nearest_surface_distance,
    terrain_height_at,
};
use physics_core::scenario::{JumpKind, Scenario, kicker_transition_length};
use physics_core::solver::{
    FRAME_STRIDE_FLOAT32, MAX_SOLVE_DURATION_SECONDS, POST_LANDING_FOLLOW_SECONDS, PhaseInterval,
    SolveOutput, solve_scenario,
};
use serde::Deserialize;
use serde_json::Value;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManifestEntry {
    id: String,
    file: String,
    final_grounded: bool,
}

fn fixture_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/scenarios/ground-contact")
}

fn merge_value(base: &mut Value, patch: Value) {
    match (base, patch) {
        (Value::Object(base), Value::Object(patch)) => {
            for (key, value) in patch {
                merge_value(base.entry(key).or_insert(Value::Null), value);
            }
        }
        (base, patch) => *base = patch,
    }
}

fn scenarios() -> Vec<(ManifestEntry, Scenario)> {
    let root = fixture_root();
    let manifest: Vec<ManifestEntry> = serde_json::from_str(
        &fs::read_to_string(root.join("manifest.json")).expect("ground-contact manifest"),
    )
    .expect("valid ground-contact manifest");

    manifest
        .into_iter()
        .map(|entry| {
            let mut scenario: Value = serde_json::from_str(STANDARD_SCENARIO).unwrap();
            let patch: Value = serde_json::from_str(
                &fs::read_to_string(root.join(&entry.file)).expect("scenario patch"),
            )
            .expect("valid scenario patch");
            merge_value(&mut scenario, patch);
            let scenario: Scenario =
                serde_json::from_value(scenario).expect("valid merged scenario");
            scenario
                .validate()
                .unwrap_or_else(|error| panic!("{} is not a valid scenario: {error}", entry.id));
            (entry, scenario)
        })
        .collect()
}

fn scenario_by_id(id: &str) -> Scenario {
    scenarios()
        .into_iter()
        .find_map(|(entry, scenario)| (entry.id == id).then_some(scenario))
        .unwrap_or_else(|| panic!("missing canonical scenario {id}"))
}

fn phase<'a>(output: &'a SolveOutput, name: &str) -> Option<&'a PhaseInterval> {
    output.phases.iter().find(|phase| phase.name == name)
}

fn frame_index_at(output: &SolveOutput, t: f32) -> usize {
    output
        .frames()
        .iter()
        .position(|frame| frame.t >= t)
        .expect("frame at event time")
}

#[test]
fn runs_follow_the_rider_for_three_seconds_after_touchdown_and_stay_supported() {
    let mut scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");
    scenario.entry.speed = 11.0;
    let output = solve_scenario(&scenario, "follow-window").expect("standard solve");
    let touchdown = output.simulation.touchdown.expect("touchdown").t;
    let last = output.frames().last().expect("frames");

    let expected_end = (touchdown + POST_LANDING_FOLLOW_SECONDS).min(MAX_SOLVE_DURATION_SECONDS);
    assert!(
        (last.t - expected_end).abs() < 0.05,
        "run ended at {} instead of {expected_end}",
        last.t
    );

    let left_surface = output
        .frames()
        .iter()
        .find(|frame| frame.t > touchdown + 0.5 && frame.airborne && frame.min_clearance > 0.005);
    assert!(
        left_surface.is_none(),
        "rider left the run-out at {:?}",
        left_surface.map(|frame| (frame.t, frame.bike_origin, frame.min_clearance))
    );
    assert!(!last.airborne, "run ended airborne at t={}", last.t);
}

#[test]
fn clean_standard_run_reaches_the_end_of_landing_and_rollout() {
    let mut scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("standard scenario");
    scenario.entry.speed = 11.0;
    let profile = generate_terrain_profile(&scenario, 0.1);
    let landing_end_x = profile.landing_start_x + scenario.jump.landing_length;
    let output = solve_scenario(&scenario, "standard-complete-landing").expect("standard solve");
    let final_frame = output.frames().last().expect("final frame");

    assert_eq!(output.landing.status, "landed");
    assert!(
        final_frame.bike_origin.x >= landing_end_x,
        "final x {} did not reach the end of the landing at {landing_end_x}",
        final_frame.bike_origin.x
    );
    assert!(phase(&output, "rollout").is_some());
}

#[test]
fn landing_rollout_join_retains_finite_rear_wheel_contact() {
    let mut scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("standard scenario");
    scenario.jump.kind = JumpKind::Gap;
    scenario.jump.lip_height = 0.9;
    scenario.jump.lip_angle = 0.62;
    scenario.jump.transition_length = kicker_transition_length(0.9, 0.62);
    scenario.jump.gap = 4.0;
    scenario.jump.landing_angle = 0.3;
    scenario.jump.landing_length = 6.0;
    scenario.entry.speed = 8.0;
    let profile = generate_terrain_profile(&scenario, 0.1);
    let landing_end_x = profile.landing_start_x + scenario.jump.landing_length;
    let output = solve_scenario(&scenario, "smooth-rollout-join").expect("landing solve");
    let join_frames: Vec<_> = output
        .frames()
        .iter()
        .filter(|frame| {
            frame.bike_origin.x >= landing_end_x - 0.6
                && frame.bike_origin.x <= landing_end_x + scenario.bike.wheelbase
        })
        .collect();

    assert!(
        !join_frames.is_empty(),
        "the run must cross the landing-rollout join"
    );
    assert!(
        join_frames
            .iter()
            .all(|frame| frame.normal_force_rear.is_finite() && frame.min_clearance.is_finite()),
        "landing-rollout contact telemetry must stay finite"
    );
    assert!(
        join_frames
            .iter()
            .any(|frame| frame.grounded_rear && frame.normal_force_rear > 0.0),
        "rear wheel must retain measured contact through the landing-rollout join"
    );
}

#[test]
fn canonical_profiles_cover_entry_and_leave_intentional_voids_empty() {
    for (entry, scenario) in scenarios() {
        let profile = generate_terrain_profile(&scenario, 0.1);
        let wheel_radius = scenario.bike.wheel_size * 0.0254 * 0.5;
        let required_start = scenario.entry.start_x - scenario.bike.wheelbase * 0.5 - wheel_radius;
        assert!(
            profile.approach_start_x <= required_start,
            "{} does not support the initial rear wheel",
            entry.id
        );
        assert!(
            profile
                .segments
                .iter()
                .any(|segment| segment.kind == "landing-rollout")
        );
        if !matches!(scenario.jump.kind, JumpKind::Table) && scenario.jump.gap > 0.0 {
            assert!(
                profile
                    .segments
                    .iter()
                    .any(|segment| segment.kind == "landing-face"),
                "{} lacks a landing face",
                entry.id
            );
        }
        assert_eq!(
            profile
                .segments
                .iter()
                .any(|segment| segment.kind == "table-deck"),
            matches!(scenario.jump.kind, JumpKind::Table) && scenario.jump.gap > 0.0
        );

        if scenario.jump.gap > 0.0 && !matches!(scenario.jump.kind, JumpKind::Table) {
            let middle = (profile.lip_x + profile.landing_start_x) * 0.5;
            assert!(
                terrain_height_at(&profile, middle).is_none(),
                "{} has a phantom surface across its void",
                entry.id
            );
            assert!(
                nearest_surface_distance(&profile, [middle, scenario.jump.lip_height]).is_some()
            );
        }

        let approach_clearance = nearest_surface_clearance(
            &profile,
            [scenario.entry.start_x, wheel_radius],
            wheel_radius,
        )
        .expect("nearest approach clearance");
        assert!(approach_clearance.abs() < 1.0e-5);
    }
}

#[test]
fn kicker_lip_matches_its_circular_arc() {
    let scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).expect("standard scenario");
    let profile = generate_terrain_profile(&scenario, 0.05);
    let jump = &scenario.jump;
    let radius = jump.lip_height / (1.0 - jump.lip_angle.cos());
    let takeoff = &profile.segments[0];
    let lip = takeoff.points.last().expect("lip point");
    assert!((lip[0] - jump.transition_length).abs() < 1.0e-3);
    assert!((lip[1] - jump.lip_height).abs() < 1.0e-3);
    for point in takeoff.points.iter().filter(|point| point[0] > 0.0) {
        let distance = (point[0].powi(2) + (point[1] - radius).powi(2)).sqrt();
        assert!(
            (distance - radius).abs() < 2.0e-3,
            "point {point:?} is {distance} from the arc centre, not {radius}"
        );
    }
}

#[test]
fn canonical_solves_obey_contact_frame_invariants() {
    for (entry, scenario) in scenarios() {
        let output = solve_scenario(&scenario, &entry.id).expect("canonical solve");
        assert_eq!(
            output.frame_buffer.len() % FRAME_STRIDE_FLOAT32,
            0,
            "{} stride",
            entry.id
        );
        assert_eq!(
            output.frame_buffer.len() / FRAME_STRIDE_FLOAT32,
            output.frame_count
        );
        assert!(!output.frames().is_empty(), "{} frames", entry.id);

        for frame in output.frames() {
            assert!(
                frame.min_clearance >= -0.01,
                "{} penetrated: {}",
                entry.id,
                frame.min_clearance
            );
            assert!(frame.normal_force_rear >= 0.0 && frame.normal_force_front >= 0.0);
            assert_eq!(
                frame.airborne,
                !frame.grounded_rear && !frame.grounded_front
            );
            if frame.airborne {
                assert_eq!(frame.contact_impulse, 0.0);
                assert_eq!(frame.normal_force_rear, 0.0);
                assert_eq!(frame.normal_force_front, 0.0);
            } else {
                assert!(frame.contact_impulse > 0.0);
            }
        }

        if entry.final_grounded {
            assert!(
                !output.frames().last().unwrap().airborne,
                "{} final frame",
                entry.id
            );
        }

        if matches!(
            entry.id.as_str(),
            "flat-roll" | "low-speed" | "entry-coverage" | "anchor-mismatch" | "contact-output"
        ) {
            assert!(
                output.simulation.takeoff.is_none(),
                "{} unexpectedly took off at {:?}",
                entry.id,
                output.simulation.takeoff
            );
            assert!(
                output
                    .phases
                    .iter()
                    .all(|phase| phase.name != "takeoff" && phase.name != "flight")
            );
        }

        if matches!(entry.id.as_str(), "flat-roll" | "entry-coverage") {
            let heights: Vec<f32> = output
                .frames()
                .iter()
                .map(|frame| frame.bike_origin.y)
                .collect();
            let min_y = heights.iter().copied().fold(f32::INFINITY, f32::min);
            let max_y = heights.iter().copied().fold(f32::NEG_INFINITY, f32::max);
            assert!(max_y - min_y < 0.01, "{} flat-height drift", entry.id);
        }

        if entry.id == "curved-lip" {
            let profile = generate_terrain_profile(&scenario, 0.1);
            let lip_frames: Vec<_> = output
                .frames()
                .iter()
                .filter(|frame| frame.bike_origin.x >= 0.0 && frame.bike_origin.x <= profile.lip_x)
                .collect();
            assert!(lip_frames.iter().any(|frame| frame.bike.angle > 0.05));
            assert!(
                lip_frames
                    .windows(2)
                    .all(|pair| (pair[1].bike.angle - pair[0].bike.angle).abs() < 0.2)
            );
        }

        if entry.id == "anchor-mismatch" {
            let first = &output.frames()[0];
            assert!(
                first.bike_origin.y.abs() < 0.01,
                "frame y must be the ground-line anchor"
            );
            assert!(first.bike.angle.abs() < 0.01);
        }
    }
}

#[test]
fn stepdown_touchdown_is_measured_and_phases_follow_contact_events() {
    let scenario = scenario_by_id("stepdown-edge");
    let landing_end_x =
        generate_terrain_profile(&scenario, 0.1).landing_start_x + scenario.jump.landing_length;
    let output = solve_scenario(&scenario, "stepdown-transition").expect("stepdown solve");
    let takeoff = frame_index_at(&output, output.simulation.takeoff.expect("takeoff").t);
    let touchdown_event = output.simulation.touchdown.expect("touchdown");
    let touchdown = frame_index_at(&output, touchdown_event.t);
    let frames = output.frames();

    assert!(
        touchdown > takeoff + 1,
        "stepdown flight interval was empty"
    );
    assert!(
        frames[takeoff + 1..touchdown]
            .iter()
            .all(|frame| frame.airborne && frame.contact_impulse == 0.0),
        "stepdown did not separate cleanly from support"
    );
    assert!(!frames[touchdown].airborne);
    assert!(frames[touchdown].contact_impulse > 0.0);
    assert!(
        frames[touchdown..]
            .iter()
            .all(|frame| frame.min_clearance >= -0.01),
        "stepdown landing penetrated after touchdown"
    );

    assert_eq!(phase(&output, "takeoff").unwrap().start_frame, takeoff);
    assert_eq!(phase(&output, "flight").unwrap().start_frame, takeoff + 1);
    assert_eq!(phase(&output, "flight").unwrap().end_frame, touchdown - 1);
    assert_eq!(phase(&output, "landing").unwrap().start_frame, touchdown);
    let approach = phase(&output, "approach").unwrap();
    assert_eq!(approach.start_frame, 0);
    let pre_takeoff_end = phase(&output, "transition").map_or(approach.end_frame, |transition| {
        assert_eq!(transition.start_frame, approach.end_frame + 1);
        transition.end_frame
    });
    assert_eq!(pre_takeoff_end, takeoff - 1);

    if let Some(rollout) = phase(&output, "rollout") {
        assert!(rollout.start_frame > touchdown);
        let expected = frames
            .iter()
            .enumerate()
            .skip(touchdown + 1)
            .find(|(_, frame)| frame.bike_origin.x >= landing_end_x)
            .map(|(index, _)| index);
        assert_eq!(Some(rollout.start_frame), expected);
    }
}

#[test]
fn short_landing_hits_the_near_face_without_tunneling() {
    let mut scenario = scenario_by_id("landing-face");
    scenario.entry.start_x = -2.0;
    let profile = generate_terrain_profile(&scenario, 0.1);
    let front_reach = scenario.bike.wheelbase * 0.5 + scenario.bike.wheel_size * 0.0254 * 0.5;
    let output = solve_scenario(&scenario, "landing-face-near").expect("landing-face solve");
    let touchdown = output.simulation.touchdown.expect("landing-face touchdown");
    let index = frame_index_at(&output, touchdown.t);

    assert!(output.frames()[index].contact_impulse > 0.0);
    assert!(
        touchdown.bike_origin.x <= profile.landing_start_x + front_reach + 0.05,
        "bike crossed the near landing face before support was measured"
    );
    assert_eq!(output.landing.region.as_deref(), Some("case"));
    assert!(
        output.frames()[index..]
            .iter()
            .all(|frame| frame.min_clearance >= -0.01)
    );
}

#[test]
fn supported_run_has_only_an_approach_phase() {
    let scenario = scenario_by_id("flat-roll");
    let output = solve_scenario(&scenario, "flat-roll-phases").expect("flat-roll solve");

    assert!(output.simulation.takeoff.is_none());
    assert_eq!(output.landing.status, "no-flight");
    assert_eq!(
        output.phases,
        vec![PhaseInterval {
            name: "approach".to_string(),
            start_frame: 0,
            end_frame: output.frame_count - 1,
        }]
    );
}

#[test]
fn rejects_physics_rates_below_the_stability_minimum() {
    let mut scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).unwrap();
    scenario.solver.dt = 1.0 / 120.0;
    scenario.solver.substeps = 1;
    scenario.solver.output_hz = 60;

    let error = solve_scenario(&scenario, "too-coarse").unwrap_err();
    assert!(error.contains("at least 240 Hz"), "{error}");
}
