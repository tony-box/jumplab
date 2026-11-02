//! Two-body bicycle and rider simulation.
//!
//! Entry speed is applied once at the start of the approach; afterwards only gravity, terrain
//! contact, and the internal rider actuator change the motion. See `rider_dynamics` for the
//! coupling contract.

use rapier2d::na::ComplexField;
use rapier2d::prelude::*;

use crate::bike::{build_bike_model, rider_mass_properties};
use crate::geometry::{
    Point2, TerrainProfile, bike_contact_points, generate_terrain_profile, inspect_bike_geometry,
    nearest_surface_clearance, terrain_height_at,
};
use crate::pose::sample_pose_with_contacts;
use crate::rider_dynamics::{
    CoupledInertia, CouplingCommand, CouplingGains, Reconstruction, RelativeState, RiderTarget,
    coupling_command, reconstruct_skeleton, reconstruct_skeleton_within, rider_target,
    workspace_force,
};
use crate::scenario::Scenario;
use crate::solver::{
    CONTACT_IMPULSE_EPSILON, MAX_SOLVE_DURATION_SECONDS, POST_LANDING_FOLLOW_SECONDS,
    TAKEOFF_CLEARANCE_M, insert_terrain_colliders, wheel_contact, world_point,
};

pub const GRAVITY_M_S2: f32 = 9.81;
/// A run has stalled when the pose distance advances less than this over the window below.
pub const STALL_MIN_PROGRESS_M: f32 = 0.05;
pub const STALL_WINDOW_SECONDS: f32 = 1.0;
/// Warm-started hip iterations per step when checking the reachable workspace.
const WORKSPACE_ITERATIONS: usize = 3;

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
    pub target: RiderTarget,
    pub command: CouplingCommand,
    /// Skeletal stop force on the rider (bicycle-local) once past the reachable workspace.
    pub workspace_force: Point2,
    pub airborne: bool,
    pub grounded_rear: bool,
    pub grounded_front: bool,
    pub normal_force_rear: f32,
    pub normal_force_front: f32,
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
    pub skeleton: Option<Reconstruction>,
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
}

#[derive(Debug, Clone, Default)]
pub struct SimulationOptions {
    pub gains: Option<CouplingGains>,
    /// Rebuild the achieved skeleton on every output frame.
    pub reconstruct: bool,
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
    let offset = Point2::new(rider_com.x - origin.x, rider_com.y - origin.y);
    let carried = velocity_at(bike, bike_local_com, rider_com);
    let rider_velocity = to_point(rider.linvel());
    RelativeState {
        com: rotate(offset, -bike_angle),
        velocity: rotate(
            Point2::new(rider_velocity.x - carried.x, rider_velocity.y - carried.y),
            -bike_angle,
        ),
        angle: crate::pose::wrap_angle(rider.rotation().angle() - bike_angle),
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

pub fn simulate(scenario: &Scenario, options: &SimulationOptions) -> Result<Simulation, String> {
    scenario.validate()?;

    let terrain = generate_terrain_profile(scenario, 0.05);
    let bike_model = build_bike_model(&scenario.bike, &scenario.rider, scenario.solver.ccd);
    let bike_mass_properties = inspect_bike_geometry(&scenario.bike).mass_properties;
    let contacts = bike_contact_points(&scenario.bike);
    let bike_local_com = bike_mass_properties.center_of_gravity;
    let rider_spec = &scenario.rider;
    let gains = options
        .gains
        .unwrap_or_else(|| CouplingGains::representative(rider_spec));

    let reference = sample_pose_with_contacts(
        &scenario.pose_clip,
        scenario.pose_clip.keys[0].s,
        rider_spec,
        &contacts,
    );
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
    let landing_hooks = insert_terrain_colliders(&terrain, &mut colliders);

    let bike_handle = bodies.insert(
        RigidBodyBuilder::dynamic()
            .translation(Vector::new(scenario.entry.start_x, initial_y))
            .linvel(Vector::new(scenario.entry.speed, 0.0))
            .additional_mass_properties(MassProperties::new(
                Vector::new(
                    bike_mass_properties.center_of_gravity.x,
                    bike_mass_properties.center_of_gravity.y,
                ),
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
    let initial_sample = sample_pose_with_contacts(&scenario.pose_clip, s, rider_spec, &contacts);
    let mut target = rider_target(
        rider_spec,
        &initial_sample.landmarks,
        initial_sample.targets.spine,
        spine_reference,
    );
    let mut target_hip;
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
    let mut touchdown_t: Option<f32> = None;
    let mut rear_impulse = 0.0f32;
    let mut front_impulse = 0.0f32;
    let mut work = 0.0f32;
    let mut work_positive = 0.0f32;
    let mut work_negative = 0.0f32;
    let mut progress_s = s;
    let mut progress_t = 0.0f32;
    let mut command;
    let mut stop_force;
    let mut workspace_hip = initial_sample.landmarks.hip;

    for step in 0..total_steps {
        let (bike_before, rider_com_before, rider_angle_before) = {
            let bike = &bodies[bike_handle];
            s = s.max(bike.translation().x);
            let sample = sample_pose_with_contacts(&scenario.pose_clip, s, rider_spec, &contacts);
            let next_target = rider_target(
                rider_spec,
                &sample.landmarks,
                sample.targets.spine,
                spine_reference,
            );
            let target_velocity = Point2::new(
                (next_target.com.x - target.com.x) / physics_dt,
                (next_target.com.y - target.com.y) / physics_dt,
            );
            let target_angular_velocity = (next_target.angle - target.angle) / physics_dt;
            target = next_target;
            target_hip = sample.landmarks.hip;

            let rider = &bodies[rider_handle];
            let state = relative_state(bike, bike_local_com, rider);
            command = coupling_command(
                &gains,
                &inertia,
                &state,
                &target,
                if step == 0 {
                    Point2::default()
                } else {
                    target_velocity
                },
                if step == 0 {
                    0.0
                } else {
                    target_angular_velocity
                },
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
            stop_force = if reachable.projected {
                workspace_force(&inertia, &state, reachable.com, physics_dt)
            } else {
                Point2::default()
            };
            (
                *bike.position(),
                to_point(rider.translation()),
                rider.rotation().angle(),
            )
        };

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
            let arm = Point2::new(rider_com_before.x - lever.x, rider_com_before.y - lever.y);
            bike.reset_forces(false);
            bike.reset_torques(false);
            bike.add_force(to_vector(reaction), true);
            bike.add_torque(cross(arm, reaction) - command.torque, true);
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
            &landing_hooks,
            &(),
        );

        let bike = &bodies[bike_handle];
        let rider = &bodies[rider_handle];

        // Work done by the internal force pair is the force times the rider's displacement
        // relative to the bicycle material point it acted on, plus torque times relative turn.
        let anchor_local = bike_before.inverse() * to_vector(rider_com_before);
        let anchor_after = to_point(*bike.position() * anchor_local);
        let rider_com_after = to_point(rider.translation());
        let relative_displacement = Point2::new(
            rider_com_after.x - anchor_after.x,
            rider_com_after.y - anchor_after.y,
        );
        let relative_turn = (rider.rotation().angle() - rider_angle_before)
            - (bike.rotation().angle() - bike_angle_before);
        let step_work = force_world.x * relative_displacement.x
            + force_world.y * relative_displacement.y
            + command.torque * crate::pose::wrap_angle(relative_turn);
        work += step_work;
        if step_work >= 0.0 {
            work_positive += step_work;
        } else {
            work_negative += step_work;
        }

        rear_impulse += wheel_contact(&narrow_phase, rear_handle).1;
        front_impulse += wheel_contact(&narrow_phase, front_handle).1;

        if (step + 1) % output_divisor != 0 {
            continue;
        }

        let t = (step + 1) as f32 / physics_hz as f32;
        let rear_center = world_point(bike, bike_model.rear_axle);
        let front_center = world_point(bike, bike_model.front_axle);
        let min_clearance =
            nearest_surface_clearance(&terrain, rear_center, bike_model.wheel_radius_m)
                .unwrap_or(f32::INFINITY)
                .min(
                    nearest_surface_clearance(&terrain, front_center, bike_model.wheel_radius_m)
                        .unwrap_or(f32::INFINITY),
                );
        let grounded_rear = rear_impulse > CONTACT_IMPULSE_EPSILON;
        let grounded_front = front_impulse > CONTACT_IMPULSE_EPSILON;
        let airborne = !grounded_rear && !grounded_front;
        let interval = physics_dt * output_divisor as f32;
        launched |= airborne && min_clearance > TAKEOFF_CLEARANCE_M;
        if touchdown_t.is_none() && launched && !airborne {
            touchdown_t = Some(t);
        }

        let bike_state = body_state(bike, bike_local_com);
        let rider_state = body_state(rider, Point2::default());
        let relative = relative_state(bike, bike_local_com, rider);
        let (bike_linear, bike_angular) =
            momentum(&bike_state, inertia.bike_mass, inertia.bike_inertia);
        let (rider_linear, rider_angular) =
            momentum(&rider_state, inertia.rider_mass, inertia.rider_inertia);
        let skeleton = options.reconstruct.then(|| {
            reconstruct_skeleton(
                rider_spec,
                &contacts,
                relative.com,
                relative.angle,
                spine_reference,
                target_hip,
            )
        });

        frames.push(SimFrame {
            t,
            s,
            bike_origin: to_point(bike.translation()),
            bike: bike_state,
            rider: rider_state,
            relative,
            target,
            command,
            workspace_force: stop_force,
            airborne,
            grounded_rear,
            grounded_front,
            normal_force_rear: if grounded_rear {
                rear_impulse / interval
            } else {
                0.0
            },
            normal_force_front: if grounded_front {
                front_impulse / interval
            } else {
                0.0
            },
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
        if touchdown_t.is_some_and(|landed| t - landed >= POST_LANDING_FOLLOW_SECONDS) {
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
    })
}
