#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Capabilities {
    pub deterministic: bool,
    pub supported_scenario_paths: Vec<String>,
    pub supported_outputs: Vec<String>,
    pub ccd: bool,
    pub contact_impulse: bool,
    pub rider_coupling: bool,
    pub rider_instinct: bool,
    pub suspension: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct MetricValue {
    pub value: Option<f32>,
    pub unit: String,
    pub source: String,
    pub reason: Option<String>,
}

/// Interleaved telemetry channels, one sample per output frame.
pub const TELEMETRY_LAYOUT_VERSION: u32 = 2;
pub const TELEMETRY_CHANNELS: [(&str, &str); 4] = [
    ("contactImpulse", "N*s"),
    ("actuatorWork", "J"),
    ("speed", "m/s"),
    ("comHeight", "m"),
];
pub const TELEMETRY_STRIDE_FLOAT32: usize = TELEMETRY_CHANNELS.len();

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
            "scenario.rider.strengthScale",
            "scenario.rider.coupling",
            "scenario.bike.wheelbase",
            "scenario.bike.mass",
            "scenario.bike.geometry",
            "scenario.poseClip",
            "scenario.solver.riderInstinct",
            "scenario.solver.riderInstinct.maxAngle",
            "scenario.solver.riderInstinct.maxOffset",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        supported_outputs: [
            "height",
            "velocity",
            "pitch",
            "contactImpulse",
            "actuatorWork",
            "riderState",
            "landingOutcome",
        ]
        .into_iter()
        .map(String::from)
        .collect(),
        ccd: true,
        contact_impulse: true,
        rider_coupling: true,
        rider_instinct: true,
        suspension: false,
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

pub fn unavailable_metric(unit: &str, reason: &str) -> MetricValue {
    MetricValue {
        value: None,
        unit: unit.to_string(),
        source: "unavailable".to_string(),
        reason: Some(reason.to_string()),
    }
}
