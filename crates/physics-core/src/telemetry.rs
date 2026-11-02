use std::collections::BTreeMap;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub deterministic: bool,
    pub supported_scenario_paths: Vec<String>,
    pub supported_outputs: Vec<String>,
    pub ccd: bool,
    pub contact_impulse: bool,
    pub motor_work: bool,
    pub joint_torque: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct MetricValue {
    pub value: Option<f32>,
    pub unit: String,
    pub source: String,
    pub reason: Option<String>,
}

pub fn capabilities() -> Capabilities {
    Capabilities {
        deterministic: true,
        supported_scenario_paths: [
            "scenario.jump.kind",
            "scenario.jump.lipHeight",
            "scenario.jump.lipAngle",
            "scenario.jump.transitionLength",
            "scenario.jump.gap",
            "scenario.jump.stepDelta",
            "scenario.jump.landingAngle",
            "scenario.jump.landingLength",
            "scenario.jump.rollout",
            "scenario.entry.speed",
            "scenario.entry.startX",
            "scenario.rider.height",
            "scenario.rider.mass",
            "scenario.bike.wheelbase",
            "scenario.bike.mass",
            "scenario.bike.fork.travel",
            "scenario.bike.fork.sag",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        supported_outputs: [
            "height",
            "velocity",
            "pitch",
            "contactImpulse",
            "motorWork",
            "jointTorque",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        ccd: true,
        contact_impulse: true,
        motor_work: true,
        joint_torque: true,
    }
}

pub fn measured_metric(value: f32, unit: &str) -> MetricValue {
    MetricValue {
        value: Some(value),
        unit: unit.to_string(),
        source: "measured".to_string(),
        reason: None,
    }
}

pub fn pending_metric(unit: &str, reason: &str) -> MetricValue {
    MetricValue {
        value: None,
        unit: unit.to_string(),
        source: "pending-core".to_string(),
        reason: Some(reason.to_string()),
    }
}

pub fn build_metrics(
    max_height: f32,
    takeoff_speed: f32,
    energy_residual: f32,
    contact_impulse: f32,
    motor_work: f32,
) -> BTreeMap<String, MetricValue> {
    let mut map = BTreeMap::new();
    map.insert("maxHeight".to_string(), measured_metric(max_height, "m"));
    map.insert(
        "takeoffSpeed".to_string(),
        measured_metric(takeoff_speed, "m/s"),
    );
    map.insert(
        "energyResidual".to_string(),
        measured_metric(energy_residual, "J"),
    );
    map.insert(
        "contactImpulse".to_string(),
        measured_metric(contact_impulse, "N*s"),
    );
    map.insert("motorWork".to_string(), measured_metric(motor_work, "J"));
    map
}
