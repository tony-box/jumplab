use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub const SCENARIO_SCHEMA_VERSION: u32 = 4;
pub const BIKE_GEOMETRY_MODEL_VERSION: u32 = 1;
/// The rider coupling and rigid contacts need at least this physics rate to stay stable.
pub const MIN_PHYSICS_HZ: u32 = 240;

/// Drops roll off an edge instead of kicking, so their exit tangent may be level or falling.
pub const DROP_LIP_ANGLE_MIN: f32 = -0.35;
pub const DROP_LIP_ANGLE_MAX: f32 = 0.35;
pub const KICKER_LIP_ANGLE_MIN: f32 = 0.05;
pub const LIP_ANGLE_MAX: f32 = 1.5;
pub const TRANSITION_LENGTH_MIN: f32 = 0.5;
pub const TRANSITION_LENGTH_MAX: f32 = 30.0;
/// Kicker transition lengths are derived from height and lip angle; a stored length must agree
/// with the derived one within this tolerance.
pub const TRANSITION_LENGTH_TOLERANCE_M: f32 = 1.0e-3;

pub const SUPPORTED_DT: [f32; 5] = [
    1.0 / 960.0,
    1.0 / 480.0,
    1.0 / 240.0,
    1.0 / 120.0,
    1.0 / 60.0,
];
pub const SUPPORTED_OUTPUT_HZ: [u32; 5] = [60, 120, 240, 480, 960];

/// Horizontal run of a circular-arc kicker that starts flat and leaves the lip at `lip_angle`
/// after rising `lip_height`: the arc radius is h / (1 - cos θ), so the run is h · cot(θ / 2).
pub fn kicker_transition_length(lip_height: f32, lip_angle: f32) -> f32 {
    lip_height / libm::tanf(0.5 * lip_angle)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JointLimit {
    pub min: f32,
    pub max: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SuspensionSpec {
    pub travel: f32,
    pub sag: f32,
    pub spring_rate: f32,
    pub damping: f32,
}

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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct JumpSpec {
    pub kind: JumpKind,
    pub lip_height: f32,
    pub lip_angle: f32,
    /// Authored for drops. For kickers it is derived from height and lip angle.
    pub transition_length: f32,
    pub gap: f32,
    pub step_delta: f32,
    pub landing_angle: f32,
    pub landing_length: f32,
    pub rollout: f32,
}

impl JumpSpec {
    pub fn is_kicker(&self) -> bool {
        !matches!(self.kind, JumpKind::Drop)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RiderJoints {
    pub knee: JointLimit,
    pub hip: JointLimit,
    pub spine: JointLimit,
    pub shoulder: JointLimit,
    pub elbow: JointLimit,
}

/// How hard and how quickly the rider can move their body relative to the bike. Strengths are
/// multiples of rider weight (or rider weight at `pitch_lever` for torque) before
/// `strength_scale` applies.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RiderCoupling {
    pub linear_frequency: f32,
    pub pitch_frequency: f32,
    pub damping_ratio: f32,
    pub fore_aft_strength: f32,
    pub vertical_strength: f32,
    pub pitch_lever: f32,
}

impl Default for RiderCoupling {
    fn default() -> Self {
        Self {
            linear_frequency: 30.0,
            pitch_frequency: 25.0,
            damping_ratio: 1.0,
            fore_aft_strength: 1.5,
            vertical_strength: 3.0,
            pitch_lever: 0.4,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RiderSpec {
    pub height: f32,
    pub mass: f32,
    pub leg_ratio: f32,
    pub arm_ratio: f32,
    pub strength_scale: f32,
    pub coupling: RiderCoupling,
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EntrySpec {
    pub speed: f32,
    pub start_x: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct PoseTargets {
    pub knee: f32,
    pub hip: f32,
    pub spine: f32,
}

/// One authored pose. `s` is forward distance: the bicycle body origin's world x, which only
/// ever advances during a run, so rolling backward holds the pose instead of replaying it.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
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
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PoseClip {
    pub id: String,
    pub name: String,
    pub interpolation: PoseInterpolation,
    pub keys: Vec<PoseKey>,
}

/// Small in-flight corrections a rider makes without thinking about them. The controller only
/// offsets the authored target, within these bounds, toward a landing that matches the slope.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RiderInstinct {
    pub enabled: bool,
    pub max_offset: f32,
    pub max_angle: f32,
}

impl Default for RiderInstinct {
    fn default() -> Self {
        Self {
            enabled: true,
            max_offset: 0.1,
            max_angle: 0.17,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SolverConfig {
    pub dt: f32,
    pub substeps: u32,
    pub ccd: bool,
    pub output_hz: u32,
    pub solver_version: String,
    pub rider_instinct: RiderInstinct,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
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

fn check_range(path: &str, value: f32, min: f32, max: f32) -> Result<(), String> {
    if value.is_finite() && value >= min && value <= max {
        Ok(())
    } else {
        Err(format!(
            "{path} must be between {min} and {max}, got {value}"
        ))
    }
}

fn check_suspension(path: &str, spec: &SuspensionSpec) -> Result<(), String> {
    check_range(&format!("{path}.travel"), spec.travel, 0.0, 0.3)?;
    check_range(&format!("{path}.sag"), spec.sag, 0.0, 0.12)?;
    check_range(
        &format!("{path}.springRate"),
        spec.spring_rate,
        0.0,
        100_000.0,
    )?;
    check_range(&format!("{path}.damping"), spec.damping, 0.0, 10_000.0)?;
    if spec.sag > spec.travel {
        return Err(format!("{path}.sag must not exceed travel"));
    }
    Ok(())
}

impl Scenario {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != SCENARIO_SCHEMA_VERSION {
            return Err("unsupported schemaVersion".to_string());
        }
        self.validate_jump()?;
        self.validate_rider()?;
        self.validate_bike()?;

        check_range("entry.speed", self.entry.speed, 0.5, 30.0)?;
        check_range("entry.startX", self.entry.start_x, -100.0, -0.1)?;

        let keys = &self.pose_clip.keys;
        if !(2..=64).contains(&keys.len()) {
            return Err("poseClip must contain between 2 and 64 keys".to_string());
        }
        for (index, key) in keys.iter().enumerate() {
            check_range(&format!("poseClip.keys[{index}].s"), key.s, -50.0, 50.0)?;
            for (name, value) in [
                ("knee", key.targets.knee),
                ("hip", key.targets.hip),
                ("spine", key.targets.spine),
            ] {
                check_range(
                    &format!("poseClip.keys[{index}].targets.{name}"),
                    value,
                    -core::f32::consts::PI,
                    core::f32::consts::PI,
                )?;
            }
        }
        for pair in keys.windows(2) {
            if pair[1].s <= pair[0].s {
                return Err("pose keys must be strictly increasing in s".to_string());
            }
        }

        self.validate_solver()
    }

    fn validate_jump(&self) -> Result<(), String> {
        let jump = &self.jump;
        check_range("jump.lipHeight", jump.lip_height, 0.2, 4.0)?;
        check_range("jump.gap", jump.gap, 0.0, 20.0)?;
        check_range("jump.stepDelta", jump.step_delta, -5.0, 5.0)?;
        check_range("jump.landingAngle", jump.landing_angle, 0.05, 1.2)?;
        check_range("jump.landingLength", jump.landing_length, 1.0, 40.0)?;
        check_range("jump.rollout", jump.rollout, 0.0, 60.0)?;
        check_range(
            "jump.transitionLength",
            jump.transition_length,
            TRANSITION_LENGTH_MIN,
            TRANSITION_LENGTH_MAX,
        )?;

        if jump.is_kicker() {
            check_range(
                "jump.lipAngle",
                jump.lip_angle,
                KICKER_LIP_ANGLE_MIN,
                LIP_ANGLE_MAX,
            )?;
            let derived = kicker_transition_length(jump.lip_height, jump.lip_angle);
            if !(TRANSITION_LENGTH_MIN..=TRANSITION_LENGTH_MAX).contains(&derived) {
                return Err(format!(
                    "a {:.2} m kicker at {:.3} rad needs a {derived:.2} m transition, outside {TRANSITION_LENGTH_MIN}-{TRANSITION_LENGTH_MAX} m",
                    jump.lip_height, jump.lip_angle
                ));
            }
            if (jump.transition_length - derived).abs() > TRANSITION_LENGTH_TOLERANCE_M {
                return Err(format!(
                    "jump.transitionLength must equal the derived kicker length {derived:.4} m"
                ));
            }
        } else {
            check_range(
                "jump.lipAngle",
                jump.lip_angle,
                DROP_LIP_ANGLE_MIN,
                DROP_LIP_ANGLE_MAX,
            )?;
        }

        match jump.kind {
            JumpKind::Table | JumpKind::Gap if jump.step_delta != 0.0 => {
                Err("stepDelta must be zero for table and gap jumps".to_string())
            }
            JumpKind::Stepup if jump.step_delta <= 0.0 => {
                Err("stepup jumps require a positive stepDelta".to_string())
            }
            JumpKind::Stepdown | JumpKind::Drop if jump.step_delta >= 0.0 => {
                Err("stepdown and drop jumps require a negative stepDelta".to_string())
            }
            _ => Ok(()),
        }
    }

    fn validate_rider(&self) -> Result<(), String> {
        let rider = &self.rider;
        check_range("rider.height", rider.height, 1.2, 2.2)?;
        check_range("rider.mass", rider.mass, 35.0, 160.0)?;
        check_range("rider.legRatio", rider.leg_ratio, 0.35, 0.6)?;
        check_range("rider.armRatio", rider.arm_ratio, 0.3, 0.5)?;
        check_range(
            "rider.strengthScale",
            rider.strength_scale,
            f32::MIN_POSITIVE,
            3.0,
        )?;
        let coupling = &rider.coupling;
        check_range(
            "rider.coupling.linearFrequency",
            coupling.linear_frequency,
            5.0,
            80.0,
        )?;
        check_range(
            "rider.coupling.pitchFrequency",
            coupling.pitch_frequency,
            5.0,
            80.0,
        )?;
        check_range(
            "rider.coupling.dampingRatio",
            coupling.damping_ratio,
            0.2,
            3.0,
        )?;
        check_range(
            "rider.coupling.foreAftStrength",
            coupling.fore_aft_strength,
            0.1,
            4.0,
        )?;
        check_range(
            "rider.coupling.verticalStrength",
            coupling.vertical_strength,
            0.1,
            6.0,
        )?;
        check_range("rider.coupling.pitchLever", coupling.pitch_lever, 0.05, 1.0)?;
        for (name, limit) in [
            ("knee", &rider.joints.knee),
            ("hip", &rider.joints.hip),
            ("spine", &rider.joints.spine),
            ("shoulder", &rider.joints.shoulder),
            ("elbow", &rider.joints.elbow),
        ] {
            let pi = core::f32::consts::PI;
            check_range(&format!("rider.joints.{name}.min"), limit.min, -pi, pi)?;
            check_range(&format!("rider.joints.{name}.max"), limit.max, -pi, pi)?;
            if limit.min > limit.max {
                return Err(format!("rider.joints.{name}.min must not exceed max"));
            }
        }
        Ok(())
    }

    fn validate_bike(&self) -> Result<(), String> {
        let bike = &self.bike;
        if ![26.0, 27.5, 29.0].contains(&bike.wheel_size) {
            return Err("bike.wheelSize must be 26, 27.5, or 29".to_string());
        }
        check_range("bike.wheelbase", bike.wheelbase, 0.8, 1.5)?;
        check_range("bike.chainstay", bike.chainstay, 0.3, 0.65)?;
        check_range("bike.bbHeight", bike.bb_height, 0.2, 0.5)?;
        check_range("bike.mass", bike.mass, 5.0, 30.0)?;
        check_suspension("bike.fork", &bike.fork)?;
        match (&bike.frame_type, &bike.rear_shock) {
            (BikeFlavor::Full, Some(shock)) => check_suspension("bike.rearShock", shock)?,
            (BikeFlavor::Full, None) => {
                return Err("rearShock is required for full suspension frames".to_string());
            }
            (_, Some(_)) => {
                return Err("rearShock must be null for rigid and hardtail frames".to_string());
            }
            _ => {}
        }

        let geometry = crate::geometry::inspect_bike_geometry(bike);
        if let Some(issue) = geometry.issues.first() {
            return Err(format!(
                "invalid bike geometry [{}]: {}",
                issue.code, issue.message
            ));
        }
        Ok(())
    }

    fn validate_solver(&self) -> Result<(), String> {
        let solver = &self.solver;
        if !SUPPORTED_DT
            .iter()
            .any(|dt| (dt - solver.dt).abs() <= dt * 1.0e-4)
        {
            return Err("solver.dt must be 1/960, 1/480, 1/240, 1/120, or 1/60 s".to_string());
        }
        if !(1..=16).contains(&solver.substeps) {
            return Err("solver.substeps must be between 1 and 16".to_string());
        }
        if !SUPPORTED_OUTPUT_HZ.contains(&solver.output_hz) {
            return Err("solver.outputHz must be 60, 120, 240, 480, or 960".to_string());
        }
        let frequency = (1.0 / solver.dt) * solver.substeps as f32;
        let rounded = frequency.round() as u32;
        if rounded == 0 || !rounded.is_multiple_of(solver.output_hz) {
            return Err("outputHz must divide the fixed solve frequency".to_string());
        }
        if rounded < MIN_PHYSICS_HZ {
            return Err(format!(
                "physics frequency (1/dt x substeps) must be at least {MIN_PHYSICS_HZ} Hz"
            ));
        }
        let instinct = &solver.rider_instinct;
        check_range(
            "solver.riderInstinct.maxOffset",
            instinct.max_offset,
            0.0,
            0.25,
        )?;
        check_range(
            "solver.riderInstinct.maxAngle",
            instinct.max_angle,
            0.0,
            0.5,
        )?;
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
