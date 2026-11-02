use rapier2d::na::ComplexField;

use crate::scenario::Scenario;

#[derive(Debug, Clone, PartialEq)]
pub enum EntryWindowStatus {
    Measured,
    Unavailable,
}

impl EntryWindowStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            EntryWindowStatus::Measured => "measured",
            EntryWindowStatus::Unavailable => "unavailable",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct EntrySpeedWindow {
    pub minimum: f32,
    pub maximum: f32,
    pub scenario_hash: String,
    pub solver_version: String,
    pub status: EntryWindowStatus,
    pub reason: Option<String>,
}

pub fn ballistic_height(y0: f32, vy0: f32, gravity: f32, t: f32) -> f32 {
    y0 + vy0 * t - 0.5 * gravity * t * t
}

pub fn spring_energy(k: f32, x: f32) -> f32 {
    0.5 * k * x * x
}

pub fn analyze_entry_speed_window(scenario: &Scenario) -> EntrySpeedWindow {
    let hash = scenario.canonical_hash().unwrap_or_else(|_| "0".repeat(64));

    let x = scenario.jump.gap.max(0.1);
    let theta = scenario.jump.lip_angle;
    let y_target = scenario.jump.lip_height + scenario.jump.step_delta;

    let numerator = 9.81 * x * x;
    let denominator = 2.0
        * ComplexField::powi(ComplexField::cos(theta), 2)
        * (scenario.jump.lip_height + x * ComplexField::tan(theta) - y_target)
            .abs()
            .max(0.01);

    if denominator <= 0.0 || !denominator.is_finite() {
        return EntrySpeedWindow {
            minimum: 0.0,
            maximum: 0.0,
            scenario_hash: hash,
            solver_version: scenario.solver.solver_version.clone(),
            status: EntryWindowStatus::Unavailable,
            reason: Some("insufficient ballistic geometry".to_string()),
        };
    }

    let min_speed = ComplexField::sqrt(numerator / denominator).clamp(0.5, 30.0);
    let max_speed = (min_speed + 6.0).clamp(min_speed, 30.0);

    EntrySpeedWindow {
        minimum: min_speed,
        maximum: max_speed,
        scenario_hash: hash,
        solver_version: scenario.solver.solver_version.clone(),
        status: EntryWindowStatus::Measured,
        reason: None,
    }
}
