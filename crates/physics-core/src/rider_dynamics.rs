//! Two-body rider coupling.
//!
//! The rider is a rigid body separate from the bicycle. The authored pose, sampled through the
//! kinematic skeleton, supplies a target rider centre of mass and torso orientation in the
//! bicycle frame. A force-limited proportional-derivative actuator pulls the rider toward that
//! target and pushes the bicycle the opposite way. Every actuator force is applied equal and
//! opposite at the same world point, so the rider can redistribute momentum between the bodies
//! but never adds net external force or torque to the system.

use rapier2d::na::{ComplexField, RealField};

use crate::bike::rider_mass_properties;
use crate::geometry::{BikeContactPoints, Point2, rider_link_lengths};
use crate::pose::{AchievedPoseLandmarks, KNEE_FLEXION_RAD, build_skeleton, wrap_angle};
use crate::scenario::{PoseTargets, RiderSpec};

/// Representative actuator bandwidths. Limb position control is a few hertz.
pub const DEFAULT_LINEAR_FREQUENCY_RAD_S: f32 = 30.0;
pub const DEFAULT_PITCH_FREQUENCY_RAD_S: f32 = 25.0;
pub const DEFAULT_DAMPING_RATIO: f32 = 1.0;
/// Force caps as multiples of rider weight: legs push harder than arms pull fore/aft.
pub const DEFAULT_FORE_AFT_WEIGHT_MULTIPLE: f32 = 1.5;
pub const DEFAULT_VERTICAL_WEIGHT_MULTIPLE: f32 = 3.0;
/// Torque cap as rider weight acting at this lever arm.
pub const DEFAULT_PITCH_LEVER_M: f32 = 0.4;

const GRAVITY_M_S2: f32 = 9.81;
const REACH_MARGIN_M: f32 = 1.0e-3;
const RECONSTRUCTION_ITERATIONS: usize = 16;
const RECONSTRUCTION_TOLERANCE_M: f32 = 1.0e-5;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CouplingGains {
    pub linear_frequency: f32,
    pub linear_damping_ratio: f32,
    pub pitch_frequency: f32,
    pub pitch_damping_ratio: f32,
    pub max_force_fore_aft: f32,
    pub max_force_vertical: f32,
    pub max_torque: f32,
}

impl CouplingGains {
    pub fn representative(rider: &RiderSpec) -> Self {
        let weight = rider.mass * GRAVITY_M_S2 * rider.strength_scale;
        Self {
            linear_frequency: DEFAULT_LINEAR_FREQUENCY_RAD_S,
            linear_damping_ratio: DEFAULT_DAMPING_RATIO,
            pitch_frequency: DEFAULT_PITCH_FREQUENCY_RAD_S,
            pitch_damping_ratio: DEFAULT_DAMPING_RATIO,
            max_force_fore_aft: weight * DEFAULT_FORE_AFT_WEIGHT_MULTIPLE,
            max_force_vertical: weight * DEFAULT_VERTICAL_WEIGHT_MULTIPLE,
            max_torque: weight * DEFAULT_PITCH_LEVER_M,
        }
    }
}

/// Constant rider and bicycle inertial properties used by the coupling.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CoupledInertia {
    pub rider_mass: f32,
    pub rider_inertia: f32,
    pub bike_mass: f32,
    pub bike_inertia: f32,
}

impl CoupledInertia {
    fn reduced_mass(&self) -> f32 {
        self.rider_mass * self.bike_mass / (self.rider_mass + self.bike_mass)
    }

    fn reduced_inertia(&self) -> f32 {
        self.rider_inertia * self.bike_inertia / (self.rider_inertia + self.bike_inertia)
    }
}

/// Rider centre of mass and torso orientation relative to the bicycle frame. `angle` is
/// counter-clockwise and zero at the reference spine angle.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RiderTarget {
    pub com: Point2,
    pub angle: f32,
}

/// Rider state relative to the bicycle, expressed in bicycle-local axes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RelativeState {
    pub com: Point2,
    pub velocity: Point2,
    pub angle: f32,
    pub angular_velocity: f32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CouplingCommand {
    /// Force on the rider in bicycle-local axes; the bicycle receives its negation.
    pub force_local: Point2,
    /// Torque on the rider; the bicycle receives its negation.
    pub torque: f32,
    pub saturated_fore_aft: bool,
    pub saturated_vertical: bool,
    pub saturated_pitch: bool,
}

/// Spine angles grow as the torso leans forward (clockwise), so the counter-clockwise rider
/// angle relative to the bicycle is the reference minus the spine target.
pub fn rider_angle_for_spine(spine: f32, spine_reference: f32) -> f32 {
    spine_reference - spine
}

pub fn rider_target(
    rider: &RiderSpec,
    landmarks: &AchievedPoseLandmarks,
    spine: f32,
    spine_reference: f32,
) -> RiderTarget {
    let (com, _) = rider_mass_properties(rider, landmarks);
    RiderTarget {
        com,
        angle: rider_angle_for_spine(spine, spine_reference),
    }
}

/// Implicit (backward-Euler) PD force for one axis with effective mass `reduced`. It stays
/// stable at every supported step because the damping and stiffness act on the predicted
/// end-of-step state rather than the current one.
fn implicit_pd(
    stiffness: f32,
    damping: f32,
    error: f32,
    error_rate: f32,
    reduced: f32,
    dt: f32,
) -> f32 {
    (stiffness * error - (stiffness * dt + damping) * error_rate)
        / (1.0 + (stiffness * dt * dt + damping * dt) / reduced)
}

fn saturate(value: f32, limit: f32) -> (f32, bool) {
    let clamped = value.clamp(-limit, limit);
    (clamped, clamped != value)
}

pub fn coupling_command(
    gains: &CouplingGains,
    inertia: &CoupledInertia,
    state: &RelativeState,
    target: &RiderTarget,
    target_velocity: Point2,
    target_angular_velocity: f32,
    dt: f32,
) -> CouplingCommand {
    let mass = inertia.rider_mass;
    let reduced_mass = inertia.reduced_mass();
    let linear_stiffness = mass * gains.linear_frequency * gains.linear_frequency;
    let linear_damping = 2.0 * gains.linear_damping_ratio * mass * gains.linear_frequency;
    let force_x = implicit_pd(
        linear_stiffness,
        linear_damping,
        target.com.x - state.com.x,
        state.velocity.x - target_velocity.x,
        reduced_mass,
        dt,
    );
    let force_y = implicit_pd(
        linear_stiffness,
        linear_damping,
        target.com.y - state.com.y,
        state.velocity.y - target_velocity.y,
        reduced_mass,
        dt,
    );

    let rotational = inertia.rider_inertia;
    let pitch_stiffness = rotational * gains.pitch_frequency * gains.pitch_frequency;
    let pitch_damping = 2.0 * gains.pitch_damping_ratio * rotational * gains.pitch_frequency;
    let torque = implicit_pd(
        pitch_stiffness,
        pitch_damping,
        wrap_angle(target.angle - state.angle),
        state.angular_velocity - target_angular_velocity,
        inertia.reduced_inertia(),
        dt,
    );

    let (force_x, saturated_fore_aft) = saturate(force_x, gains.max_force_fore_aft);
    let (force_y, saturated_vertical) = saturate(force_y, gains.max_force_vertical);
    let (torque, saturated_pitch) = saturate(torque, gains.max_torque);

    CouplingCommand {
        force_local: Point2::new(force_x, force_y),
        torque,
        saturated_fore_aft,
        saturated_vertical,
        saturated_pitch,
    }
}

/// Natural frequency of the skeletal stop that engages past the reachable workspace.
pub const WORKSPACE_FREQUENCY_RAD_S: f32 = 80.0;
const WORKSPACE_ENGAGE_M: f32 = 1.0e-4;

/// One-sided stop that carries load through the skeleton once the rider is pushed past the
/// reachable workspace, for example legs fully folded or arms fully extended. It is not capped
/// by actuator strength: bones, not muscles, take this load. Returns the force on the rider in
/// bicycle-local axes; the bicycle receives its negation.
pub fn workspace_force(
    inertia: &CoupledInertia,
    state: &RelativeState,
    reachable_com: Point2,
    dt: f32,
) -> Point2 {
    let dx = state.com.x - reachable_com.x;
    let dy = state.com.y - reachable_com.y;
    let depth = ComplexField::sqrt(dx * dx + dy * dy);
    if depth <= WORKSPACE_ENGAGE_M {
        return Point2::default();
    }
    let normal = Point2::new(dx / depth, dy / depth);
    let outward_speed = state.velocity.x * normal.x + state.velocity.y * normal.y;
    let stiffness = inertia.rider_mass * WORKSPACE_FREQUENCY_RAD_S * WORKSPACE_FREQUENCY_RAD_S;
    let damping = 2.0 * inertia.rider_mass * WORKSPACE_FREQUENCY_RAD_S;
    let magnitude = implicit_pd(
        stiffness,
        damping,
        -depth,
        outward_speed,
        inertia.reduced_mass(),
        dt,
    )
    .min(0.0);
    Point2::new(normal.x * magnitude, normal.y * magnitude)
}

/// Rider skeleton rebuilt from an achieved rider centre of mass and orientation.
#[derive(Debug, Clone, PartialEq)]
pub struct Reconstruction {
    pub landmarks: AchievedPoseLandmarks,
    pub targets: PoseTargets,
    /// Centre of mass of the rebuilt skeleton.
    pub com: Point2,
    /// Distance between the requested centre of mass and the rebuilt skeleton's.
    pub residual: f32,
    /// The hip had to be moved to keep the feet on the pedals and the hands on the grips.
    pub projected: bool,
}

/// Moves the hip into the region where the leg reaches the pedal and the arm reaches the grip.
fn project_hip(
    hip: Point2,
    spine: f32,
    rider: &RiderSpec,
    contacts: &BikeContactPoints,
) -> (Point2, bool) {
    let links = rider_link_lengths(rider);
    let pedal = contacts.pedal_contact;
    let grip = contacts.handlebar_contact;
    // The tightest anatomical knee bend sets how far the hip can drop toward the pedal.
    let knee_interior = core::f32::consts::PI - KNEE_FLEXION_RAD;
    let leg_min = ComplexField::sqrt(
        links.thigh * links.thigh + links.shank * links.shank
            - 2.0 * links.thigh * links.shank * ComplexField::cos(knee_interior),
    );
    let leg_max = links.thigh + links.shank - REACH_MARGIN_M;
    let arm_max = links.upper_arm + links.forearm - REACH_MARGIN_M;
    let torso = Point2::new(
        ComplexField::sin(spine) * links.torso,
        ComplexField::cos(spine) * links.torso,
    );

    let mut projected = hip;
    for _ in 0..2 {
        let dx = projected.x - pedal.x;
        let dy = projected.y - pedal.y;
        let leg = ComplexField::sqrt(dx * dx + dy * dy);
        if leg > f32::EPSILON && (leg < leg_min || leg > leg_max) {
            let scale = leg.clamp(leg_min, leg_max) / leg;
            projected = Point2::new(pedal.x + dx * scale, pedal.y + dy * scale);
        }

        let shoulder = Point2::new(projected.x + torso.x, projected.y + torso.y);
        let ax = grip.x - shoulder.x;
        let ay = grip.y - shoulder.y;
        let arm = ComplexField::sqrt(ax * ax + ay * ay);
        if arm > arm_max {
            let excess = (arm - arm_max) / arm;
            projected = Point2::new(projected.x + ax * excess, projected.y + ay * excess);
        }
    }

    let moved = projected.distance(&hip) > 1.0e-6;
    (projected, moved)
}

/// Absolute knee and hip segment angles that place the hip at `hip` with the foot on the pedal.
/// The knee takes the forward solution, matching the riding posture.
fn leg_targets_for_hip(hip: Point2, rider: &RiderSpec, contacts: &BikeContactPoints) -> (f32, f32) {
    let links = rider_link_lengths(rider);
    let pedal = contacts.pedal_contact;
    let dx = hip.x - pedal.x;
    let dy = hip.y - pedal.y;
    let distance = ComplexField::sqrt(dx * dx + dy * dy).max(f32::EPSILON);
    let cos_at_pedal = ((links.shank * links.shank + distance * distance
        - links.thigh * links.thigh)
        / (2.0 * links.shank * distance))
        .clamp(-1.0, 1.0);
    let offset = ComplexField::acos(cos_at_pedal);
    let base = RealField::atan2(dy, dx);
    let candidates = [base + offset, base - offset].map(|angle| {
        Point2::new(
            pedal.x + ComplexField::cos(angle) * links.shank,
            pedal.y + ComplexField::sin(angle) * links.shank,
        )
    });
    let knee = if candidates[0].x >= candidates[1].x {
        candidates[0]
    } else {
        candidates[1]
    };
    let knee_angle = RealField::atan2(knee.x - pedal.x, knee.y - pedal.y);
    let hip_angle = RealField::atan2(hip.x - knee.x, hip.y - knee.y);
    (knee_angle, hip_angle)
}

/// Rebuilds a connected skeleton whose centre of mass matches `com` and whose torso matches the
/// relative `angle`. The hip is the free coordinate; feet stay on the pedals and hands on the
/// grips, so the result is always a valid side-plane skeleton.
pub fn reconstruct_skeleton(
    rider: &RiderSpec,
    contacts: &BikeContactPoints,
    com: Point2,
    angle: f32,
    spine_reference: f32,
    hip_guess: Point2,
) -> Reconstruction {
    reconstruct_skeleton_within(
        rider,
        contacts,
        com,
        angle,
        spine_reference,
        hip_guess,
        RECONSTRUCTION_ITERATIONS,
    )
}

/// [`reconstruct_skeleton`] with a caller-chosen iteration budget, for warm-started per-step use.
pub fn reconstruct_skeleton_within(
    rider: &RiderSpec,
    contacts: &BikeContactPoints,
    com: Point2,
    angle: f32,
    spine_reference: f32,
    hip_guess: Point2,
    max_iterations: usize,
) -> Reconstruction {
    let spine = spine_reference - angle;
    let mut hip = hip_guess;
    let mut projected_any = false;
    let mut best = None;

    for _ in 0..max_iterations.max(1) {
        let (candidate, projected) = project_hip(hip, spine, rider, contacts);
        projected_any |= projected;
        hip = candidate;
        let (knee, hip_angle) = leg_targets_for_hip(hip, rider, contacts);
        let targets = PoseTargets {
            knee,
            hip: hip_angle,
            spine,
        };
        let skeleton = build_skeleton(&targets, rider, contacts);
        let (rebuilt_com, _) = rider_mass_properties(rider, &skeleton.landmarks);
        let delta = Point2::new(com.x - rebuilt_com.x, com.y - rebuilt_com.y);
        let residual = ComplexField::sqrt(delta.x * delta.x + delta.y * delta.y);
        best = Some(Reconstruction {
            landmarks: skeleton.landmarks,
            targets,
            com: rebuilt_com,
            residual,
            projected: projected_any,
        });
        if residual <= RECONSTRUCTION_TOLERANCE_M {
            break;
        }
        hip = Point2::new(hip.x + delta.x, hip.y + delta.y);
    }

    best.expect("reconstruction runs at least once")
}
