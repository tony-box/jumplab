use physics_core::scenario::Scenario;
use physics_core::solver::solve_scenario;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");
const GROUND_CONTACT_V3_RESULT_HASH: &str =
    "5a4c6f346a3c94659ab999deadb22d37845b883b688a9d54b570feefaea7d3a6";

#[test]
fn repeat_runs_and_snapshots_produce_stable_hashes() {
    let scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");

    let first = solve_scenario(&scenario, "run-1").expect("first run");
    let second = solve_scenario(&scenario, "run-2").expect("second run");

    assert_eq!(first.result_hash, second.result_hash);
    assert_eq!(first.result_hash, GROUND_CONTACT_V3_RESULT_HASH);
    assert_eq!(first.frames, second.frames);
}
