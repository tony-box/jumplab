use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const SCENARIO_SCHEMA_VERSION: u32 = 3;
pub const BIKE_GEOMETRY_MODEL_VERSION: u32 = 1;
/// The rider coupling and rigid contacts need at least this physics rate to stay stable.
pub const MIN_PHYSICS_HZ: u32 = 240;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JointLimit {
    pub min: f32,
    pub max: f32,
    pub tau_max: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SuspensionSpec {
    pub travel: f32,
    pub sag: f32,
    pub spring_rate: f32,
    pub damping: f32,
}

/// Drops roll off an edge instead of kicking, so their exit tangent may be level or falling.
pub const DROP_LIP_ANGLE_MIN: f32 = -0.35;
pub const DROP_LIP_ANGLE_MAX: f32 = 0.35;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum JumpKind {
    Table,
    Gap,
    Stepup,
    Stepdown,
    Drop,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct JumpSpec {
    pub kind: JumpKind,
    pub lip_height: f32,
    pub lip_angle: f32,
    pub transition_length: f32,
    pub gap: f32,
    pub step_delta: f32,
    pub landing_angle: f32,
    pub landing_length: f32,
    pub rollout: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RiderJoints {
    pub knee: JointLimit,
    pub hip: JointLimit,
    pub spine: JointLimit,
    pub shoulder: JointLimit,
    pub elbow: JointLimit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RiderSpec {
    pub height: f32,
    pub mass: f32,
    pub leg_ratio: f32,
    pub arm_ratio: f32,
    pub strength_scale: f32,
    pub kp: f32,
    pub kd: f32,
    pub joints: RiderJoints,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BikeFlavor {
    Rigid,
    Hardtail,
    Full,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BikeGeometrySpec {
    pub model_version: u32,
    pub reach: f32,
    pub stack: f32,
    pub head_tube_length: f32,
    pub head_tube_angle: f32,
    pub fork_length: f32,
    pub fork_offset: f32,
    pub seat_tube_length: f32,
    pub seat_tube_angle: f32,
    pub saddle_height: f32,
    pub saddle_setback: f32,
    pub crank_length: f32,
    pub handlebar_offset_x: f32,
    pub handlebar_offset_y: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BikeSpec {
    pub frame_type: BikeFlavor,
    pub wheel_size: f32,
    pub wheelbase: f32,
    pub chainstay: f32,
    pub bb_height: f32,
    pub mass: f32,
    pub fork: SuspensionSpec,
    pub rear_shock: Option<SuspensionSpec>,
    pub geometry: BikeGeometrySpec,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EntrySpec {
    pub speed: f32,
    pub start_x: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PoseTargets {
    pub knee: f32,
    pub hip: f32,
    pub spine: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PoseKey {
    pub s: f32,
    pub label: String,
    pub targets: PoseTargets,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PoseInterpolation {
    Cubic,
    Linear,
    Step,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PoseClip {
    pub id: String,
    pub name: String,
    pub interpolation: PoseInterpolation,
    pub keys: Vec<PoseKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SolverConfig {
    pub dt: f32,
    pub substeps: u32,
    pub ccd: bool,
    pub seed: u32,
    pub output_hz: u32,
    pub solver_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Scenario {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub jump: JumpSpec,
    pub rider: RiderSpec,
    pub bike: BikeSpec,
    pub entry: EntrySpec,
    pub pose_clip: PoseClip,
    pub solver: SolverConfig,
}

impl Scenario {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != SCENARIO_SCHEMA_VERSION {
            return Err("unsupported schemaVersion".to_string());
        }

        let geometry = crate::geometry::inspect_bike_geometry(&self.bike);
        if let Some(issue) = geometry.issues.first() {
            return Err(format!(
                "invalid bike geometry [{}]: {}",
                issue.code, issue.message
            ));
        }

        if !(1.2..=2.2).contains(&self.rider.height) || !(35.0..=160.0).contains(&self.rider.mass) {
            return Err("rider anthropometry out of bounds".to_string());
        }

        if self.bike.wheelbase <= 0.0 || self.bike.chainstay <= 0.0 || self.entry.speed <= 0.0 {
            return Err("invalid SI values".to_string());
        }

        if matches!(self.jump.kind, JumpKind::Drop) {
            if !(DROP_LIP_ANGLE_MIN..=DROP_LIP_ANGLE_MAX).contains(&self.jump.lip_angle) {
                return Err("drop lipAngle must stay between -0.35 and 0.35 rad".to_string());
            }
        } else {
            let minimum_lip_angle =
                libm::atanf(1.5 * self.jump.lip_height / self.jump.transition_length);
            if self.jump.lip_angle + 1.0e-6 < minimum_lip_angle {
                return Err(
                    "lipAngle produces a rollover for this height and transitionLength".to_string(),
                );
            }
        }

        if self.pose_clip.keys.len() < 2 {
            return Err("poseClip must contain at least two keys".to_string());
        }

        for pair in self.pose_clip.keys.windows(2) {
            if pair[1].s <= pair[0].s {
                return Err("pose keys must be strictly increasing in s".to_string());
            }
        }

        let frequency = (1.0 / self.solver.dt) * self.solver.substeps as f32;
        let rounded = frequency.round() as u32;
        if rounded == 0 || !rounded.is_multiple_of(self.solver.output_hz) {
            return Err("outputHz must divide the fixed solve frequency".to_string());
        }
        if rounded < MIN_PHYSICS_HZ {
            return Err(format!(
                "physics frequency (1/dt x substeps) must be at least {MIN_PHYSICS_HZ} Hz"
            ));
        }

        Ok(())
    }

    pub fn canonical_hash(&self) -> Result<String, String> {
        let value = serde_json::to_value(self).map_err(|err| err.to_string())?;
        let canonical = canonicalize_value(value);
        let json = serde_json::to_string(&canonical).map_err(|err| err.to_string())?;
        let mut hasher = Sha256::new();
        hasher.update(json.as_bytes());
        Ok(format!("{:x}", hasher.finalize()))
    }
}

fn canonicalize_value(value: serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut keys: Vec<String> = map.keys().cloned().collect();
            keys.sort();
            let mut out = serde_json::Map::new();
            for key in keys {
                if let Some(child) = map.get(&key) {
                    out.insert(key, canonicalize_value(child.clone()));
                }
            }
            serde_json::Value::Object(out)
        }
        serde_json::Value::Array(items) => {
            serde_json::Value::Array(items.into_iter().map(canonicalize_value).collect())
        }
        primitive => primitive,
    }
}
