pub mod analysis;
pub mod bike;
pub mod geometry;
pub mod pose;
pub mod rider;
pub mod rider_dynamics;
pub mod scenario;
pub mod simulation;
pub mod solver;
pub mod telemetry;
pub mod version;

use scenario::{BikeSpec, PoseClip, RiderSpec, Scenario};
use wasm_bindgen::prelude::*;

pub use version::{MODEL_VERSION, SOLVER_VERSION};

pub fn rapier_ready() -> &'static str {
    SOLVER_VERSION
}

pub fn inspect_bike_geometry_json(bike_json: &str) -> Result<String, String> {
    let bike: BikeSpec =
        serde_json::from_str(bike_json).map_err(|err| format!("invalid bike json: {err}"))?;
    let inspection = geometry::inspect_bike_geometry(&bike);
    serde_json::to_string(&inspection).map_err(|err| format!("serialize failed: {err}"))
}

pub fn validate_design_json(scenario_json: &str) -> Result<String, String> {
    let scenario: Scenario = serde_json::from_str(scenario_json)
        .map_err(|err| format!("invalid scenario json: {err}"))?;
    let validation = pose::validate_design(&scenario)?;
    serde_json::to_string(&validation).map_err(|err| format!("serialize failed: {err}"))
}

pub fn resolve_pose_edit_json(
    scenario_json: &str,
    key_index: usize,
    baseline_targets_json: &str,
    requested_targets_json: &str,
) -> Result<String, String> {
    let scenario: Scenario = serde_json::from_str(scenario_json)
        .map_err(|err| format!("invalid scenario json: {err}"))?;
    let baseline = serde_json::from_str(baseline_targets_json)
        .map_err(|err| format!("invalid baseline targets json: {err}"))?;
    let requested = serde_json::from_str(requested_targets_json)
        .map_err(|err| format!("invalid requested targets json: {err}"))?;
    let resolution = pose::resolve_pose_edit(&scenario, key_index, baseline, requested)?;
    serde_json::to_string(&resolution).map_err(|err| format!("serialize failed: {err}"))
}

#[wasm_bindgen(js_name = inspectBikeGeometry)]
pub fn inspect_bike_geometry_wasm(bike_json: &str) -> Result<String, JsValue> {
    inspect_bike_geometry_json(bike_json).map_err(|err| JsValue::from_str(&err))
}

#[wasm_bindgen(js_name = validateDesignJson)]
pub fn validate_design_wasm(scenario_json: &str) -> Result<String, JsValue> {
    validate_design_json(scenario_json).map_err(|err| JsValue::from_str(&err))
}

#[wasm_bindgen(js_name = resolvePoseEditJson)]
pub fn resolve_pose_edit_wasm(
    scenario_json: &str,
    key_index: usize,
    baseline_targets_json: &str,
    requested_targets_json: &str,
) -> Result<String, JsValue> {
    resolve_pose_edit_json(
        scenario_json,
        key_index,
        baseline_targets_json,
        requested_targets_json,
    )
    .map_err(|err| JsValue::from_str(&err))
}

#[wasm_bindgen(js_name = solveScenarioJson)]
pub fn solve_scenario_json(scenario_json: &str, run_id: &str) -> Result<String, JsValue> {
    let scenario: Scenario = serde_json::from_str(scenario_json)
        .map_err(|err| JsValue::from_str(&format!("invalid scenario json: {err}")))?;
    let output = solver::solve_scenario(&scenario, run_id)
        .map_err(|err| JsValue::from_str(&format!("solve failed: {err}")))?;
    serde_json::to_string(&output)
        .map_err(|err| JsValue::from_str(&format!("serialize failed: {err}")))
}

#[wasm_bindgen(js_name = solveFrameBuffer)]
pub fn solve_frame_buffer(scenario_json: &str, run_id: &str) -> Result<Vec<f32>, JsValue> {
    let scenario: Scenario = serde_json::from_str(scenario_json)
        .map_err(|err| JsValue::from_str(&format!("invalid scenario json: {err}")))?;
    let output = solver::solve_scenario(&scenario, run_id)
        .map_err(|err| JsValue::from_str(&format!("solve failed: {err}")))?;
    Ok(output.frame_buffer)
}

#[wasm_bindgen(js_name = solveTelemetryBuffer)]
pub fn solve_telemetry_buffer(scenario_json: &str, run_id: &str) -> Result<Vec<f32>, JsValue> {
    let scenario: Scenario = serde_json::from_str(scenario_json)
        .map_err(|err| JsValue::from_str(&format!("invalid scenario json: {err}")))?;
    let output = solver::solve_scenario(&scenario, run_id)
        .map_err(|err| JsValue::from_str(&format!("solve failed: {err}")))?;
    Ok(output.telemetry_buffer)
}

#[wasm_bindgen(js_name = terrainProfileJson)]
pub fn terrain_profile_json(scenario_json: &str, step: f32) -> Result<String, JsValue> {
    let scenario: Scenario = serde_json::from_str(scenario_json)
        .map_err(|err| JsValue::from_str(&format!("invalid scenario json: {err}")))?;
    scenario
        .validate()
        .map_err(|err| JsValue::from_str(&format!("invalid scenario: {err}")))?;
    let profile = geometry::generate_terrain_profile(&scenario, step);
    serde_json::to_string(&profile)
        .map_err(|err| JsValue::from_str(&format!("serialize failed: {err}")))
}

#[wasm_bindgen(js_name = samplePoseJson)]
pub fn sample_pose_json(
    pose_clip_json: &str,
    s: f32,
    rider_json: &str,
    bike_json: &str,
) -> Result<String, JsValue> {
    let clip: PoseClip = serde_json::from_str(pose_clip_json)
        .map_err(|err| JsValue::from_str(&format!("invalid poseClip json: {err}")))?;
    let rider: RiderSpec = serde_json::from_str(rider_json)
        .map_err(|err| JsValue::from_str(&format!("invalid rider json: {err}")))?;
    let bike: BikeSpec = serde_json::from_str(bike_json)
        .map_err(|err| JsValue::from_str(&format!("invalid bike json: {err}")))?;

    let sample = pose::sample_pose(&clip, s, &rider, &bike);
    let landmarks = &sample.landmarks;
    serde_json::to_string(&serde_json::json!({
        "s": sample.s,
        "targets": sample.targets,
        "derivedArm": {
            "shoulder": sample.derived_arm.shoulder,
            "elbow": sample.derived_arm.elbow,
            "constrained": sample.derived_arm.constrained
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
    }))
    .map_err(|err| JsValue::from_str(&format!("serialize failed: {err}")))
}

#[wasm_bindgen(js_name = analyzeSpeedWindowJson)]
pub fn analyze_speed_window_json(scenario_json: &str) -> Result<String, JsValue> {
    let scenario: Scenario = serde_json::from_str(scenario_json)
        .map_err(|err| JsValue::from_str(&format!("invalid scenario json: {err}")))?;
    let window = analysis::analyze_entry_speed_window(&scenario);

    serde_json::to_string(&serde_json::json!({
        "minimum": window.minimum,
        "maximum": window.maximum,
        "scenarioHash": window.scenario_hash,
        "solverVersion": window.solver_version,
        "status": window.status.as_str(),
        "reason": window.reason
    }))
    .map_err(|err| JsValue::from_str(&format!("serialize failed: {err}")))
}

#[wasm_bindgen(js_name = capabilitiesJson)]
pub fn capabilities_json() -> Result<String, JsValue> {
    serde_json::to_string(&telemetry::capabilities())
        .map_err(|err| JsValue::from_str(&format!("serialize failed: {err}")))
}

#[cfg(test)]
mod tests {
    use super::{rapier_ready, terrain_profile_json};

    const STANDARD_SCENARIO: &str =
        include_str!("../../../tests/fixtures/scenarios/standard-v1.json");

    #[test]
    fn reports_expected_feature_pin() {
        assert_eq!(
            rapier_ready(),
            "rapier-0.35.2-two-wheel-contact-v5-geometry-v1-mass-distribution-v1"
        );
    }

    #[test]
    fn terrain_export_is_camel_case_and_byte_deterministic() {
        let first = terrain_profile_json(STANDARD_SCENARIO, 0.1).expect("terrain export");
        let second = terrain_profile_json(STANDARD_SCENARIO, 0.1).expect("terrain export");
        assert_eq!(first, second);

        let value: serde_json::Value = serde_json::from_str(&first).unwrap();
        assert!(value.get("approachStartX").is_some());
        assert!(value.get("landingStartX").is_some());
        assert!(value.get("sampleStep").is_some());
        assert!(value["segments"].as_array().unwrap().iter().all(|segment| {
            segment.get("id").is_some()
                && segment.get("kind").is_some()
                && segment["points"]
                    .as_array()
                    .is_some_and(|points| points.len() >= 2)
        }));
    }
}
