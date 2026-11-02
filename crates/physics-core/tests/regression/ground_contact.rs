use std::fs;
use std::path::{Path, PathBuf};

use physics_core::geometry::{
    generate_terrain_profile, nearest_surface_clearance, nearest_surface_distance,
    terrain_height_at,
};
use physics_core::scenario::{JumpKind, Scenario};
use physics_core::solver::{
    FRAME_STRIDE_FLOAT32, MAX_SOLVE_DURATION_SECONDS, POST_LANDING_FOLLOW_SECONDS, PhaseInterval,
    SolveOutput, TAKEOFF_CLEARANCE_M, solve_scenario,
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
            let scenario = serde_json::from_value(scenario).expect("valid merged scenario");
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

/// Start of the first airborne interval that reaches real flight clearance, matching how the
/// solver classifies phases.
fn first_takeoff(output: &SolveOutput) -> Option<usize> {
    let frames = &output.frames;
    let mut start = None;
    for (index, frame) in frames.iter().enumerate() {
        match (frame.airborne, start) {
            (true, None) => start = Some(index),
            (false, Some(_)) => start = None,
            _ => {}
        }
        if let Some(begin) = start
            && frame.min_clearance > TAKEOFF_CLEARANCE_M
            && begin > 0
        {
            return Some(begin);
        }
    }
    None
}

fn first_touchdown_after(output: &SolveOutput, takeoff: usize) -> Option<usize> {
    output.frames[takeoff..]
        .windows(2)
        .position(|frames| frames[0].airborne && !frames[1].airborne)
        .map(|index| takeoff + index + 1)
}

fn phase<'a>(output: &'a SolveOutput, name: &str) -> Option<&'a PhaseInterval> {
    output.phases.iter().find(|phase| phase.name == name)
}

#[test]
fn runs_follow_the_rider_for_three_seconds_after_touchdown_and_stay_supported() {
    let scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");
    let output = solve_scenario(&scenario, "follow-window").expect("standard solve");

    let launch = output
        .frames
        .iter()
        .position(|frame| frame.airborne && frame.min_clearance > TAKEOFF_CLEARANCE_M)
        .expect("flight");
    let touchdown = output.frames[launch..]
        .iter()
        .find(|frame| !frame.airborne)
        .map(|frame| frame.t)
        .expect("touchdown");
    let last = output.frames.last().expect("frames");

    let expected_end = (touchdown + POST_LANDING_FOLLOW_SECONDS).min(MAX_SOLVE_DURATION_SECONDS);
    assert!(
        (last.t - expected_end).abs() < 0.05,
        "run ended at {} instead of {expected_end}",
        last.t
    );

    // Following that long is only meaningful if the run-out still carries the rider.
    let left_surface = output
        .frames
        .iter()
        .find(|frame| frame.t > touchdown + 0.5 && frame.airborne && frame.min_clearance > 0.005);
    assert!(
        left_surface.is_none(),
        "rider left the run-out at {:?}",
        left_surface.map(|frame| (frame.t, frame.x, frame.y, frame.min_clearance))
    );
    assert!(
        !last.airborne,
        "run ended airborne at {:?}",
        (last.t, last.x, last.y, last.min_clearance)
    );
}

#[test]
fn standard_run_reaches_the_end_of_landing_and_rollout() {
    let scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).expect("standard scenario");
    let profile = generate_terrain_profile(&scenario, 0.1);
    let landing_end_x = profile.landing_start_x + scenario.jump.landing_length;
    let rollout_confirmation_x = landing_end_x + scenario.jump.rollout.min(2.0);
    let output = solve_scenario(&scenario, "standard-complete-landing").expect("standard solve");
    let final_frame = output.frames.last().expect("final frame");

    assert!(
        final_frame.x >= rollout_confirmation_x,
        "final x {} did not reach rollout confirmation x {}",
        final_frame.x,
        rollout_confirmation_x
    );
    assert!(phase(&output, "rollout").is_some());
}

#[test]
fn landing_rollout_join_retains_finite_rear_wheel_contact() {
    let mut scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("standard scenario");
    scenario.jump.lip_height = 0.9;
    scenario.jump.lip_angle = 0.62;
    scenario.jump.transition_length = 2.0;
    scenario.jump.gap = 4.0;
    scenario.jump.landing_angle = 0.3;
    scenario.jump.landing_length = 6.0;
    scenario.entry.speed = 7.0;
    let landing_end_x =
        scenario.jump.transition_length + scenario.jump.gap + scenario.jump.landing_length;
    let output = solve_scenario(&scenario, "smooth-rollout-join").expect("landing solve");
    let join_frames: Vec<_> = output
        .frames
        .iter()
        .filter(|frame| {
            frame.x >= landing_end_x - 0.6 && frame.x <= landing_end_x + scenario.bike.wheelbase
        })
        .collect();

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
        if !matches!(scenario.jump.kind, JumpKind::Table)
            && scenario.jump.landing_angle.abs() > f32::EPSILON
            && scenario.jump.landing_length > 0.0
        {
            assert!(
                profile
                    .segments
                    .iter()
                    .any(|segment| segment.kind == "landing-face")
            );
        }
        assert_eq!(
            profile
                .segments
                .iter()
                .any(|segment| segment.kind == "table-deck"),
            matches!(scenario.jump.kind, physics_core::scenario::JumpKind::Table)
                && scenario.jump.gap > 0.0
        );

        if scenario.jump.gap > 0.0
            && !matches!(scenario.jump.kind, physics_core::scenario::JumpKind::Table)
        {
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
fn canonical_solves_obey_contact_frame_invariants() {
    assert_eq!(FRAME_STRIDE_FLOAT32, 36);

    for (entry, scenario) in scenarios() {
        let output = solve_scenario(&scenario, &entry.id).expect("canonical solve");
        assert_eq!(output.frame_buffer.len() % 36, 0, "{} stride", entry.id);
        assert!(!output.frames.is_empty(), "{} frames", entry.id);

        for frame in &output.frames {
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
                !output.frames.last().unwrap().airborne,
                "{} final frame",
                entry.id
            );
        }

        if matches!(
            entry.id.as_str(),
            "flat-roll" | "low-speed" | "entry-coverage"
        ) {
            // Riding a ball over a faceted convex crest shows sub-millimetre gaps, so require a
            // clearance a real takeoff would produce.
            let launched = output
                .frames
                .iter()
                .find(|frame| frame.airborne && frame.min_clearance > 0.005);
            assert!(
                launched.is_none(),
                "{} unexpectedly took off at {:?}",
                entry.id,
                launched.map(|frame| (frame.t, frame.x, frame.y, frame.min_clearance))
            );
            assert!(
                output
                    .phases
                    .iter()
                    .all(|phase| phase.name != "takeoff" && phase.name != "flight")
            );
        }

        // Only the genuinely flat fixtures hold a constant height; low-speed still rides its lip.
        if matches!(entry.id.as_str(), "flat-roll" | "entry-coverage") {
            let min_y = output
                .frames
                .iter()
                .map(|frame| frame.y)
                .fold(f32::INFINITY, f32::min);
            let max_y = output
                .frames
                .iter()
                .map(|frame| frame.y)
                .fold(f32::NEG_INFINITY, f32::max);
            assert!(max_y - min_y < 0.01, "{} flat-height drift", entry.id);
        }

        if entry.id == "curved-lip" {
            let profile = generate_terrain_profile(&scenario, 0.1);
            let lip_frames: Vec<_> = output
                .frames
                .iter()
                .filter(|frame| frame.x >= 0.0 && frame.x <= profile.lip_x)
                .collect();
            assert!(lip_frames.iter().any(|frame| frame.pitch > 0.05));
            assert!(
                lip_frames
                    .windows(2)
                    .all(|pair| (pair[1].pitch - pair[0].pitch).abs() < 0.2)
            );
        }

        if entry.id == "anchor-mismatch" {
            let first = &output.frames[0];
            assert!(
                first.y.abs() < 0.01,
                "frame y must be the ground-line anchor"
            );
            assert!(first.pitch.abs() < 0.01);
        }
    }
}

#[test]
fn stepdown_touchdown_is_measured_and_primary_phases_follow_contact_transitions() {
    let scenario = scenario_by_id("stepdown-edge");
    let landing_end_x =
        generate_terrain_profile(&scenario, 0.1).landing_start_x + scenario.jump.landing_length;
    let output = solve_scenario(&scenario, "stepdown-transition").expect("stepdown solve");
    let takeoff = first_takeoff(&output).expect("stepdown takeoff transition");
    let touchdown = first_touchdown_after(&output, takeoff).expect("stepdown touchdown transition");

    assert!(!output.frames[takeoff - 1].airborne);
    assert!(output.frames[takeoff].airborne);
    assert!(output.frames[takeoff].min_clearance >= -0.01);
    assert!(
        touchdown > takeoff + 1,
        "stepdown flight interval was empty"
    );
    assert!(
        output.frames[takeoff..touchdown]
            .iter()
            .all(|frame| frame.airborne
                && frame.contact_impulse == 0.0
                && frame.min_clearance >= -0.01),
        "stepdown did not separate cleanly from support"
    );

    let previous = &output.frames[touchdown - 1];
    let landed = &output.frames[touchdown];
    assert!(previous.airborne);
    assert_eq!(previous.contact_impulse, 0.0);
    assert!(!landed.airborne);
    assert!(landed.contact_impulse > 0.0);
    assert!(
        output.frames[touchdown..]
            .iter()
            .all(|frame| frame.min_clearance >= -0.01),
        "stepdown landing penetrated after touchdown"
    );

    assert_eq!(
        phase(&output, "approach"),
        Some(&PhaseInterval {
            name: "approach".to_string(),
            start_frame: 0,
            end_frame: takeoff - 1,
        })
    );
    assert_eq!(phase(&output, "takeoff").unwrap().start_frame, takeoff);
    assert_eq!(phase(&output, "takeoff").unwrap().end_frame, takeoff);
    assert_eq!(phase(&output, "flight").unwrap().start_frame, takeoff + 1);
    assert_eq!(phase(&output, "flight").unwrap().end_frame, touchdown - 1);
    assert_eq!(phase(&output, "landing").unwrap().start_frame, touchdown);
    assert_eq!(phase(&output, "landing").unwrap().end_frame, touchdown);

    if let Some(rollout) = phase(&output, "rollout") {
        assert!(rollout.start_frame > touchdown);
        // Rollout starts at the first frame after landing that reaches the end of the slope, even
        // when a long flight already carried the rider past it.
        let expected = output
            .frames
            .iter()
            .enumerate()
            .skip(touchdown + 1)
            .find(|(_, frame)| frame.x >= landing_end_x)
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
    let takeoff = first_takeoff(&output).expect("landing-face takeoff transition");
    let touchdown = first_touchdown_after(&output, takeoff).expect("landing-face touchdown");

    assert!(output.frames[touchdown - 1].airborne);
    assert!(output.frames[touchdown].contact_impulse > 0.0);
    assert!(
        output.frames[touchdown].x <= profile.landing_start_x + front_reach + 0.05,
        "bike crossed the near landing face before support was measured"
    );
    assert!(
        output.frames[touchdown..]
            .iter()
            .all(|frame| frame.min_clearance >= -0.01)
    );
}

#[test]
fn supported_run_has_only_an_approach_phase() {
    let scenario = scenario_by_id("flat-roll");
    let output = solve_scenario(&scenario, "flat-roll-phases").expect("flat-roll solve");

    let takeoff = first_takeoff(&output);
    assert!(
        takeoff.is_none(),
        "flat run lost support at frame {:?}, time {:?}",
        takeoff,
        takeoff.map(|index| output.frames[index].t)
    );
    assert_eq!(
        output.phases,
        vec![PhaseInterval {
            name: "approach".to_string(),
            start_frame: 0,
            end_frame: output.frames.len() - 1,
        }]
    );
}

#[test]
fn rejects_substep_displacement_at_or_above_wheel_radius() {
    let mut scenario: Scenario = serde_json::from_str(STANDARD_SCENARIO).unwrap();
    let wheel_radius = scenario.bike.wheel_size * 0.0254 * 0.5;
    scenario.solver.dt = 0.1;
    scenario.solver.substeps = 1;
    scenario.solver.output_hz = 10;
    scenario.entry.speed = wheel_radius / scenario.solver.dt;

    let error = solve_scenario(&scenario, "invalid-displacement").unwrap_err();
    assert!(error.contains("must be below wheel radius"));
}
