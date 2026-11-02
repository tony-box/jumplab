use physics_core::scenario::Scenario;
use physics_core::solver::solve_scenario;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

fn measured(output: &physics_core::solver::SolveOutput, name: &str) -> f32 {
    output.metrics[name]
        .value
        .unwrap_or_else(|| panic!("{name} unavailable"))
}

/// Refining the physics step must move results toward the finest solution: the 1/480 s error
/// against 1/960 s has to be smaller than the 1/240 s error, and every rate stays close.
#[test]
fn flight_metrics_converge_as_the_physics_step_shrinks() {
    let mut scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");
    scenario.entry.speed = 11.0;
    scenario.solver.substeps = 1;
    scenario.solver.output_hz = 240;

    let runs: Vec<_> = [1.0 / 240.0, 1.0 / 480.0, 1.0 / 960.0]
        .into_iter()
        .map(|dt| {
            let mut candidate = scenario.clone();
            candidate.solver.dt = dt;
            solve_scenario(&candidate, "convergence").expect("solve")
        })
        .collect();

    // Smooth flight quantities must converge monotonically; jump distance depends on discrete
    // contact events, so it only has to stay within its spread.
    for (name, tolerance, monotone) in [
        ("maxHeightAboveLip", 0.1, true),
        ("airtime", 0.05, true),
        ("jumpDistance", 0.3, false),
    ] {
        let values: Vec<f32> = runs.iter().map(|run| measured(run, name)).collect();
        let coarse_error = (values[0] - values[2]).abs();
        let medium_error = (values[1] - values[2]).abs();
        assert!(
            coarse_error <= tolerance && medium_error <= tolerance,
            "{name} spread too wide across steps: {values:?}"
        );
        assert!(
            !monotone || medium_error <= coarse_error + 1.0e-3,
            "{name} did not converge: {values:?}"
        );
    }
}
