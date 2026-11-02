use physics_core::scenario::Scenario;
use physics_core::solver::solve_scenario;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");
const TWO_BODY_V1_RESULT_HASH: &str =
    "01fb9c4eb2dc3b738dbb75da3b36a0846abba29c3ea72da829584ae76e197b59";

#[test]
fn repeat_runs_and_snapshots_produce_stable_hashes() {
    let scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");

    let first = solve_scenario(&scenario, "run-1").expect("first run");
    let second = solve_scenario(&scenario, "run-2").expect("second run");

    assert_eq!(first.result_hash, second.result_hash);
    assert_eq!(first.result_hash, TWO_BODY_V1_RESULT_HASH);
    assert_eq!(first.frame_buffer, second.frame_buffer);
}
