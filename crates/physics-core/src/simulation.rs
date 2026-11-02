//! Two-body bicycle and rider simulation.
//!
//! Entry speed is applied once at the start of the approach; afterwards only gravity, terrain
//! contact, and the internal rider actuator change the motion. See `rider_dynamics` for the
//! coupling contract.

use rapier2d::na::ComplexField;
use rapier2d::prelude::*;

use crate::bike::{build_bike_model, rider_mass_properties};
use crate::geometry::{
    BikeContactPoints, Point2, TerrainProfile, bike_contact_points, generate_terrain_profile,
    inspect_bike_geometry, nearest_surface_clearance, terrain_height_at, terrain_slope_angle_at,
};
use crate::pose::{sample_pose_with_contacts, wrap_angle};
use crate::rider_dynamics::{
    CoupledInertia, CouplingCommand, CouplingGains, Reconstruction, RelativeState, RiderTarget,
    coupling_command, reconstruct_skeleton, reconstruct_skeleton_within, rider_target,
    workspace_force,
};
use crate::scenario::{PoseClip, RiderInstinct, RiderSpec, Scenario};
use crate::solver::{
    CONTACT_IMPULSE_EPSILON, MAX_SOLVE_DURATION_SECONDS, POST_LANDING_FOLLOW_SECONDS,
    TAKEOFF_CLEARANCE_M, insert_terrain_colliders, wheel_contact, world_point,
};

pub const GRAVITY_M_S2: f32 = 9.81;
/// A run has stalled when the pose distance advances less than this over the window below.
pub const STALL_MIN_PROGRESS_M: f32 = 0.05;
pub const STALL_WINDOW_SECONDS: f32 = 1.0;
/// Warm-started hip iterations per step when checking the reachable workspace.
const WORKSPACE_ITERATIONS: usize = 12;
/// The instinct re-plans its landing prediction this often (in physics steps).
const INSTINCT_REPLAN_STEPS: u32 = 8;
/// Time constant with which instinct corrections are blended in and out.
const INSTINCT_TIME_CONSTANT_S: f32 = 0.08;
/// Within this long of predicted touchdown the instinct holds its correction instead of
/// re-planning, so it never jerks the rider on contact.
const INSTINCT_HOLD_BEFORE_TOUCHDOWN_S: f32 = 0.05;
const PREDICTION_HORIZON_S: f32 = 3.0;
const PREDICTION_STEP_S: f32 = 0.01;
/// Rider landmarks checked against the terrain for a crash.
const CRASH_PARTS: [&str; 5] = ["head", "shoulder", "hip", "elbow", "knee"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EndReason {
    PostLandingWindow,
    TerrainEnd,
    Stalled,
    TimeLimit,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BodyState {
    pub com: Point2,
    pub angle: f32,
    pub velocity: Point2,
    pub angular_velocity: f32,
}

/// Bicycle and system state at one physics step, used for takeoff and touchdown.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ContactEvent {
    pub t: f32,
    pub bike_origin: Point2,
    pub pitch: f32,
    pub pitch_rate: f32,
    /// Velocity of the combined centre of mass.
    pub system_velocity: Point2,
    pub rear: bool,
    pub front: bool,
    /// World x of the wheel(s) in contact.
    pub contact_x: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CrashReason {
    RiderTerrainContact { part: &'static str },
    Inverted,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CrashEvent {
    pub t: f32,
    pub reason: CrashReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Default)]
pub struct InstinctSummary {
    pub peak_angle: f32,
    pub peak_offset: f32,
    /// Seconds spent with at least one correction axis at its bound.
    pub saturated_seconds: f32,
    /// Time integral of the correction, normalised by each axis bound.
    pub effort: f32,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SimFrame {
    /// Time at the end of the physics step that produced this frame.
    pub t: f32,
    /// Monotonic forward pose distance used to sample the authored clip.
    pub s: f32,
    /// World position of the bicycle body origin (contact line below the axle midpoint).
    pub bike_origin: Point2,
    pub bike: BodyState,
    pub rider: BodyState,
    pub relative: RelativeState,
    /// Authored target before instinct corrections.
    pub authored_target: RiderTarget,
    /// Target the actuator tracked: authored plus instinct correction.
    pub target: RiderTarget,
    /// Instinct correction in bicycle-local axes (fore/aft offset, angle).
    pub instinct_offset: f32,
    pub instinct_angle: f32,
    pub instinct_saturated: bool,
    pub command: CouplingCommand,
    /// Skeletal stop force on the rider (bicycle-local) once past the reachable workspace.
    pub workspace_force: Point2,
    pub airborne: bool,
    pub grounded_rear: bool,
    pub grounded_front: bool,
    pub normal_force_rear: f32,
    pub normal_force_front: f32,
    /// Normal impulse accumulated over this output interval.
    pub contact_impulse: f32,
    pub min_clearance: f32,
    /// Translational, rotational, and gravitational energy of both bodies.
    pub energy: f32,
    /// Cumulative signed work done by the rider actuator on the system.
    pub actuator_work: f32,
    pub actuator_work_positive: f32,
    pub actuator_work_negative: f32,
    /// Total linear momentum of both bodies.
    pub linear_momentum: Point2,
    /// Total angular momentum of both bodies about the world origin.
    pub angular_momentum: f32,
    pub crashed: bool,
    pub skeleton: Reconstruction,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Simulation {
    pub frames: Vec<SimFrame>,
    pub end_reason: EndReason,
    pub terrain: TerrainProfile,
    pub inertia: CoupledInertia,
    pub gains: CouplingGains,
    pub spine_reference: f32,
    pub physics_hz: u32,
    pub output_hz: u32,
    /// Last grounded step before the first flight that reaches real clearance.
    pub takeoff: Option<ContactEvent>,
    /// First wheel contact after that flight.
    pub touchdown: Option<ContactEvent>,
    pub crash: Option<CrashEvent>,
    pub instinct: InstinctSummary,
}

#[derive(Debug, Clone, Default)]
pub struct SimulationOptions {
    /// Overrides the gains derived from the rider's coupling settings.
    pub gains: Option<CouplingGains>,
}

fn rotate(point: Point2, angle: f32) -> Point2 {
    let (sin, cos) = (ComplexField::sin(angle), ComplexField::cos(angle));
    Point2::new(cos * point.x - sin * point.y, sin * point.x + cos * point.y)
}

fn to_vector(point: Point2) -> Vector {
    Vector::new(point.x, point.y)
}

fn to_point(vector: Vector) -> Point2 {
    Point2::new(vector.x, vector.y)
}

fn cross(a: Point2, b: Point2) -> f32 {
    a.x * b.y - a.y * b.x
}

fn sub(a: Point2, b: Point2) -> Point2 {
    Point2::new(a.x - b.x, a.y - b.y)
}

/// World centre of mass computed from the body pose. Rapier only refreshes its cached world
/// centre of mass during a step, so the cache is stale before the first one.
fn world_com(body: &RigidBody, local_com: Point2) -> Point2 {
    to_point(*body.position() * to_vector(local_com))
}

fn velocity_at(body: &RigidBody, local_com: Point2, point: Point2) -> Point2 {
    let com = world_com(body, local_com);
    let linear = body.linvel();
    let omega = body.angvel();
    Point2::new(
        linear.x - omega * (point.y - com.y),
        linear.y + omega * (point.x - com.x),
    )
}

fn body_state(body: &RigidBody, local_com: Point2) -> BodyState {
    BodyState {
        com: world_com(body, local_com),
        angle: body.rotation().angle(),
        velocity: to_point(body.linvel()),
        angular_velocity: body.angvel(),
    }
}

/// The rider body's centre of mass is its local origin, so its translation is its centre of mass.
fn relative_state(bike: &RigidBody, bike_local_com: Point2, rider: &RigidBody) -> RelativeState {
    let bike_angle = bike.rotation().angle();
    let origin = to_point(bike.translation());
    let rider_com = to_point(rider.translation());
    let carried = velocity_at(bike, bike_local_com, rider_com);
    let rider_velocity = to_point(rider.linvel());
    RelativeState {
        com: rotate(sub(rider_com, origin), -bike_angle),
        velocity: rotate(sub(rider_velocity, carried), -bike_angle),
        angle: wrap_angle(rider.rotation().angle() - bike_angle),
        angular_velocity: rider.angvel() - bike.angvel(),
    }
}

fn mechanical_energy(state: &BodyState, mass: f32, inertia: f32) -> f32 {
    0.5 * mass * (state.velocity.x * state.velocity.x + state.velocity.y * state.velocity.y)
        + 0.5 * inertia * state.angular_velocity * state.angular_velocity
        + mass * GRAVITY_M_S2 * state.com.y
}

fn momentum(state: &BodyState, mass: f32, inertia: f32) -> (Point2, f32) {
    let linear = Point2::new(mass * state.velocity.x, mass * state.velocity.y);
    (
        linear,
        inertia * state.angular_velocity + cross(state.com, linear),
    )
}

fn system_velocity(bike: &BodyState, rider: &BodyState, inertia: &CoupledInertia) -> Point2 {
    let total = inertia.bike_mass + inertia.rider_mass;
    Point2::new(
        (inertia.bike_mass * bike.velocity.x + inertia.rider_mass * rider.velocity.x) / total,
        (inertia.bike_mass * bike.velocity.y + inertia.rider_mass * rider.velocity.y) / total,
    )
}

fn authored_target(
    clip: &PoseClip,
    s: f32,
    rider: &RiderSpec,
    contacts: &BikeContactPoints,
    spine_reference: f32,
) -> (RiderTarget, Point2) {
    let sample = sample_pose_with_contacts(clip, s, rider, contacts);
    (
        rider_target(
            rider,
            &sample.landmarks,
            sample.targets.spine,
            spine_reference,
        ),
        sample.landmarks.hip,
    )
}

/// Inputs the instinct needs to predict the bicycle attitude at touchdown.
struct FlightState<'a> {
    bike: BodyState,
    rider: BodyState,
    bike_origin: Point2,
    relative: RelativeState,
    bike_local_com: Point2,
    s: f32,
    inertia: &'a CoupledInertia,
}

/// Correction the rider needs so that, conserving angular momentum and following the authored
/// schedule, the bicycle meets the landing at the surface slope. Returns the desired
/// (fore/aft offset, angle), whether either axis is at its bound, and the predicted time to
/// touchdown.
#[allow(clippy::too_many_arguments)]
fn plan_instinct(
    flight: &FlightState,
    instinct: &RiderInstinct,
    terrain: &TerrainProfile,
    clip: &PoseClip,
    rider: &RiderSpec,
    contacts: &BikeContactPoints,
    spine_reference: f32,
) -> Option<(f32, f32, bool, f32)> {
    let inertia = flight.inertia;
    let total = inertia.bike_mass + inertia.rider_mass;
    let velocity = system_velocity(&flight.bike, &flight.rider, inertia);
    let com = Point2::new(
        (inertia.bike_mass * flight.bike.com.x + inertia.rider_mass * flight.rider.com.x) / total,
        (inertia.bike_mass * flight.bike.com.y + inertia.rider_mass * flight.rider.com.y) / total,
    );

    let mut touchdown = None;
    let mut t = PREDICTION_STEP_S;
    while t <= PREDICTION_HORIZON_S {
        let x = flight.bike_origin.x + velocity.x * t;
        let y = flight.bike_origin.y + velocity.y * t - 0.5 * GRAVITY_M_S2 * t * t;
        if terrain_height_at(terrain, x).is_some_and(|ground| y <= ground) {
            touchdown = Some((t, x));
            break;
        }
        t += PREDICTION_STEP_S;
    }
    let (time_to_touchdown, landing_x) = touchdown?;
    let slope = terrain_slope_angle_at(terrain, landing_x)?;

    let angular_momentum: f32 = [
        (&flight.bike, inertia.bike_mass, inertia.bike_inertia),
        (&flight.rider, inertia.rider_mass, inertia.rider_inertia),
    ]
    .iter()
    .map(|(body, mass, rotational)| {
        let arm = sub(body.com, com);
        let relative_velocity = sub(body.velocity, velocity);
        rotational * body.angular_velocity + mass * cross(arm, relative_velocity)
    })
    .sum();
    let reduced = inertia.bike_mass * inertia.rider_mass / total;
    let separation = sub(flight.rider.com, flight.bike.com);
    let separation_sq = separation.x * separation.x + separation.y * separation.y;
    let system_inertia = inertia.bike_inertia + inertia.rider_inertia + reduced * separation_sq;

    // With no external torque, (I_b + I_r + μ|r|²) ω_b = L − I_r dφ/dt − μ r × dr/dt in bike
    // axes, so a relative change (dφ, dr) turns the bike by −(I_r dφ + μ r × dr) / I_total.
    let (scheduled, _) = authored_target(
        clip,
        flight.s + velocity.x * time_to_touchdown,
        rider,
        contacts,
        spine_reference,
    );
    let arm_now = sub(flight.relative.com, flight.bike_local_com);
    let arm_scheduled = sub(scheduled.com, flight.bike_local_com);
    let scheduled_turn = inertia.rider_inertia * (scheduled.angle - flight.relative.angle)
        + reduced * cross(arm_now, sub(arm_scheduled, arm_now));
    let predicted = flight.bike.angle + angular_momentum / system_inertia * time_to_touchdown
        - scheduled_turn / system_inertia;
    let error = wrap_angle(predicted - slope);

    let required = error * system_inertia;
    let desired_angle = required / inertia.rider_inertia;
    let angle = desired_angle.clamp(-instinct.max_angle, instinct.max_angle);
    let remaining = required - inertia.rider_inertia * angle;
    // A fore/aft shift δx at height r_y above the bike centre of mass contributes −μ r_y δx.
    let lever = -reduced * arm_now.y;
    let (offset, offset_saturated) = if lever.abs() > 1.0e-4 {
        let desired_offset = remaining / lever;
        let offset = desired_offset.clamp(-instinct.max_offset, instinct.max_offset);
        (offset, offset != desired_offset)
    } else {
        (0.0, remaining.abs() > 1.0e-6)
    };
    let saturated = angle != desired_angle && offset_saturated;
    Some((offset, angle, saturated, time_to_touchdown))
}

pub fn simulate(scenario: &Scenario, options: &SimulationOptions) -> Result<Simulation, String> {
    scenario.validate()?;

    let terrain = generate_terrain_profile(scenario, 0.05);
    let bike_model = build_bike_model(&scenario.bike, &scenario.rider, scenario.solver.ccd);
    let bike_mass_properties = inspect_bike_geometry(&scenario.bike).mass_properties;
    let contacts = bike_contact_points(&scenario.bike);
    let bike_local_com = bike_mass_properties.center_of_gravity;
    let rider_spec = &scenario.rider;
    let clip = &scenario.pose_clip;
    let instinct = &scenario.solver.rider_instinct;
    let gains = options
        .gains
        .unwrap_or_else(|| CouplingGains::from_rider(rider_spec));

    let reference = sample_pose_with_contacts(clip, clip.keys[0].s, rider_spec, &contacts);
    let spine_reference = reference.targets.spine;
    let (_, rider_inertia) = rider_mass_properties(rider_spec, &reference.landmarks);
    let inertia = CoupledInertia {
        rider_mass: rider_spec.mass,
        rider_inertia,
        bike_mass: bike_mass_properties.total_mass,
        bike_inertia: bike_mass_properties.planar_inertia,
    };

    let physics_dt = scenario.solver.dt / scenario.solver.substeps as f32;
    let initial_y = terrain_height_at(&terrain, scenario.entry.start_x)
        .ok_or_else(|| "entry.startX is not supported by terrain".to_string())?;
    let lowest_terrain = terrain
        .segments
        .iter()
        .flat_map(|segment| segment.points.iter())
        .map(|point| point[1])
        .fold(f32::INFINITY, f32::min);
    let fastest = ComplexField::sqrt(
        scenario.entry.speed * scenario.entry.speed
            + 2.0 * GRAVITY_M_S2 * (initial_y - lowest_terrain).max(0.0),
    );
    if fastest * physics_dt >= bike_model.wheel_radius_m {
        return Err(format!(
            "attainable speed {fastest:.3} m/s moves at least one wheel radius ({:.6} m) per substep",
            bike_model.wheel_radius_m
        ));
    }

    let gravity = Vector::new(0.0, -GRAVITY_M_S2);
    let integration_parameters = IntegrationParameters {
        dt: physics_dt,
        ..IntegrationParameters::default()
    };
    let mut island_manager = IslandManager::new();
    let mut broad_phase = BroadPhaseBvh::new();
    let mut narrow_phase = NarrowPhase::new();
    let mut bodies = RigidBodySet::new();
    let mut colliders = ColliderSet::new();
    let mut impulse_joints = ImpulseJointSet::new();
    let mut multibody_joints = MultibodyJointSet::new();
    let mut ccd_solver = CCDSolver::new();
    let mut pipeline = PhysicsPipeline::new();
    let surface_hooks = insert_terrain_colliders(&terrain, &mut colliders);

    let bike_handle = bodies.insert(
        RigidBodyBuilder::dynamic()
            .translation(Vector::new(scenario.entry.start_x, initial_y))
            .linvel(Vector::new(scenario.entry.speed, 0.0))
            .additional_mass_properties(MassProperties::new(
                to_vector(bike_local_com),
                bike_mass_properties.total_mass,
                bike_mass_properties.planar_inertia,
            ))
            .ccd_enabled(bike_model.ccd_enabled)
            .can_sleep(false)
            .build(),
    );
    let mut wheel_handles = Vec::with_capacity(2);
    for axle in [bike_model.rear_axle, bike_model.front_axle] {
        let wheel = ColliderBuilder::ball(bike_model.wheel_radius_m)
            .translation(Vector::new(axle.x, axle.y))
            .friction(0.0)
            .restitution(0.0)
            .density(0.0)
            .build();
        wheel_handles.push(colliders.insert_with_parent(wheel, bike_handle, &mut bodies));
    }
    let (rear_handle, front_handle) = (wheel_handles[0], wheel_handles[1]);

    let mut s = scenario.entry.start_x;
    let (mut authored, mut authored_hip) =
        authored_target(clip, s, rider_spec, &contacts, spine_reference);
    let mut target = authored;
    let rider_handle = bodies.insert(
        RigidBodyBuilder::dynamic()
            .translation(Vector::new(
                scenario.entry.start_x + target.com.x,
                initial_y + target.com.y,
            ))
            .rotation(target.angle)
            .linvel(Vector::new(scenario.entry.speed, 0.0))
            .additional_mass_properties(MassProperties::new(
                Vector::ZERO,
                inertia.rider_mass,
                inertia.rider_inertia,
            ))
            .can_sleep(false)
            .build(),
    );

    let physics_hz = ((1.0 / scenario.solver.dt) * scenario.solver.substeps as f32).round() as u32;
    let output_divisor = (physics_hz / scenario.solver.output_hz).max(1);
    let output_interval = physics_dt * output_divisor as f32;
    let total_steps = (MAX_SOLVE_DURATION_SECONDS * physics_hz as f32).ceil() as u32;
    let terrain_end_x = terrain
        .segments
        .iter()
        .flat_map(|segment| segment.points.iter())
        .map(|point| point[0])
        .fold(f32::NEG_INFINITY, f32::max);

    let mut frames = Vec::new();
    let mut end_reason = EndReason::TimeLimit;
    let mut launched = false;
    let mut last_ground: Option<ContactEvent> = None;
    let mut takeoff: Option<ContactEvent> = None;
    let mut touchdown: Option<ContactEvent> = None;
    let mut crash: Option<CrashEvent> = None;
    let mut instinct_summary = InstinctSummary::default();
    let mut rear_impulse = 0.0f32;
    let mut front_impulse = 0.0f32;
    let mut work = 0.0f32;
    let mut work_positive = 0.0f32;
    let mut work_negative = 0.0f32;
    let mut progress_s = s;
    let mut progress_t = 0.0f32;
    let mut workspace_hip = authored_hip;
    let mut instinct_offset = 0.0f32;
    let mut instinct_angle = 0.0f32;
    let mut instinct_goal = (0.0f32, 0.0f32);
    let mut instinct_saturated = false;
    let mut instinct_hold = false;

    for step in 0..total_steps {
        let t_before = step as f32 * physics_dt;
        let in_flight = launched && touchdown.is_none();

        let (bike_before, rider_com_before, rider_angle_before, command, stop_force) = {
            let bike = &bodies[bike_handle];
            let rider = &bodies[rider_handle];
            s = s.max(bike.translation().x);
            let state = relative_state(bike, bike_local_com, rider);

            if instinct.enabled && in_flight && !instinct_hold && step % INSTINCT_REPLAN_STEPS == 0
            {
                let flight = FlightState {
                    bike: body_state(bike, bike_local_com),
                    rider: body_state(rider, Point2::default()),
                    bike_origin: to_point(bike.translation()),
                    relative: state,
                    bike_local_com,
                    s,
                    inertia: &inertia,
                };
                match plan_instinct(
                    &flight,
                    instinct,
                    &terrain,
                    clip,
                    rider_spec,
                    &contacts,
                    spine_reference,
                ) {
                    Some((offset, angle, saturated, remaining)) => {
                        instinct_goal = (offset, angle);
                        instinct_saturated = saturated;
                        instinct_hold = remaining <= INSTINCT_HOLD_BEFORE_TOUCHDOWN_S;
                    }
                    None => {
                        instinct_goal = (0.0, 0.0);
                        instinct_saturated = false;
                    }
                }
            }
            if !in_flight {
                instinct_goal = (0.0, 0.0);
                instinct_saturated = false;
            }
            let blend = (physics_dt / INSTINCT_TIME_CONSTANT_S).min(1.0);
            instinct_offset += (instinct_goal.0 - instinct_offset) * blend;
            instinct_angle += (instinct_goal.1 - instinct_angle) * blend;

            let (next_authored, next_hip) =
                authored_target(clip, s, rider_spec, &contacts, spine_reference);
            authored = next_authored;
            authored_hip = next_hip;
            let next_target = RiderTarget {
                com: Point2::new(authored.com.x + instinct_offset, authored.com.y),
                angle: authored.angle + instinct_angle,
            };
            let (target_velocity, target_angular_velocity) = if step == 0 {
                (Point2::default(), 0.0)
            } else {
                (
                    Point2::new(
                        (next_target.com.x - target.com.x) / physics_dt,
                        (next_target.com.y - target.com.y) / physics_dt,
                    ),
                    (next_target.angle - target.angle) / physics_dt,
                )
            };
            target = next_target;

            let command = coupling_command(
                &gains,
                &inertia,
                &state,
                &target,
                target_velocity,
                target_angular_velocity,
                physics_dt,
            );
            let reachable = reconstruct_skeleton_within(
                rider_spec,
                &contacts,
                state.com,
                state.angle,
                spine_reference,
                workspace_hip,
                WORKSPACE_ITERATIONS,
            );
            workspace_hip = reachable.landmarks.hip;
            let stop_force = if reachable.projected {
                workspace_force(&inertia, &state, reachable.com, physics_dt)
            } else {
                Point2::default()
            };
            (
                *bike.position(),
                to_point(rider.translation()),
                rider.rotation().angle(),
                command,
                stop_force,
            )
        };

        if in_flight {
            instinct_summary.peak_angle = instinct_summary.peak_angle.max(instinct_angle.abs());
            instinct_summary.peak_offset = instinct_summary.peak_offset.max(instinct_offset.abs());
            if instinct_saturated {
                instinct_summary.saturated_seconds += physics_dt;
            }
            let angle_share = if instinct.max_angle > 0.0 {
                instinct_angle.abs() / instinct.max_angle
            } else {
                0.0
            };
            let offset_share = if instinct.max_offset > 0.0 {
                instinct_offset.abs() / instinct.max_offset
            } else {
                0.0
            };
            instinct_summary.effort += (angle_share + offset_share) * physics_dt;
        }

        let bike_angle_before = bike_before.rotation.angle();
        let force_world = rotate(
            Point2::new(
                command.force_local.x + stop_force.x,
                command.force_local.y + stop_force.y,
            ),
            bike_angle_before,
        );
        {
            let rider = &mut bodies[rider_handle];
            rider.reset_forces(false);
            rider.reset_torques(false);
            rider.add_force(to_vector(force_world), true);
            rider.add_torque(command.torque, true);
        }
        {
            let bike = &mut bodies[bike_handle];
            let lever = world_com(bike, bike_local_com);
            let reaction = Point2::new(-force_world.x, -force_world.y);
            bike.reset_forces(false);
            bike.reset_torques(false);
            bike.add_force(to_vector(reaction), true);
            bike.add_torque(
                cross(sub(rider_com_before, lever), reaction) - command.torque,
                true,
            );
        }

        pipeline.step(
            gravity,
            &integration_parameters,
            &mut island_manager,
            &mut broad_phase,
            &mut narrow_phase,
            &mut bodies,
            &mut colliders,
            &mut impulse_joints,
            &mut multibody_joints,
            &mut ccd_solver,
            &surface_hooks,
            &(),
        );

        let t = t_before + physics_dt;
        let bike = &bodies[bike_handle];
        let rider = &bodies[rider_handle];

        // Work done by the internal force pair is the force times the rider's displacement
        // relative to the bicycle material point it acted on, plus torque times relative turn.
        let anchor_local = bike_before.inverse() * to_vector(rider_com_before);
        let anchor_after = to_point(*bike.position() * anchor_local);
        let relative_displacement = sub(to_point(rider.translation()), anchor_after);
        let relative_turn = (rider.rotation().angle() - rider_angle_before)
            - (bike.rotation().angle() - bike_angle_before);
        let step_work = force_world.x * relative_displacement.x
            + force_world.y * relative_displacement.y
            + command.torque * wrap_angle(relative_turn);
        work += step_work;
        if step_work >= 0.0 {
            work_positive += step_work;
        } else {
            work_negative += step_work;
        }

        let step_rear = wheel_contact(&narrow_phase, rear_handle).1;
        let step_front = wheel_contact(&narrow_phase, front_handle).1;
        rear_impulse += step_rear;
        front_impulse += step_front;
        let touching_rear = step_rear > CONTACT_IMPULSE_EPSILON;
        let touching_front = step_front > CONTACT_IMPULSE_EPSILON;

        let rear_center = world_point(bike, bike_model.rear_axle);
        let front_center = world_point(bike, bike_model.front_axle);
        let output_step = (step + 1) % output_divisor == 0;
        // Clearance scans the whole terrain, so only compute it where takeoff detection or an
        // output frame needs it.
        let min_clearance = if output_step || (!launched && !touching_rear && !touching_front) {
            nearest_surface_clearance(&terrain, rear_center, bike_model.wheel_radius_m)
                .unwrap_or(f32::INFINITY)
                .min(
                    nearest_surface_clearance(&terrain, front_center, bike_model.wheel_radius_m)
                        .unwrap_or(f32::INFINITY),
                )
        } else {
            f32::NAN
        };

        let bike_state = body_state(bike, bike_local_com);
        let rider_state = body_state(rider, Point2::default());
        let event = |rear: bool, front: bool| {
            let touching: Vec<f32> = [(rear, rear_center[0]), (front, front_center[0])]
                .iter()
                .filter(|(touching, _)| *touching)
                .map(|(_, x)| *x)
                .collect();
            ContactEvent {
                t,
                bike_origin: to_point(bike.translation()),
                pitch: bike_state.angle,
                pitch_rate: bike_state.angular_velocity,
                system_velocity: system_velocity(&bike_state, &rider_state, &inertia),
                rear,
                front,
                contact_x: if touching.is_empty() {
                    0.5 * (rear_center[0] + front_center[0])
                } else {
                    touching.iter().sum::<f32>() / touching.len() as f32
                },
            }
        };
        if !launched {
            if touching_rear || touching_front {
                last_ground = Some(event(touching_rear, touching_front));
            } else if min_clearance > TAKEOFF_CLEARANCE_M {
                launched = true;
                takeoff = last_ground;
            }
        } else if touchdown.is_none() && (touching_rear || touching_front) {
            touchdown = Some(event(touching_rear, touching_front));
        }

        if !output_step {
            continue;
        }

        let grounded_rear = rear_impulse > CONTACT_IMPULSE_EPSILON;
        let grounded_front = front_impulse > CONTACT_IMPULSE_EPSILON;
        let relative = relative_state(bike, bike_local_com, rider);
        let (bike_linear, bike_angular) =
            momentum(&bike_state, inertia.bike_mass, inertia.bike_inertia);
        let (rider_linear, rider_angular) =
            momentum(&rider_state, inertia.rider_mass, inertia.rider_inertia);
        let skeleton = reconstruct_skeleton(
            rider_spec,
            &contacts,
            relative.com,
            relative.angle,
            spine_reference,
            authored_hip,
        );
        let origin = to_point(bike.translation());

        if crash.is_none() {
            let landmarks = &skeleton.landmarks;
            let touching_part = CRASH_PARTS
                .iter()
                .zip([
                    landmarks.head,
                    landmarks.shoulder,
                    landmarks.hip,
                    landmarks.elbow,
                    landmarks.knee,
                ])
                .find_map(|(part, local)| {
                    let world = rotate(local, bike_state.angle);
                    let x = origin.x + world.x;
                    let y = origin.y + world.y;
                    terrain_height_at(&terrain, x)
                        .is_some_and(|ground| y <= ground)
                        .then_some(*part)
                });
            let inverted = terrain_slope_angle_at(&terrain, origin.x).is_some_and(|slope| {
                wrap_angle(bike_state.angle - slope).abs() > core::f32::consts::FRAC_PI_2
            });
            crash = match (touching_part, inverted) {
                (Some(part), _) => Some(CrashEvent {
                    t,
                    reason: CrashReason::RiderTerrainContact { part },
                }),
                (None, true) => Some(CrashEvent {
                    t,
                    reason: CrashReason::Inverted,
                }),
                (None, false) => None,
            };
        }

        frames.push(SimFrame {
            t,
            s,
            bike_origin: origin,
            bike: bike_state,
            rider: rider_state,
            relative,
            authored_target: authored,
            target,
            instinct_offset,
            instinct_angle,
            instinct_saturated,
            command,
            workspace_force: stop_force,
            airborne: !grounded_rear && !grounded_front,
            grounded_rear,
            grounded_front,
            normal_force_rear: if grounded_rear {
                rear_impulse / output_interval
            } else {
                0.0
            },
            normal_force_front: if grounded_front {
                front_impulse / output_interval
            } else {
                0.0
            },
            contact_impulse: if grounded_rear { rear_impulse } else { 0.0 }
                + if grounded_front { front_impulse } else { 0.0 },
            min_clearance,
            energy: mechanical_energy(&bike_state, inertia.bike_mass, inertia.bike_inertia)
                + mechanical_energy(&rider_state, inertia.rider_mass, inertia.rider_inertia),
            actuator_work: work,
            actuator_work_positive: work_positive,
            actuator_work_negative: work_negative,
            linear_momentum: Point2::new(
                bike_linear.x + rider_linear.x,
                bike_linear.y + rider_linear.y,
            ),
            angular_momentum: bike_angular + rider_angular,
            crashed: crash.is_some(),
            skeleton,
        });
        rear_impulse = 0.0;
        front_impulse = 0.0;

        if s > progress_s + STALL_MIN_PROGRESS_M {
            progress_s = s;
            progress_t = t;
        } else if t - progress_t >= STALL_WINDOW_SECONDS {
            end_reason = EndReason::Stalled;
            break;
        }
        if touchdown.is_some_and(|landed| t - landed.t >= POST_LANDING_FOLLOW_SECONDS) {
            end_reason = EndReason::PostLandingWindow;
            break;
        }
        if front_center[0] >= terrain_end_x {
            end_reason = EndReason::TerrainEnd;
            break;
        }
    }

    Ok(Simulation {
        frames,
        end_reason,
        terrain,
        inertia,
        gains,
        spine_reference,
        physics_hz,
        output_hz: scenario.solver.output_hz,
        takeoff,
        touchdown,
        crash,
        instinct: instinct_summary,
    })
}
