//! Entry-speed window: the range of approach speeds that produce a clean landing, measured by
//! running the solver rather than estimated from point-mass ballistics.

use crate::outcome::classify_landing;
use crate::scenario::Scenario;
use crate::simulation::{SimulationOptions, simulate};
use crate::version::SOLVER_VERSION;

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

pub const SWEEP_MIN_SPEED: f32 = 2.0;
pub const SWEEP_MAX_SPEED: f32 = 18.0;
pub const SWEEP_STEP: f32 = 1.0;
const REFINE_ITERATIONS: usize = 5;

/// A landing counts as clean when it touches down on the landing (not the deck or the flat),
/// matches the slope within tolerance, and nobody crashes.
pub fn is_clean_landing(scenario: &Scenario, speed: f32) -> bool {
    let mut candidate = scenario.clone();
    candidate.entry.speed = speed;
    let Ok(simulation) = simulate(&candidate, &SimulationOptions::default()) else {
        return false;
    };
    let outcome = classify_landing(&candidate, &simulation);
    outcome.status == "landed"
        && outcome.severity == "clean"
        && outcome.attitude.as_deref() == Some("balanced")
        && matches!(
            outcome.region.as_deref(),
            Some("early" | "sweet-spot" | "late")
        )
}

fn refine(scenario: &Scenario, mut clean: f32, mut dirty: f32) -> f32 {
    for _ in 0..REFINE_ITERATIONS {
        let middle = 0.5 * (clean + dirty);
        if is_clean_landing(scenario, middle) {
            clean = middle;
        } else {
            dirty = middle;
        }
    }
    clean
}

pub fn analyze_entry_speed_window(scenario: &Scenario) -> EntrySpeedWindow {
    let hash = scenario.canonical_hash().unwrap_or_else(|_| "0".repeat(64));
    let unavailable = |reason: &str| EntrySpeedWindow {
        minimum: 0.0,
        maximum: 0.0,
        scenario_hash: hash.clone(),
        solver_version: SOLVER_VERSION.to_string(),
        status: EntryWindowStatus::Unavailable,
        reason: Some(reason.to_string()),
    };
    if let Err(error) = scenario.validate() {
        return unavailable(&format!("invalid scenario: {error}"));
    }

    let steps = ((SWEEP_MAX_SPEED - SWEEP_MIN_SPEED) / SWEEP_STEP).round() as usize;
    let speeds: Vec<f32> = (0..=steps)
        .map(|index| SWEEP_MIN_SPEED + index as f32 * SWEEP_STEP)
        .collect();
    let clean: Vec<bool> = speeds
        .iter()
        .map(|speed| is_clean_landing(scenario, *speed))
        .collect();

    let mut best: Option<(usize, usize)> = None;
    let mut index = 0;
    while index < clean.len() {
        if !clean[index] {
            index += 1;
            continue;
        }
        let start = index;
        while index + 1 < clean.len() && clean[index + 1] {
            index += 1;
        }
        if best.is_none_or(|(low, high)| index - start > high - low) {
            best = Some((start, index));
        }
        index += 1;
    }

    let Some((low, high)) = best else {
        return unavailable(&format!(
            "no entry speed between {SWEEP_MIN_SPEED} and {SWEEP_MAX_SPEED} m/s lands cleanly"
        ));
    };
    let minimum = if low == 0 {
        speeds[0]
    } else {
        refine(scenario, speeds[low], speeds[low - 1])
    };
    let maximum = if high + 1 == speeds.len() {
        speeds[high]
    } else {
        refine(scenario, speeds[high], speeds[high + 1])
    };

    EntrySpeedWindow {
        minimum,
        maximum,
        scenario_hash: hash,
        solver_version: SOLVER_VERSION.to_string(),
        status: EntryWindowStatus::Measured,
        reason: None,
    }
}
