use rapier2d::na::{ComplexField, RealField};

use crate::geometry::{
    BikeContactPoints, BikeGeometryInspection, ClearanceShape, ContactSurface, Point2,
    bike_contact_points, inspect_bike_geometry, rider_link_lengths, signed_shape_separation,
};
use crate::scenario::{
    BikeSpec, JointLimit, PoseClip, PoseInterpolation, PoseTargets, RiderSpec, Scenario,
};
use crate::version::SOLVER_VERSION;

pub const CLEARANCE_EPSILON_M: f32 = 0.001;
const EDIT_BISECTION_ITERATIONS: usize = 32;

/// Authored targets are absolute segment angles, so the anatomical limits are
/// the relative bends between segments. These are what keep a leg or torso
/// physically possible; the bike contacts do the rest of the limiting.
const KNEE_HYPEREXTENSION_RAD: f32 = -0.09;
pub const KNEE_FLEXION_RAD: f32 = 2.62;
const HIP_EXTENSION_RAD: f32 = -0.44;
const HIP_FLEXION_RAD: f32 = 2.44;
/// Seat contact sits just below the hip joint centre, not a whole pelvis away.
const SEAT_CONTACT_DROP_RATIO: f32 = 0.03;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DerivedArm {
    pub shoulder: f32,
    pub elbow: f32,
    pub constrained: bool,
}

/// The achieved, connected side-plane rider skeleton for one sampled pose.
/// Every field is a finite bike-local point in metres. `pedal_contact` and
/// `ankle` coincide by construction (the foot is rigidly planted on the pedal;
/// there is no independent ankle joint); `hand` always coincides with
/// `handlebar_contact` (hands stay locked to the grips), even when an
/// infeasible reach is instead reported via `derived_arm.constrained`.
#[derive(Debug, Clone, Copy, Default, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AchievedPoseLandmarks {
    pub pedal_contact: Point2,
    pub ankle: Point2,
    pub knee: Point2,
    pub hip: Point2,
    pub shoulder: Point2,
    pub elbow: Point2,
    pub hand: Point2,
    pub handlebar_contact: Point2,
    pub head: Point2,
}

impl AchievedPoseLandmarks {
    pub fn is_finite(&self) -> bool {
        self.pedal_contact.is_finite()
            && self.ankle.is_finite()
            && self.knee.is_finite()
            && self.hip.is_finite()
            && self.shoulder.is_finite()
            && self.elbow.is_finite()
            && self.hand.is_finite()
            && self.handlebar_contact.is_finite()
            && self.head.is_finite()
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PoseSampleOutput {
    pub s: f32,
    pub targets: PoseTargets,
    pub derived_arm: DerivedArm,
    pub landmarks: AchievedPoseLandmarks,
    pub solver_version: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContactResult {
    pub kind: String,
    pub rider_part: String,
    pub bike_part: String,
    pub active: bool,
    pub separation: f32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesignConflict {
    pub code: String,
    pub kind: String,
    pub key_index: Option<usize>,
    pub rider_part: Option<String>,
    pub bike_part: Option<String>,
    pub separation: Option<f32>,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PoseKeyValidation {
    pub key_index: usize,
    pub s: f32,
    pub valid: bool,
    pub sample: PoseSampleOutput,
    pub minimum_separation: f32,
    pub contacts: Vec<ContactResult>,
    pub conflicts: Vec<DesignConflict>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PoseEditResolution {
    pub requested_targets: PoseTargets,
    pub accepted_targets: PoseTargets,
    pub requested_valid: bool,
    pub validation: PoseKeyValidation,
    pub limiting_conflicts: Vec<DesignConflict>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesignValidation {
    pub geometry: BikeGeometryInspection,
    pub pose_keys: Vec<PoseKeyValidation>,
    pub can_solve: bool,
    pub conflict_count: usize,
    pub scenario_hash: String,
    pub model_version: String,
    pub solver_version: String,
}

#[derive(Debug, Clone)]
struct RiderEnvelope {
    part: &'static str,
    geometry: ClearanceShape,
}

/// Clamps a single scalar to its joint limit without panicking on a malformed
/// (min > max) limit. Returns the clamped value and whether it changed.
fn clamp_scalar(value: f32, limit: &JointLimit) -> (f32, bool) {
    if !value.is_finite() {
        return (0.0f32.max(limit.min).min(limit.max), true);
    }
    let clamped = value.max(limit.min).min(limit.max);
    (clamped, clamped != value)
}

/// Clamps every authored/interpolated target to the rider's declared joint
/// limits. Rust is the sole authority for this correction (FR-021); callers
/// must not reclamp the returned targets.
fn clamp_targets(targets: PoseTargets, rider: &RiderSpec) -> (PoseTargets, bool) {
    let (knee, knee_changed) = clamp_scalar(targets.knee, &rider.joints.knee);
    let (hip, hip_changed) = clamp_scalar(targets.hip, &rider.joints.hip);
    let (spine, spine_changed) = clamp_scalar(targets.spine, &rider.joints.spine);

    (
        PoseTargets { knee, hip, spine },
        knee_changed || hip_changed || spine_changed,
    )
}

pub fn wrap_angle(value: f32) -> f32 {
    let tau = core::f32::consts::TAU;
    let mut wrapped = value % tau;
    if wrapped > core::f32::consts::PI {
        wrapped -= tau;
    } else if wrapped < -core::f32::consts::PI {
        wrapped += tau;
    }
    wrapped
}

/// Bend between the shank and the thigh. Zero is a fully extended leg and
/// negative values are hyperextension.
pub fn knee_flexion(targets: &PoseTargets) -> f32 {
    wrap_angle(targets.knee - targets.hip)
}

/// Bend between the femur and the torso. Zero is a straight hip; positive
/// values fold the torso down toward the thigh.
pub fn hip_flexion(targets: &PoseTargets) -> f32 {
    core::f32::consts::PI - wrap_angle(targets.spine - targets.hip - core::f32::consts::PI).abs()
}

/// Unclamped two-link arm reaching `grip` from `shoulder`, returning the
/// shoulder angle, the elbow angle, and whether the grip lies outside the arm.
fn arm_solution(upper_arm: f32, forearm: f32, shoulder: Point2, grip: Point2) -> (f32, f32, bool) {
    let dx = grip.x - shoulder.x;
    let dy = grip.y - shoulder.y;
    let mut d = ComplexField::sqrt(dx * dx + dy * dy);
    let min_d = (upper_arm - forearm).abs() + 1e-4;
    let max_d = (upper_arm + forearm) - 1e-4;

    let reach_constrained = d < min_d || d > max_d;
    d = d.clamp(min_d, max_d);

    let base = RealField::atan2(dy, dx);
    let shoulder_offset = ((ComplexField::powi(upper_arm, 2) + ComplexField::powi(d, 2)
        - ComplexField::powi(forearm, 2))
        / (2.0 * upper_arm * d))
        .clamp(-1.0, 1.0);
    let shoulder_offset = ComplexField::acos(shoulder_offset);
    let elbow_internal = ((ComplexField::powi(upper_arm, 2) + ComplexField::powi(forearm, 2)
        - ComplexField::powi(d, 2))
        / (2.0 * upper_arm * forearm))
        .clamp(-1.0, 1.0);
    let elbow_internal = ComplexField::acos(elbow_internal);

    (
        base - shoulder_offset,
        core::f32::consts::PI - elbow_internal,
        reach_constrained,
    )
}

/// Flags authored targets that fall outside the rider's declared range. The
/// achieved sample is always clamped into range, so this has to be measured
/// against the request; sitting exactly on a limit is a valid pose.
fn requested_range_conflicts(
    key_index: usize,
    rider: &RiderSpec,
    targets: &PoseTargets,
) -> Vec<DesignConflict> {
    let mut conflicts = Vec::new();
    for (name, requested, limit) in [
        ("knee", targets.knee, &rider.joints.knee),
        ("hip", targets.hip, &rider.joints.hip),
        ("spine", targets.spine, &rider.joints.spine),
    ] {
        if !requested.is_finite()
            || requested < limit.min - 1.0e-6
            || requested > limit.max + 1.0e-6
        {
            conflicts.push(DesignConflict {
                code: format!("{name}-joint-limit"),
                kind: "joint-limit".to_string(),
                key_index: Some(key_index),
                rider_part: None,
                bike_part: None,
                separation: None,
                message: format!("{name} target is outside its declared joint limit"),
            });
        }
    }
    conflicts
}

pub fn sample_pose(
    clip: &PoseClip,
    s: f32,
    rider: &RiderSpec,
    bike: &BikeSpec,
) -> PoseSampleOutput {
    sample_pose_with_contacts(clip, s, rider, &bike_contact_points(bike))
}

/// Same as [`sample_pose`] but reuses precomputed bike contacts, which the
/// solver derives once per solve because bicycle geometry is static.
pub fn sample_pose_with_contacts(
    clip: &PoseClip,
    s: f32,
    rider: &RiderSpec,
    contacts: &BikeContactPoints,
) -> PoseSampleOutput {
    let interpolation_mode = clip.interpolation;

    let keys = &clip.keys;
    let mut lower = 0usize;
    let mut upper = keys.len() - 1;

    for idx in 0..keys.len() - 1 {
        if s >= keys[idx].s && s <= keys[idx + 1].s {
            lower = idx;
            upper = idx + 1;
            break;
        }
    }

    if s <= keys[0].s {
        lower = 0;
        upper = 1;
    } else if s >= keys[keys.len() - 1].s {
        lower = keys.len() - 2;
        upper = keys.len() - 1;
    }

    let left = &keys[lower];
    let right = &keys[upper];
    let span = (right.s - left.s).max(1e-6);
    let t = ((s - left.s) / span).clamp(0.0, 1.0);

    let interp = |a: f32, b: f32, c0: f32, c1: f32| -> f32 {
        match interpolation_mode {
            PoseInterpolation::Step => {
                if t >= 1.0 {
                    b
                } else {
                    a
                }
            }
            PoseInterpolation::Linear => a + (b - a) * t,
            PoseInterpolation::Cubic => {
                let t2 = t * t;
                let t3 = t2 * t;
                (2.0 * t3 - 3.0 * t2 + 1.0) * a
                    + (t3 - 2.0 * t2 + t) * c0
                    + (-2.0 * t3 + 3.0 * t2) * b
                    + (t3 - t2) * c1
            }
        }
    };

    let left_prev = if lower == 0 { left } else { &keys[lower - 1] };
    let right_next = if upper + 1 >= keys.len() {
        right
    } else {
        &keys[upper + 1]
    };

    let slope = |p0: f32, p1: f32| (p1 - p0) * 0.5;

    let raw_targets = PoseTargets {
        knee: interp(
            left.targets.knee,
            right.targets.knee,
            slope(left_prev.targets.knee, right.targets.knee),
            slope(left.targets.knee, right_next.targets.knee),
        ),
        hip: interp(
            left.targets.hip,
            right.targets.hip,
            slope(left_prev.targets.hip, right.targets.hip),
            slope(left.targets.hip, right_next.targets.hip),
        ),
        spine: interp(
            left.targets.spine,
            right.targets.spine,
            slope(left_prev.targets.spine, right.targets.spine),
            slope(left.targets.spine, right_next.targets.spine),
        ),
    };

    let (targets, targets_constrained) = clamp_targets(raw_targets, rider);
    let skeleton = build_skeleton(&targets, rider, contacts);
    let constrained = targets_constrained || skeleton.arm_constrained;

    PoseSampleOutput {
        s,
        targets,
        derived_arm: DerivedArm {
            shoulder: skeleton.shoulder,
            elbow: skeleton.elbow,
            constrained,
        },
        landmarks: skeleton.landmarks,
        solver_version: SOLVER_VERSION.to_string(),
    }
}

/// Connected side-plane skeleton built from absolute segment targets, with the
/// foot planted on the pedal and the hand locked to the grip.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SkeletonBuild {
    pub landmarks: AchievedPoseLandmarks,
    pub shoulder: f32,
    pub elbow: f32,
    /// The grip was out of reach or the shoulder/elbow hit its declared limit.
    pub arm_constrained: bool,
}

pub fn build_skeleton(
    targets: &PoseTargets,
    rider: &RiderSpec,
    contacts: &BikeContactPoints,
) -> SkeletonBuild {
    let links = rider_link_lengths(rider);

    // Leg: forward kinematics anchored bottom-up at the pedal contact so the
    // foot always coincides with the pedal by construction (FR-014).
    let pedal = contacts.pedal_contact;
    let ankle_point = pedal;
    let knee_point = Point2::new(
        pedal.x + ComplexField::sin(targets.knee) * links.shank,
        pedal.y + ComplexField::cos(targets.knee) * links.shank,
    );
    let hip_point = Point2::new(
        knee_point.x + ComplexField::sin(targets.hip) * links.thigh,
        knee_point.y + ComplexField::cos(targets.hip) * links.thigh,
    );

    // Torso: continues up from the pelvis using the spine target directly.
    let shoulder_point = Point2::new(
        hip_point.x + ComplexField::sin(targets.spine) * links.torso,
        hip_point.y + ComplexField::cos(targets.spine) * links.torso,
    );
    let head_point = Point2::new(
        shoulder_point.x + ComplexField::sin(targets.spine) * links.head,
        shoulder_point.y + ComplexField::cos(targets.spine) * links.head,
    );

    // Arm: two-link reach from the shoulder to the handlebar contact.
    let grip = contacts.handlebar_contact;
    let (shoulder_angle, elbow_angle, reach_constrained) =
        arm_solution(links.upper_arm, links.forearm, shoulder_point, grip);

    let (shoulder_value, shoulder_limited) = clamp_scalar(shoulder_angle, &rider.joints.shoulder);
    // The elbow landmark is built from the clamped shoulder angle so it never
    // visually exceeds the declared shoulder limit (FR-021: Rust owns clamping).
    let elbow_point = Point2::new(
        shoulder_point.x + ComplexField::cos(shoulder_value) * links.upper_arm,
        shoulder_point.y + ComplexField::sin(shoulder_value) * links.upper_arm,
    );
    // Hands stay locked to the handlebar grip even when the reach limit clamped
    // `d`; only the elbow (and the constrained flag) absorbs an infeasible reach.
    let hand_point = grip;
    let (elbow_value, elbow_limited) = clamp_scalar(elbow_angle, &rider.joints.elbow);

    SkeletonBuild {
        landmarks: AchievedPoseLandmarks {
            pedal_contact: pedal,
            ankle: ankle_point,
            knee: knee_point,
            hip: hip_point,
            shoulder: shoulder_point,
            elbow: elbow_point,
            hand: hand_point,
            handlebar_contact: grip,
            head: head_point,
        },
        shoulder: shoulder_value,
        elbow: elbow_value,
        arm_constrained: reach_constrained || shoulder_limited || elbow_limited,
    }
}

pub fn validate_pose_key(
    scenario: &Scenario,
    key_index: usize,
    targets: PoseTargets,
) -> PoseKeyValidation {
    let geometry = inspect_bike_geometry(&scenario.bike);
    let key = &scenario.pose_clip.keys[key_index];
    let mut clip = scenario.pose_clip.clone();
    clip.keys[key_index].targets = targets.clone();
    let sample = sample_pose(&clip, key.s, &scenario.rider, &scenario.bike);
    let mut validation = validate_pose_sample(key_index, &scenario.rider, &geometry, sample);
    validation.conflicts.extend(requested_range_conflicts(
        key_index,
        &scenario.rider,
        &targets,
    ));
    validation.valid = validation.conflicts.is_empty();
    validation
}

pub fn validate_pose_sample(
    key_index: usize,
    rider: &RiderSpec,
    geometry: &BikeGeometryInspection,
    sample: PoseSampleOutput,
) -> PoseKeyValidation {
    let rider_shapes = rider_envelopes(rider, &sample.landmarks);
    let mut conflicts = joint_and_reach_conflicts(key_index, rider, &sample);
    let mut contacts = Vec::with_capacity(3);
    let mut minimum_separation = f32::INFINITY;

    for rider_shape in &rider_shapes {
        for bike_shape in &geometry.protected_shapes {
            let bike_geometry = ClearanceShape::from(&bike_shape.geometry);
            let separation = signed_shape_separation(&rider_shape.geometry, &bike_geometry);
            minimum_separation = minimum_separation.min(separation);

            if is_designated_contact(
                rider_shape.part,
                bike_shape.contact_surface,
                &bike_shape.part,
            ) {
                contacts.push(ContactResult {
                    kind: match bike_shape.contact_surface {
                        ContactSurface::Hand => "hand",
                        ContactSurface::Foot => "foot",
                        _ => unreachable!("designated contact surface"),
                    }
                    .to_string(),
                    rider_part: rider_shape.part.to_string(),
                    bike_part: bike_shape.part.clone(),
                    active: separation <= CLEARANCE_EPSILON_M,
                    separation,
                });
                continue;
            }

            if is_lateral_limb_central_tube_projection(rider_shape.part, &bike_shape.part) {
                continue;
            }

            if rider_shape.part == "pelvis" && bike_shape.part == "topTube" {
                continue;
            }

            if rider_shape.part == "pelvis" && bike_shape.part == "saddle" {
                let saddle_contact = saddle_contact_state(rider, geometry, &sample, separation);
                if let Some(contact) = saddle_contact {
                    contacts.push(contact);
                    continue;
                }
                if separation < -CLEARANCE_EPSILON_M {
                    conflicts.push(clearance_conflict(
                        "saddle-crossing",
                        key_index,
                        rider_shape.part,
                        &bike_shape.part,
                        separation,
                        "Pelvis must remain above the saddle contact surface",
                    ));
                }
                continue;
            }

            if separation < -CLEARANCE_EPSILON_M {
                conflicts.push(clearance_conflict(
                    "rider-bike-overlap",
                    key_index,
                    rider_shape.part,
                    &bike_shape.part,
                    separation,
                    "Rider envelope overlaps protected bicycle geometry",
                ));
            }
        }
    }

    if !contacts.iter().any(|contact| contact.kind == "saddle") {
        let separation = pelvis_saddle_separation(rider, geometry, &sample);
        contacts.push(ContactResult {
            kind: "saddle".to_string(),
            rider_part: "pelvis".to_string(),
            bike_part: "saddle".to_string(),
            active: false,
            separation,
        });
    }

    if let Some(conflict) = pelvis_top_tube_conflict(key_index, rider, geometry, &sample) {
        conflicts.push(conflict);
    }

    contacts.sort_by_key(|contact| match contact.kind.as_str() {
        "hand" => 0,
        "foot" => 1,
        _ => 2,
    });

    PoseKeyValidation {
        key_index,
        s: sample.s,
        valid: conflicts.is_empty(),
        sample,
        minimum_separation,
        contacts,
        conflicts,
    }
}

pub fn resolve_pose_edit(
    scenario: &Scenario,
    key_index: usize,
    baseline_targets: PoseTargets,
    requested_targets: PoseTargets,
) -> Result<PoseEditResolution, String> {
    if key_index >= scenario.pose_clip.keys.len() {
        return Err("invalid-baseline".to_string());
    }
    let baseline_validation = validate_pose_key(scenario, key_index, baseline_targets.clone());
    if !baseline_validation.valid {
        return Err("invalid-baseline".to_string());
    }

    let requested_validation = validate_pose_key(scenario, key_index, requested_targets.clone());
    if requested_validation.valid {
        return Ok(PoseEditResolution {
            requested_targets: requested_targets.clone(),
            accepted_targets: requested_targets,
            requested_valid: true,
            validation: requested_validation,
            limiting_conflicts: Vec::new(),
        });
    }

    let limiting_conflicts = requested_validation.conflicts;
    let mut lower = 0.0f32;
    let mut upper = 1.0f32;
    let mut accepted_targets = baseline_targets.clone();
    let mut accepted_validation = baseline_validation;
    for _ in 0..EDIT_BISECTION_ITERATIONS {
        let midpoint = (lower + upper) * 0.5;
        let candidate = interpolate_targets(&baseline_targets, &requested_targets, midpoint);
        let validation = validate_pose_key(scenario, key_index, candidate.clone());
        if validation.valid {
            lower = midpoint;
            accepted_targets = candidate;
            accepted_validation = validation;
        } else {
            upper = midpoint;
        }
    }

    Ok(PoseEditResolution {
        requested_targets,
        accepted_targets,
        requested_valid: false,
        validation: accepted_validation,
        limiting_conflicts,
    })
}

pub fn validate_design(scenario: &Scenario) -> Result<DesignValidation, String> {
    if scenario.schema_version != crate::scenario::SCENARIO_SCHEMA_VERSION {
        return Err("unsupported-schema".to_string());
    }

    let geometry = inspect_bike_geometry(&scenario.bike);
    let scenario_hash = scenario.canonical_hash()?;
    if !geometry.valid {
        let conflict_count = geometry.issues.len();
        return Ok(DesignValidation {
            geometry,
            pose_keys: Vec::new(),
            can_solve: false,
            conflict_count,
            scenario_hash,
            model_version: crate::version::MODEL_VERSION.to_string(),
            solver_version: SOLVER_VERSION.to_string(),
        });
    }

    scenario.validate()?;
    let pose_keys: Vec<PoseKeyValidation> = scenario
        .pose_clip
        .keys
        .iter()
        .enumerate()
        .map(|(key_index, key)| validate_pose_key(scenario, key_index, key.targets.clone()))
        .collect();
    let conflict_count = pose_keys
        .iter()
        .map(|validation| validation.conflicts.len())
        .sum();

    Ok(DesignValidation {
        geometry,
        can_solve: conflict_count == 0,
        pose_keys,
        conflict_count,
        scenario_hash,
        model_version: crate::version::MODEL_VERSION.to_string(),
        solver_version: SOLVER_VERSION.to_string(),
    })
}

fn rider_envelopes(rider: &RiderSpec, landmarks: &AchievedPoseLandmarks) -> Vec<RiderEnvelope> {
    let trim_contact = rider.height * 0.04;
    vec![
        RiderEnvelope {
            part: "pelvis",
            geometry: ClearanceShape::Circle {
                center: landmarks.hip,
                radius: rider.height * 0.055,
            },
        },
        RiderEnvelope {
            part: "torso",
            geometry: ClearanceShape::Capsule {
                start: landmarks.hip,
                end: landmarks.shoulder,
                radius: rider.height * 0.035,
            },
        },
        RiderEnvelope {
            part: "head",
            geometry: ClearanceShape::Circle {
                center: landmarks.head,
                radius: rider.height * 0.06,
            },
        },
        RiderEnvelope {
            part: "leftThigh",
            geometry: ClearanceShape::Capsule {
                start: landmarks.knee,
                end: landmarks.hip,
                radius: rider.height * 0.025,
            },
        },
        RiderEnvelope {
            part: "leftShank",
            geometry: ClearanceShape::Capsule {
                start: inset_toward(landmarks.ankle, landmarks.knee, trim_contact),
                end: landmarks.knee,
                radius: rider.height * 0.02,
            },
        },
        RiderEnvelope {
            part: "leftUpperArm",
            geometry: ClearanceShape::Capsule {
                start: landmarks.shoulder,
                end: landmarks.elbow,
                radius: rider.height * 0.018,
            },
        },
        RiderEnvelope {
            part: "leftForearm",
            geometry: ClearanceShape::Capsule {
                start: landmarks.elbow,
                end: inset_toward(landmarks.hand, landmarks.elbow, trim_contact),
                radius: rider.height * 0.015,
            },
        },
        RiderEnvelope {
            part: "leftHand",
            geometry: ClearanceShape::Circle {
                center: landmarks.hand,
                radius: rider.height * 0.014,
            },
        },
        RiderEnvelope {
            part: "leftFoot",
            geometry: ClearanceShape::Circle {
                center: landmarks.ankle,
                radius: rider.height * 0.014,
            },
        },
    ]
}

fn joint_and_reach_conflicts(
    key_index: usize,
    rider: &RiderSpec,
    sample: &PoseSampleOutput,
) -> Vec<DesignConflict> {
    let mut conflicts = Vec::new();
    let knee_bend = knee_flexion(&sample.targets);
    let hip_bend = hip_flexion(&sample.targets);
    for (code, message, outside) in [
        (
            "knee-hyperextension",
            "Knee bends backward past a straight leg",
            knee_bend < KNEE_HYPEREXTENSION_RAD,
        ),
        (
            "knee-overflexion",
            "Knee folds further than a leg can bend",
            knee_bend > KNEE_FLEXION_RAD,
        ),
        (
            "hip-overextension",
            "Torso opens further behind the thigh than a hip allows",
            hip_bend < HIP_EXTENSION_RAD,
        ),
        (
            "hip-overflexion",
            "Torso folds onto the thigh further than a hip allows",
            hip_bend > HIP_FLEXION_RAD,
        ),
    ] {
        if outside {
            conflicts.push(DesignConflict {
                code: code.to_string(),
                kind: "joint-limit".to_string(),
                key_index: Some(key_index),
                rider_part: None,
                bike_part: None,
                separation: None,
                message: message.to_string(),
            });
        }
    }

    let links = rider_link_lengths(rider);
    let reach = sample
        .landmarks
        .shoulder
        .distance(&sample.landmarks.handlebar_contact);
    let minimum = (links.upper_arm - links.forearm).abs() + 1.0e-4;
    let maximum = links.upper_arm + links.forearm - 1.0e-4;
    if reach < minimum || reach > maximum {
        conflicts.push(DesignConflict {
            code: "handlebar-reach".to_string(),
            kind: "reach".to_string(),
            key_index: Some(key_index),
            rider_part: Some("leftHand".to_string()),
            bike_part: Some("handlebar".to_string()),
            separation: Some(if reach < minimum {
                reach - minimum
            } else {
                maximum - reach
            }),
            message: "Handlebar contact is outside the rider arm reach".to_string(),
        });
    }

    // The hand is locked to the grip, so an arm angle the declared range cannot
    // hold is a real limit and must block the pose rather than silently clamp.
    let (shoulder_angle, elbow_angle, _) = arm_solution(
        links.upper_arm,
        links.forearm,
        sample.landmarks.shoulder,
        sample.landmarks.handlebar_contact,
    );
    for (name, value, limit) in [
        ("shoulder", shoulder_angle, &rider.joints.shoulder),
        ("elbow", elbow_angle, &rider.joints.elbow),
    ] {
        if !value.is_finite() || value < limit.min - 1.0e-6 || value > limit.max + 1.0e-6 {
            conflicts.push(DesignConflict {
                code: format!("{name}-joint-limit"),
                kind: "joint-limit".to_string(),
                key_index: Some(key_index),
                rider_part: None,
                bike_part: None,
                separation: None,
                message: format!("{name} must leave its declared range to hold the handlebar"),
            });
        }
    }
    conflicts
}

fn is_designated_contact(
    rider_part: &str,
    contact_surface: ContactSurface,
    bike_part: &str,
) -> bool {
    matches!(
        (rider_part, contact_surface, bike_part),
        ("leftHand", ContactSurface::Hand, "handlebar")
            | ("leftFoot", ContactSurface::Foot, "pedalForward")
    )
}

fn is_lateral_limb_central_tube_projection(rider_part: &str, bike_part: &str) -> bool {
    matches!(
        rider_part,
        "leftThigh" | "leftShank" | "leftUpperArm" | "leftForearm"
    ) && matches!(
        bike_part,
        "topTube" | "downTube" | "seatTube" | "chainstay" | "seatstay"
    )
}

fn saddle_contact_state(
    rider: &RiderSpec,
    geometry: &BikeGeometryInspection,
    sample: &PoseSampleOutput,
    separation: f32,
) -> Option<ContactResult> {
    let saddle = geometry.landmarks["saddleCenter"];
    let pelvis_radius = rider.height * 0.055;
    let lower_pelvis = sample.landmarks.hip.y - rider.height * SEAT_CONTACT_DROP_RATIO;
    let horizontally_supported = (sample.landmarks.hip.x - saddle.x).abs() <= 0.13 + pelvis_radius;
    let remains_above = lower_pelvis >= saddle.y - CLEARANCE_EPSILON_M;
    if horizontally_supported && remains_above && separation <= CLEARANCE_EPSILON_M {
        Some(ContactResult {
            kind: "saddle".to_string(),
            rider_part: "pelvis".to_string(),
            bike_part: "saddle".to_string(),
            active: true,
            separation,
        })
    } else {
        None
    }
}

fn pelvis_saddle_separation(
    rider: &RiderSpec,
    geometry: &BikeGeometryInspection,
    sample: &PoseSampleOutput,
) -> f32 {
    let pelvis = ClearanceShape::Circle {
        center: sample.landmarks.hip,
        radius: rider.height * 0.055,
    };
    let saddle = geometry
        .protected_shapes
        .iter()
        .find(|shape| shape.part == "saddle")
        .expect("canonical geometry includes saddle");
    signed_shape_separation(&pelvis, &ClearanceShape::from(&saddle.geometry))
}

fn pelvis_top_tube_conflict(
    key_index: usize,
    rider: &RiderSpec,
    geometry: &BikeGeometryInspection,
    sample: &PoseSampleOutput,
) -> Option<DesignConflict> {
    let top_tube = geometry
        .members
        .iter()
        .find(|member| member.name == "topTube")?;
    let minimum_x = top_tube.start.x.min(top_tube.end.x);
    let maximum_x = top_tube.start.x.max(top_tube.end.x);
    let hip = sample.landmarks.hip;
    if hip.x < minimum_x || hip.x > maximum_x {
        return None;
    }
    let span = top_tube.end.x - top_tube.start.x;
    let fraction = if span.abs() <= f32::EPSILON {
        0.0
    } else {
        (hip.x - top_tube.start.x) / span
    };
    let boundary_y =
        top_tube.start.y + (top_tube.end.y - top_tube.start.y) * fraction + top_tube.radius;
    let lower_pelvis = hip.y - rider.height * SEAT_CONTACT_DROP_RATIO;
    let separation = lower_pelvis - boundary_y;
    (separation < -CLEARANCE_EPSILON_M).then(|| {
        clearance_conflict(
            "pelvis-below-top-tube",
            key_index,
            "pelvis",
            "topTube",
            separation,
            "Pelvis must remain above the top tube while within its span",
        )
    })
}

fn clearance_conflict(
    code: &str,
    key_index: usize,
    rider_part: &str,
    bike_part: &str,
    separation: f32,
    message: &str,
) -> DesignConflict {
    DesignConflict {
        code: code.to_string(),
        kind: "clearance".to_string(),
        key_index: Some(key_index),
        rider_part: Some(rider_part.to_string()),
        bike_part: Some(bike_part.to_string()),
        separation: Some(separation),
        message: message.to_string(),
    }
}

fn interpolate_targets(left: &PoseTargets, right: &PoseTargets, fraction: f32) -> PoseTargets {
    let interpolate = |start: f32, end: f32| start + (end - start) * fraction;
    PoseTargets {
        knee: interpolate(left.knee, right.knee),
        hip: interpolate(left.hip, right.hip),
        spine: interpolate(left.spine, right.spine),
    }
}

fn inset_toward(point: Point2, toward: Point2, distance: f32) -> Point2 {
    let length = point.distance(&toward);
    if length <= distance || length <= f32::EPSILON {
        return toward;
    }
    let scale = distance / length;
    Point2::new(
        point.x + (toward.x - point.x) * scale,
        point.y + (toward.y - point.y) * scale,
    )
}
