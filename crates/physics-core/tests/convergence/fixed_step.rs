use physics_core::scenario::Scenario;
use physics_core::solver::solve_scenario;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

#[test]
fn supported_timesteps_keep_max_height_within_a_bounded_envelope() {
    let mut scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");
    scenario.entry.start_x = -14.0;

    scenario.solver.dt = 1.0 / 240.0;
    let coarse = solve_scenario(&scenario, "run-coarse").expect("coarse solve");

    scenario.solver.dt = 1.0 / 480.0;
    let medium = solve_scenario(&scenario, "run-medium").expect("medium solve");

    scenario.solver.dt = 1.0 / 960.0;
    let fine = solve_scenario(&scenario, "run-fine").expect("fine solve");

    let heights = [
        coarse.summary.max_height,
        medium.summary.max_height,
        fine.summary.max_height,
    ];
    let minimum = heights.into_iter().fold(f32::INFINITY, f32::min);
    let maximum = heights.into_iter().fold(f32::NEG_INFINITY, f32::max);

    assert!(
        heights.into_iter().all(f32::is_finite),
        "non-finite timestep result: {heights:?}"
    );
    assert!(
        maximum - minimum <= 0.5,
        "timestep max-height envelope exceeded 0.5 m: {heights:?}"
    );
}
