//! Landing classification and run metrics derived from a simulation.

use std::collections::BTreeMap;

use crate::geometry::terrain_slope_angle_at;
use crate::pose::wrap_angle;
use crate::scenario::{JumpKind, Scenario};
use crate::simulation::{CrashReason, EndReason, SimFrame, Simulation};
use crate::telemetry::{MetricValue, measured_metric, unavailable_metric};

/// Landings that start this far into the landing count as the sweet spot.
pub const SWEET_SPOT_START_FRACTION: f32 = 0.15;
pub const SWEET_SPOT_END_FRACTION: f32 = 0.5;
/// Pitch mismatch with the landing slope beyond which a landing is nose- or tail-heavy.
pub const ATTITUDE_TOLERANCE_RAD: f32 = 0.17;
/// Window after touchdown over which the landing impulse is collected.
pub const LANDING_WINDOW_S: f32 = 0.2;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LandingOutcome {
    /// `landed`, `no-flight`, `stalled`, or `airborne-at-end`.
    pub status: String,
    /// `case`, `early`, `sweet-spot`, `late`, or `overshoot` when the bike landed.
    pub region: Option<String>,
    /// `nose-heavy`, `balanced`, or `tail-heavy` when the bike landed.
    pub attitude: Option<String>,
    /// `rear`, `front`, or `both` when the bike landed.
    pub first_contact: Option<String>,
    /// `clean` or `crash`.
    pub severity: String,
    pub crash_time: Option<f32>,
    pub reasons: Vec<String>,
}

fn landing_zone(scenario: &Scenario, simulation: &Simulation) -> (f32, f32) {
    let start = simulation.terrain.landing_start_x;
    (start, start + scenario.jump.landing_length)
}

pub fn sweet_spot_x(scenario: &Scenario, simulation: &Simulation) -> f32 {
    let (start, end) = landing_zone(scenario, simulation);
    start + 0.5 * (SWEET_SPOT_START_FRACTION + SWEET_SPOT_END_FRACTION) * (end - start)
}

pub fn classify_landing(scenario: &Scenario, simulation: &Simulation) -> LandingOutcome {
    let mut reasons = Vec::new();
    let crash_time = simulation.crash.as_ref().map(|crash| crash.t);
    if let Some(crash) = &simulation.crash {
        reasons.push(match &crash.reason {
            CrashReason::RiderTerrainContact { part } => {
                format!("rider {part} reached the ground at {:.2} s", crash.t)
            }
            CrashReason::Inverted => format!("bike inverted at {:.2} s", crash.t),
        });
    }
    let severity = if crash_time.is_some() {
        "crash"
    } else {
        "clean"
    }
    .to_string();

    let (Some(_), Some(touchdown)) = (simulation.takeoff, simulation.touchdown) else {
        let status = match (simulation.takeoff, simulation.end_reason) {
            (Some(_), _) => "airborne-at-end",
            (None, EndReason::Stalled) => "stalled",
            (None, _) => "no-flight",
        };
        reasons.push(match status {
            "stalled" => "speed ran out before the jump".to_string(),
            "airborne-at-end" => "the run ended before touchdown".to_string(),
            _ => "the bike never left the ground".to_string(),
        });
        return LandingOutcome {
            status: status.to_string(),
            region: None,
            attitude: None,
            first_contact: None,
            severity,
            crash_time,
            reasons,
        };
    };

    let (start, end) = landing_zone(scenario, simulation);
    let length = end - start;
    let x = touchdown.contact_x;
    let region = if x < start {
        if matches!(scenario.jump.kind, JumpKind::Table) {
            reasons.push(format!(
                "cased the deck {:.2} m short of the landing",
                start - x
            ));
        } else {
            reasons.push(format!("came up {:.2} m short of the landing", start - x));
        }
        "case"
    } else if x < start + SWEET_SPOT_START_FRACTION * length {
        "early"
    } else if x <= start + SWEET_SPOT_END_FRACTION * length {
        "sweet-spot"
    } else if x <= end {
        "late"
    } else {
        reasons.push(format!("overshot the landing by {:.2} m", x - end));
        "overshoot"
    };

    let attitude = terrain_slope_angle_at(&simulation.terrain, x).map(|slope| {
        let error = wrap_angle(touchdown.pitch - slope);
        if error < -ATTITUDE_TOLERANCE_RAD {
            reasons.push(format!(
                "nose {:.0} deg below the slope at touchdown",
                (-error).to_degrees()
            ));
            "nose-heavy"
        } else if error > ATTITUDE_TOLERANCE_RAD {
            reasons.push(format!(
                "nose {:.0} deg above the slope at touchdown",
                error.to_degrees()
            ));
            "tail-heavy"
        } else {
            "balanced"
        }
    });

    let first_contact = match (touchdown.rear, touchdown.front) {
        (true, true) => "both",
        (false, true) => "front",
        _ => "rear",
    };

    LandingOutcome {
        status: "landed".to_string(),
        region: Some(region.to_string()),
        attitude: attitude.map(str::to_string),
        first_contact: Some(first_contact.to_string()),
        severity,
        crash_time,
        reasons,
    }
}

fn residual(frame: &SimFrame) -> f32 {
    frame.energy - frame.actuator_work
}

fn frame_at(frames: &[SimFrame], t: f32) -> usize {
    frames
        .iter()
        .position(|frame| frame.t >= t)
        .unwrap_or(frames.len().saturating_sub(1))
}

pub fn build_metrics(
    scenario: &Scenario,
    simulation: &Simulation,
) -> BTreeMap<String, MetricValue> {
    let mut metrics = BTreeMap::new();
    let frames = &simulation.frames;
    let mut insert = |name: &str, metric: MetricValue| {
        metrics.insert(name.to_string(), metric);
    };
    let Some(last) = frames.last() else {
        return metrics;
    };
    let first = &frames[0];

    insert("actuatorWork", measured_metric(last.actuator_work, "J"));
    insert(
        "actuatorWorkPositive",
        measured_metric(last.actuator_work_positive, "J"),
    );
    insert(
        "actuatorWorkNegative",
        measured_metric(last.actuator_work_negative, "J"),
    );
    let tracking = (frames
        .iter()
        .map(|frame| {
            let dx = frame.relative.com.x - frame.target.com.x;
            let dy = frame.relative.com.y - frame.target.com.y;
            dx * dx + dy * dy
        })
        .sum::<f32>()
        / frames.len() as f32)
        .sqrt();
    insert("trackingError", measured_metric(tracking, "m"));
    let peak_force = frames
        .iter()
        .map(|frame| frame.normal_force_rear + frame.normal_force_front)
        .fold(0.0f32, f32::max);
    insert("peakNormalForce", measured_metric(peak_force, "N"));
    insert(
        "instinctPeakAngle",
        measured_metric(simulation.instinct.peak_angle, "rad"),
    );
    insert(
        "instinctPeakOffset",
        measured_metric(simulation.instinct.peak_offset, "m"),
    );
    insert(
        "instinctSaturatedTime",
        measured_metric(simulation.instinct.saturated_seconds, "s"),
    );
    insert(
        "instinctEffort",
        measured_metric(simulation.instinct.effort, "s"),
    );

    let flight_metrics = [
        ("takeoffSpeed", "m/s"),
        ("takeoffAngle", "rad"),
        ("airtime", "s"),
        ("jumpDistance", "m"),
        ("landingX", "m"),
        ("sweetSpotOffset", "m"),
        ("landingPitchError", "rad"),
        ("airRotation", "rad"),
        ("maxHeightAboveLip", "m"),
        ("landingImpulse", "N*s"),
        ("landingForce", "N"),
        ("energyResidual", "J"),
        ("impactEnergyLoss", "J"),
    ];

    let Some(takeoff) = simulation.takeoff else {
        for (name, unit) in flight_metrics {
            insert(
                name,
                unavailable_metric(unit, "the bike never left the ground"),
            );
        }
        return metrics;
    };
    let velocity = takeoff.system_velocity;
    insert(
        "takeoffSpeed",
        measured_metric(
            (velocity.x * velocity.x + velocity.y * velocity.y).sqrt(),
            "m/s",
        ),
    );
    insert(
        "takeoffAngle",
        measured_metric(libm::atan2f(velocity.y, velocity.x), "rad"),
    );

    let Some(touchdown) = simulation.touchdown else {
        for (name, unit) in &flight_metrics[2..] {
            insert(
                name,
                unavailable_metric(unit, "the run ended before touchdown"),
            );
        }
        return metrics;
    };
    let takeoff_index = frame_at(frames, takeoff.t);
    let touchdown_index = frame_at(frames, touchdown.t);
    let flight = &frames[takeoff_index..=touchdown_index.max(takeoff_index)];

    insert("airtime", measured_metric(touchdown.t - takeoff.t, "s"));
    insert(
        "jumpDistance",
        measured_metric(touchdown.bike_origin.x - takeoff.bike_origin.x, "m"),
    );
    insert("landingX", measured_metric(touchdown.contact_x, "m"));
    insert(
        "sweetSpotOffset",
        measured_metric(
            touchdown.contact_x - sweet_spot_x(scenario, simulation),
            "m",
        ),
    );
    match terrain_slope_angle_at(&simulation.terrain, touchdown.contact_x) {
        Some(slope) => insert(
            "landingPitchError",
            measured_metric(wrap_angle(touchdown.pitch - slope), "rad"),
        ),
        None => insert(
            "landingPitchError",
            unavailable_metric("rad", "no riding surface under the touchdown point"),
        ),
    }
    let mut angles = vec![takeoff.pitch];
    angles.extend(flight.iter().map(|frame| frame.bike.angle));
    angles.push(touchdown.pitch);
    let rotation: f32 = angles
        .windows(2)
        .map(|pair| wrap_angle(pair[1] - pair[0]))
        .sum();
    insert("airRotation", measured_metric(rotation, "rad"));
    let peak = flight
        .iter()
        .map(|frame| frame.bike_origin.y)
        .fold(takeoff.bike_origin.y, f32::max);
    insert(
        "maxHeightAboveLip",
        measured_metric(peak - scenario.jump.lip_height, "m"),
    );

    let window_end = touchdown.t + LANDING_WINDOW_S;
    let landing_frames: Vec<&SimFrame> = frames
        .iter()
        .filter(|frame| frame.t >= touchdown.t && frame.t <= window_end)
        .collect();
    let impulse: f32 = landing_frames
        .iter()
        .map(|frame| frame.contact_impulse)
        .sum();
    insert("landingImpulse", measured_metric(impulse, "N*s"));
    let covered = landing_frames
        .last()
        .map_or(0.0, |frame| frame.t - touchdown.t)
        .max(1.0 / simulation.output_hz as f32);
    insert("landingForce", measured_metric(impulse / covered, "N"));

    let before_touchdown = &frames[touchdown_index.saturating_sub(1)];
    insert(
        "energyResidual",
        measured_metric(residual(before_touchdown) - residual(first), "J"),
    );
    insert(
        "impactEnergyLoss",
        measured_metric(residual(before_touchdown) - residual(last), "J"),
    );
    metrics
}
