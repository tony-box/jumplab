use physics_core::analysis::analyze_entry_speed_window;
use physics_core::scenario::{JumpKind, Scenario};

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

#[test]
fn computes_entry_speed_window() {
    let scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");
    let window = analyze_entry_speed_window(&scenario);

    assert!(window.minimum <= window.maximum);
    assert_eq!(window.status.as_str(), "measured");
}

#[test]
fn drop_speed_window_uses_its_falling_exit_tangent() {
    let mut falling: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");
    falling.jump.kind = JumpKind::Drop;
    falling.jump.lip_angle = -0.2;
    falling.jump.step_delta = -1.5;
    falling.validate().expect("valid drop");

    let mut level = falling.clone();
    level.jump.lip_angle = 0.0;

    let falling_window = analyze_entry_speed_window(&falling);
    let level_window = analyze_entry_speed_window(&level);

    assert_ne!(falling_window.minimum, level_window.minimum);
    assert_ne!(falling_window.maximum, level_window.maximum);
}
