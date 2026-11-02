use std::{env, fs};

use physics_core::{
    SOLVER_VERSION,
    analysis::analyze_entry_speed_window,
    geometry::{generate_terrain_profile, inspect_bike_geometry},
    pose::{sample_pose, validate_design},
    scenario::Scenario,
    solver::solve_scenario,
};
use serde_json::json;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let scenario_path = env::args().nth(1).ok_or("scenario path is required")?;
    let scenario: Scenario = serde_json::from_str(&fs::read_to_string(scenario_path)?)?;
    let run_id = "11111111-1111-4111-8111-111111111111";
    let solve = solve_scenario(&scenario, run_id).map_err(std::io::Error::other)?;
    let pose = sample_pose(&scenario.pose_clip, -1.0, &scenario.rider, &scenario.bike);
    let speed_window = analyze_entry_speed_window(&scenario);
    let terrain = generate_terrain_profile(&scenario, 0.05);
    let geometry = inspect_bike_geometry(&scenario.bike);
    let design_validation = validate_design(&scenario).map_err(std::io::Error::other)?;
    let landmarks = &pose.landmarks;

    println!(
        "{}",
        serde_json::to_string(&json!({
            "resultHash": solve.result_hash,
            "solveDetails": {
                "scenarioHash": solve.scenario_hash,
                "solverVersion": solve.solver_version,
                "outputHz": solve.output_hz,
                "strideFloat32": solve.stride_float32,
                "frameCount": solve.frames.len(),
                "phases": solve.phases,
                "metrics": solve.metrics,
                "telemetrySampleCount": solve.telemetry_buffer.len(),
                "resultHash": solve.result_hash
            },
            "pose": {
                "s": pose.s,
                "targets": pose.targets,
                "derivedArm": {
                    "shoulder": pose.derived_arm.shoulder,
                    "elbow": pose.derived_arm.elbow,
                    "constrained": pose.derived_arm.constrained
                },
                "landmarks": {
                    "pedalContact": { "x": landmarks.pedal_contact.x, "y": landmarks.pedal_contact.y },
                    "ankle": { "x": landmarks.ankle.x, "y": landmarks.ankle.y },
                    "knee": { "x": landmarks.knee.x, "y": landmarks.knee.y },
                    "hip": { "x": landmarks.hip.x, "y": landmarks.hip.y },
                    "shoulder": { "x": landmarks.shoulder.x, "y": landmarks.shoulder.y },
                    "elbow": { "x": landmarks.elbow.x, "y": landmarks.elbow.y },
                    "hand": { "x": landmarks.hand.x, "y": landmarks.hand.y },
                    "handlebarContact": { "x": landmarks.handlebar_contact.x, "y": landmarks.handlebar_contact.y },
                    "head": { "x": landmarks.head.x, "y": landmarks.head.y }
                },
                "solverVersion": SOLVER_VERSION
            },
            "terrain": terrain,
            "geometry": geometry,
            "designValidation": design_validation,
            "speedWindow": {
                "minimum": speed_window.minimum,
                "maximum": speed_window.maximum,
                "scenarioHash": speed_window.scenario_hash,
                "solverVersion": speed_window.solver_version,
                "status": speed_window.status.as_str(),
                "reason": speed_window.reason
            }
        }))?
    );

    Ok(())
}
