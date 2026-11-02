//! Landing classification on the standard jump: the outcome must describe where and how the
//! bike landed, and crash detection must come from real rider or bike contact.

use physics_core::scenario::Scenario;
use physics_core::simulation::{SimulationOptions, simulate};
use physics_core::solver::{SolveOutput, solve_scenario};

const STANDARD_SCENARIO: &str = include_str!("../../../tests/fixtures/scenarios/standard-v1.json");
const RUN_ID: &str = "11111111-1111-4111-8111-111111111111";

fn standard_at(speed: f32) -> Scenario {
    let mut scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid standard scenario");
    scenario.entry.speed = speed;
    scenario
}

fn solve_at(speed: f32) -> SolveOutput {
    solve_scenario(&standard_at(speed), RUN_ID).expect("solve succeeds")
}

#[test]
fn too_slow_to_leave_the_ground_is_no_flight() {
    let landing = solve_at(6.0).landing;
    assert_eq!(landing.status, "no-flight");
    assert_eq!(landing.region, None);
    assert_eq!(landing.severity, "clean");
}

#[test]
fn short_jump_cases_the_deck_without_crashing() {
    let landing = solve_at(7.5).landing;
    assert_eq!(landing.status, "landed");
    assert_eq!(landing.region.as_deref(), Some("case"));
    assert_eq!(landing.severity, "clean");
    assert!(
        landing
            .reasons
            .iter()
            .any(|reason| reason.contains("cased"))
    );
}

#[test]
fn matched_speed_lands_balanced_in_the_sweet_spot() {
    let landing = solve_at(10.8).landing;
    assert_eq!(landing.region.as_deref(), Some("sweet-spot"));
    assert_eq!(landing.attitude.as_deref(), Some("balanced"));
    assert_eq!(landing.severity, "clean");
    assert!(landing.reasons.is_empty(), "{:?}", landing.reasons);
}

#[test]
fn overshooting_flat_out_is_classified_and_crashes() {
    let landing = solve_at(13.0).landing;
    assert_eq!(landing.region.as_deref(), Some("overshoot"));
    assert_eq!(landing.severity, "crash");
    assert!(landing.crash_time.is_some());
}

#[test]
fn deep_compression_keeps_the_knee_on_the_riding_side() {
    // About 5 g through the kicker folds the rider to the skeletal stop. The knee must stay
    // clockwise of the pedal-to-hip line (forward of the leg) instead of flipping through it.
    let simulation =
        simulate(&standard_at(16.0), &SimulationOptions::default()).expect("simulates");
    for frame in &simulation.frames {
        let landmarks = &frame.skeleton.landmarks;
        let (pedal, hip, knee) = (landmarks.pedal_contact, landmarks.hip, landmarks.knee);
        let cross = (hip.x - pedal.x) * (knee.y - pedal.y) - (hip.y - pedal.y) * (knee.x - pedal.x);
        assert!(cross < 0.0, "knee flipped at t={}: {knee:?}", frame.t);
    }
}
