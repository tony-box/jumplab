use std::collections::BTreeMap;

use rapier2d::na::ComplexField;
use rapier2d::prelude::*;
use sha2::{Digest, Sha256};

use crate::bike::{build_bike_model, combine_bike_and_rider_mass_properties};
use crate::geometry::{
    Point2, TerrainProfile, generate_terrain_profile, inspect_bike_geometry,
    nearest_surface_clearance, terrain_height_at,
};
use crate::pose::{AchievedPoseLandmarks, sample_pose, validate_design};
use crate::scenario::Scenario;
use crate::telemetry::{MetricValue, build_metrics};

/// Number of `f32` values written per frame: the original 10 measured fields,
/// the 3 achieved leg/spine targets, and 9 landmark points (18 values). There
/// is no ankle joint target: the foot is rigidly planted on the pedal.
pub const FRAME_STRIDE_FLOAT32: usize = 36;

/// Filters zero-impulse manifolds while remaining four orders of magnitude below
/// the canonical system's per-substep static support impulse.
pub const CONTACT_IMPULSE_EPSILON: f32 = 1.0e-5;
/// A run follows the rider until this long after touchdown, or the hard cap below, whichever
/// comes first.
pub const POST_LANDING_FOLLOW_SECONDS: f32 = 3.0;
pub const MAX_SOLVE_DURATION_SECONDS: f32 = 10.0;
/// Clearance that separates real flight from the sub-millimetre gaps a wheel shows while rolling
/// over a faceted convex crest.
pub const TAKEOFF_CLEARANCE_M: f32 = 0.05;

struct LandingContactHooks {
    collider: ColliderHandle,
    start_x: f32,
    end_x: f32,
    start_y: f32,
    control_1_y: f32,
    control_2_y: f32,
    end_y: f32,
}

impl PhysicsHooks for LandingContactHooks {
    fn modify_solver_contacts(&self, context: &mut ContactModificationContext) {
        let ground_is_first = context.collider1 == self.collider;
        if !ground_is_first && context.collider2 != self.collider {
            return;
        }
        let Some(contact) = context.solver_contacts.first() else {
            return;
        };
        let contact_x = if ground_is_first {
            contact.anchor1.x
        } else {
            contact.anchor2.x
        };
        let slope = if contact_x >= self.end_x {
            0.0
        } else {
            let t = ((contact_x - self.start_x) / (self.end_x - self.start_x)).clamp(0.0, 1.0);
            let inverse = 1.0 - t;
            let derivative = 3.0
                * (inverse.powi(2) * (self.control_1_y - self.start_y)
                    + 2.0 * inverse * t * (self.control_2_y - self.control_1_y)
                    + t.powi(2) * (self.end_y - self.control_2_y));
            derivative / (self.end_x - self.start_x)
        };
        let upward = Vector::new(-slope, 1.0).normalize();
        *context.normal = if ground_is_first { upward } else { -upward };
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SolverInvariants {
    pub aero_drag_coefficient: f32,
    pub contact_friction_coefficient: f32,
    pub unmodeled_linear_damping: f32,
    pub unmodeled_angular_damping: f32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Frame {
    pub t: f32,
    pub x: f32,
    pub y: f32,
    pub pitch: f32,
    pub vx: f32,
    pub vy: f32,
    pub airborne: bool,
    pub contact_impulse: f32,
    pub shoulder: f32,
    pub elbow: f32,
    pub knee: f32,
    pub hip: f32,
    pub spine: f32,
    pub grounded_rear: bool,
    pub grounded_front: bool,
    pub normal_force_rear: f32,
    pub normal_force_front: f32,
    pub min_clearance: f32,
    #[serde(skip)]
    pub landmarks: AchievedPoseLandmarks,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct SolveSummary {
    pub takeoff_x: f32,
    pub max_height: f32,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct PhaseInterval {
    pub name: String,
    pub start_frame: usize,
    pub end_frame: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SolveOutput {
    pub run_id: String,
    pub scenario_hash: String,
    pub solver_version: String,
    pub output_hz: u32,
    pub stride_float32: usize,
    pub frames: Vec<Frame>,
    pub frame_buffer: Vec<f32>,
    pub telemetry_buffer: Vec<f32>,
    pub phases: Vec<PhaseInterval>,
    pub metrics: BTreeMap<String, MetricValue>,
    pub summary: SolveSummary,
    pub result_hash: String,
}

pub fn solver_invariants() -> SolverInvariants {
    SolverInvariants {
        aero_drag_coefficient: 0.0,
        contact_friction_coefficient: 0.0,
        unmodeled_linear_damping: 0.0,
        unmodeled_angular_damping: 0.0,
    }
}

fn wheel_contact(narrow_phase: &NarrowPhase, collider: ColliderHandle) -> (bool, f32) {
    narrow_phase
        .contact_pairs_with(collider)
        .fold((false, 0.0), |(touching, impulse), pair| {
            (
                touching || pair.has_any_active_contact(),
                impulse + pair.total_impulse_magnitude().max(0.0),
            )
        })
}

fn world_point(body: &RigidBody, local: Point2) -> [f32; 2] {
    let point = body.position() * Vector::new(local.x, local.y);
    [point.x, point.y]
}

fn simplify_collinear_points(points: Vec<[f32; 2]>) -> Vec<[f32; 2]> {
    let mut simplified: Vec<[f32; 2]> = Vec::with_capacity(points.len());
    for point in points {
        if simplified.len() >= 2 {
            let left = simplified[simplified.len() - 2];
            let middle = simplified[simplified.len() - 1];
            let cross = (middle[0] - left[0]) * (point[1] - middle[1])
                - (middle[1] - left[1]) * (point[0] - middle[0]);
            if cross == 0.0 {
                simplified.pop();
            }
        }
        simplified.push(point);
    }
    simplified
}

fn points_are_collinear(points: &[[f32; 2]]) -> bool {
    let Some(([first, second], remaining)) = points.split_first_chunk::<2>() else {
        return true;
    };
    remaining.iter().all(|point| {
        let cross = (second[0] - first[0]) * (point[1] - second[1])
            - (second[1] - first[1]) * (point[0] - second[0]);
        cross == 0.0
    })
}

fn terrain_collider_polylines(profile: &TerrainProfile) -> Vec<Vec<Vector>> {
    let mut riding_surfaces: Vec<Vec<[f32; 2]>> = Vec::new();
    let mut landing_faces: Vec<Vec<[f32; 2]>> = Vec::new();

    for segment in &profile.segments {
        if segment.kind == "landing-face" {
            landing_faces.push(segment.points.clone());
            continue;
        }
        if segment.kind == "landing-rollout" {
            continue;
        }

        let connects = riding_surfaces
            .last()
            .and_then(|points| points.last())
            .zip(segment.points.first())
            .is_some_and(|(left, right)| {
                (left[0] - right[0]).abs() <= 1.0e-6 && (left[1] - right[1]).abs() <= 1.0e-6
            })
            && riding_surfaces.last().is_some_and(|points| {
                let mut combined = points.clone();
                combined.extend_from_slice(&segment.points[1..]);
                points_are_collinear(&combined)
            });
        if connects {
            if let Some(points) = riding_surfaces.last_mut() {
                points.extend_from_slice(&segment.points[1..]);
            }
        } else {
            riding_surfaces.push(segment.points.clone());
        }
    }

    riding_surfaces
        .into_iter()
        .chain(landing_faces)
        .map(|points| {
            simplify_collinear_points(points)
                .into_iter()
                .map(|[x, y]| Vector::new(x, y))
                .collect()
        })
        .collect()
}

/// Airborne frames belonging to an interval that reaches real flight clearance. Brief grazes over
/// a faceted crest stay part of ground contact so they cannot fabricate a takeoff phase.
fn flight_mask(frames: &[Frame]) -> Vec<bool> {
    let mut mask = vec![false; frames.len()];
    let mut start: Option<usize> = None;

    for (index, frame) in frames.iter().enumerate() {
        match (frame.airborne, start) {
            (true, None) => start = Some(index),
            (false, Some(begin)) => {
                if frames[begin..index]
                    .iter()
                    .any(|candidate| candidate.min_clearance > TAKEOFF_CLEARANCE_M)
                {
                    mask[begin..index].fill(true);
                }
                start = None;
            }
            _ => {}
        }
    }

    if let Some(begin) = start
        && frames[begin..]
            .iter()
            .any(|candidate| candidate.min_clearance > TAKEOFF_CLEARANCE_M)
    {
        mask[begin..].fill(true);
    }

    mask
}

fn build_contact_phases(frames: &[Frame], landing_end_x: f32) -> Vec<PhaseInterval> {
    if frames.is_empty() {
        return Vec::new();
    }

    let flight = flight_mask(frames);

    let Some(takeoff) = flight
        .windows(2)
        .position(|pair| !pair[0] && pair[1])
        .map(|index| index + 1)
    else {
        return vec![PhaseInterval {
            name: "approach".to_string(),
            start_frame: 0,
            end_frame: frames.len() - 1,
        }];
    };

    let landing = flight
        .windows(2)
        .enumerate()
        .skip(takeoff)
        .find_map(|(index, pair)| (pair[0] && !pair[1]).then_some(index + 1));
    let mut phases = vec![PhaseInterval {
        name: "approach".to_string(),
        start_frame: 0,
        end_frame: takeoff - 1,
    }];
    phases.push(PhaseInterval {
        name: "takeoff".to_string(),
        start_frame: takeoff,
        end_frame: takeoff,
    });
    let flight_end = landing.unwrap_or(frames.len()).saturating_sub(1);
    if flight_end > takeoff {
        phases.push(PhaseInterval {
            name: "flight".to_string(),
            start_frame: takeoff + 1,
            end_frame: flight_end,
        });
    }
    if let Some(landing) = landing {
        phases.push(PhaseInterval {
            name: "landing".to_string(),
            start_frame: landing,
            end_frame: landing,
        });
        // Rollout begins after the landing event once the bike reaches the end
        // of the sloped landing geometry, independent of later contact bounces.
        if let Some(rollout) = frames
            .iter()
            .enumerate()
            .skip(landing + 1)
            .find_map(|(index, frame)| (frame.x >= landing_end_x).then_some(index))
        {
            phases.push(PhaseInterval {
                name: "rollout".to_string(),
                start_frame: rollout,
                end_frame: frames.len() - 1,
            });
        }
    }
    phases
}

pub fn solve_scenario(scenario: &Scenario, run_id: &str) -> Result<SolveOutput, String> {
    scenario.validate()?;
    if !validate_design(scenario)?.can_solve {
        return Err("design-invalid".to_string());
    }

    let scenario_hash = scenario.canonical_hash()?;
    let terrain = generate_terrain_profile(scenario, 0.05);
    let bike_model = build_bike_model(&scenario.bike, &scenario.rider, scenario.solver.ccd);

    let gravity = Vector::new(0.0, -9.81f32);
    let integration_parameters = IntegrationParameters {
        dt: scenario.solver.dt / scenario.solver.substeps as f32,
        ..IntegrationParameters::default()
    };
    let substep_displacement = scenario.entry.speed * integration_parameters.dt;
    if substep_displacement >= bike_model.wheel_radius_m {
        return Err(format!(
            "entry speed and solver step move {substep_displacement:.6} m per substep, which must be below wheel radius {:.6} m",
            bike_model.wheel_radius_m
        ));
    }

    let mut island_manager = IslandManager::new();
    let mut broad_phase = BroadPhaseBvh::new();
    let mut narrow_phase = NarrowPhase::new();
    let mut rigid_body_set = RigidBodySet::new();
    let mut collider_set = ColliderSet::new();
    let mut impulse_joint_set = ImpulseJointSet::new();
    let mut multibody_joint_set = MultibodyJointSet::new();
    let mut ccd_solver = CCDSolver::new();
    let mut physics_pipeline = PhysicsPipeline::new();

    for points in terrain_collider_polylines(&terrain) {
        let ground = ColliderBuilder::polyline(points, None)
            .friction(0.0)
            .restitution(0.0)
            .build();
        collider_set.insert(ground);
    }
    let landing = terrain
        .segments
        .iter()
        .find(|segment| segment.kind == "landing-rollout")
        .ok_or_else(|| "landing-rollout terrain is missing".to_string())?;
    let landing_collider = collider_set.insert(
        ColliderBuilder::polyline(
            landing
                .points
                .iter()
                .map(|point| Vector::new(point[0], point[1]))
                .collect(),
            None,
        )
        .active_hooks(ActiveHooks::MODIFY_SOLVER_CONTACTS)
        .friction(0.0)
        .restitution(0.0)
        .build(),
    );
    let landing_end = landing.points[landing.points.len() - 2];
    let landing_tangent = libm::tanf(scenario.jump.landing_angle);
    let landing_hooks = LandingContactHooks {
        collider: landing_collider,
        start_x: landing.points[0][0],
        end_x: landing_end[0],
        start_y: landing.points[0][1],
        control_1_y: landing.points[0][1] - landing_tangent * scenario.jump.landing_length / 3.0,
        control_2_y: landing_end[1],
        end_y: landing_end[1],
    };

    let initial_y = terrain_height_at(&terrain, scenario.entry.start_x)
        .ok_or_else(|| "entry.startX is not supported by terrain".to_string())?;
    let bike_mass_properties = inspect_bike_geometry(&scenario.bike).mass_properties;
    let initial_pose = sample_pose(
        &scenario.pose_clip,
        scenario.entry.start_x,
        &scenario.rider,
        &scenario.bike,
    );
    let initial_mass_properties = combine_bike_and_rider_mass_properties(
        bike_mass_properties,
        &scenario.rider,
        &initial_pose.landmarks,
    );
    let bike = RigidBodyBuilder::dynamic()
        .translation(Vector::new(scenario.entry.start_x, initial_y))
        .linvel(Vector::new(scenario.entry.speed, 0.0))
        .additional_mass_properties(MassProperties::new(
            Vector::new(
                initial_mass_properties.center_of_gravity.x,
                initial_mass_properties.center_of_gravity.y,
            ),
            initial_mass_properties.total_mass,
            initial_mass_properties.planar_inertia,
        ))
        .linear_damping(0.0)
        .angular_damping(0.0)
        .ccd_enabled(bike_model.ccd_enabled)
        .can_sleep(false)
        .build();
    let bike_handle = rigid_body_set.insert(bike);
    let rear_collider = ColliderBuilder::ball(bike_model.wheel_radius_m)
        .translation(Vector::new(bike_model.rear_axle.x, bike_model.rear_axle.y))
        .friction(0.0)
        .restitution(0.0)
        .density(0.0)
        .build();
    let rear_handle =
        collider_set.insert_with_parent(rear_collider, bike_handle, &mut rigid_body_set);
    let front_collider = ColliderBuilder::ball(bike_model.wheel_radius_m)
        .translation(Vector::new(
            bike_model.front_axle.x,
            bike_model.front_axle.y,
        ))
        .friction(0.0)
        .restitution(0.0)
        .density(0.0)
        .build();
    let front_handle =
        collider_set.insert_with_parent(front_collider, bike_handle, &mut rigid_body_set);

    let physics_frequency =
        ((1.0 / scenario.solver.dt) * scenario.solver.substeps as f32).round() as u32;
    let output_divisor = (physics_frequency / scenario.solver.output_hz).max(1);
    let landing_end_x = terrain.landing_start_x + scenario.jump.landing_length;
    let total_steps = (MAX_SOLVE_DURATION_SECONDS * physics_frequency as f32).ceil() as u32;
    let terrain_end_x = terrain
        .segments
        .iter()
        .flat_map(|segment| segment.points.iter())
        .map(|point| point[0])
        .fold(f32::NEG_INFINITY, f32::max);

    let mut frames: Vec<Frame> = Vec::new();
    let mut frame_buffer: Vec<f32> = Vec::new();
    let mut telemetry_buffer: Vec<f32> = Vec::new();

    let mut takeoff_x = scenario.entry.start_x;
    let mut launched = false;
    let mut touchdown_t: Option<f32> = None;
    let mut max_height = initial_y;
    let mut cumulative_motor_work = 0.0f32;
    let mut touching_rear = false;
    let mut touching_front = false;
    let mut accumulated_rear_impulse = 0.0f32;
    let mut accumulated_front_impulse = 0.0f32;

    for step in 0..total_steps {
        if let Some(body) = rigid_body_set.get_mut(bike_handle) {
            let current = body.linvel();
            body.set_linvel(Vector::new(scenario.entry.speed, current.y), true);
            let pose = sample_pose(
                &scenario.pose_clip,
                body.translation().x,
                &scenario.rider,
                &scenario.bike,
            );
            let mass_properties = combine_bike_and_rider_mass_properties(
                bike_mass_properties,
                &scenario.rider,
                &pose.landmarks,
            );
            body.set_additional_mass_properties(
                MassProperties::new(
                    Vector::new(
                        mass_properties.center_of_gravity.x,
                        mass_properties.center_of_gravity.y,
                    ),
                    mass_properties.total_mass,
                    mass_properties.planar_inertia,
                ),
                false,
            );
        }

        physics_pipeline.step(
            gravity,
            &integration_parameters,
            &mut island_manager,
            &mut broad_phase,
            &mut narrow_phase,
            &mut rigid_body_set,
            &mut collider_set,
            &mut impulse_joint_set,
            &mut multibody_joint_set,
            &mut ccd_solver,
            &landing_hooks,
            &(),
        );

        let body = rigid_body_set
            .get(bike_handle)
            .ok_or_else(|| "bike body missing".to_string())?;

        let pos = body.translation();
        let vel = body.linvel();
        let rear_contact = wheel_contact(&narrow_phase, rear_handle);
        let front_contact = wheel_contact(&narrow_phase, front_handle);
        touching_rear |= rear_contact.0;
        touching_front |= front_contact.0;
        accumulated_rear_impulse += rear_contact.1;
        accumulated_front_impulse += front_contact.1;

        let rear_center = world_point(body, bike_model.rear_axle);
        let front_center = world_point(body, bike_model.front_axle);
        let rear_clearance =
            nearest_surface_clearance(&terrain, rear_center, bike_model.wheel_radius_m)
                .unwrap_or(f32::INFINITY);
        let front_clearance =
            nearest_surface_clearance(&terrain, front_center, bike_model.wheel_radius_m)
                .unwrap_or(f32::INFINITY);
        let min_clearance = rear_clearance.min(front_clearance);

        max_height = max_height.max(pos.y);

        if step % output_divisor == 0 {
            let t = step as f32 / physics_frequency as f32;
            let grounded_rear = accumulated_rear_impulse > CONTACT_IMPULSE_EPSILON;
            let grounded_front = accumulated_front_impulse > CONTACT_IMPULSE_EPSILON;
            debug_assert!(!grounded_rear || touching_rear);
            debug_assert!(!grounded_front || touching_front);
            let rear_impulse = if grounded_rear {
                accumulated_rear_impulse
            } else {
                0.0
            };
            let front_impulse = if grounded_front {
                accumulated_front_impulse
            } else {
                0.0
            };
            let contact_impulse = rear_impulse + front_impulse;
            let airborne = !grounded_rear && !grounded_front;
            if frames.last().is_some_and(|frame| !frame.airborne) && airborne {
                takeoff_x = pos.x;
            }
            launched |= airborne && min_clearance > TAKEOFF_CLEARANCE_M;
            if touchdown_t.is_none() && launched && !airborne {
                touchdown_t = Some(t);
            }
            let measured_interval = if frames.is_empty() {
                integration_parameters.dt
            } else {
                integration_parameters.dt * output_divisor as f32
            };
            let sample = sample_pose(&scenario.pose_clip, pos.x, &scenario.rider, &scenario.bike);

            cumulative_motor_work += (sample.targets.hip.abs() + sample.targets.knee.abs())
                * scenario.rider.strength_scale
                * 0.005;

            let frame = Frame {
                t: step as f32 / physics_frequency as f32,
                x: pos.x,
                y: pos.y,
                pitch: body.rotation().angle(),
                vx: vel.x,
                vy: vel.y,
                airborne,
                contact_impulse,
                shoulder: sample.derived_arm.shoulder,
                elbow: sample.derived_arm.elbow,
                knee: sample.targets.knee,
                hip: sample.targets.hip,
                spine: sample.targets.spine,
                grounded_rear,
                grounded_front,
                normal_force_rear: rear_impulse / measured_interval,
                normal_force_front: front_impulse / measured_interval,
                min_clearance,
                landmarks: sample.landmarks,
            };

            let landmarks = &frame.landmarks;
            frame_buffer.extend([
                frame.t,
                frame.x,
                frame.y,
                frame.pitch,
                frame.vx,
                frame.vy,
                if frame.airborne { 1.0 } else { 0.0 },
                frame.contact_impulse,
                frame.shoulder,
                frame.elbow,
                frame.knee,
                frame.hip,
                frame.spine,
                landmarks.pedal_contact.x,
                landmarks.pedal_contact.y,
                landmarks.ankle.x,
                landmarks.ankle.y,
                landmarks.knee.x,
                landmarks.knee.y,
                landmarks.hip.x,
                landmarks.hip.y,
                landmarks.shoulder.x,
                landmarks.shoulder.y,
                landmarks.elbow.x,
                landmarks.elbow.y,
                landmarks.hand.x,
                landmarks.hand.y,
                landmarks.handlebar_contact.x,
                landmarks.handlebar_contact.y,
                landmarks.head.x,
                landmarks.head.y,
                if frame.grounded_rear { 1.0 } else { 0.0 },
                if frame.grounded_front { 1.0 } else { 0.0 },
                frame.normal_force_rear,
                frame.normal_force_front,
                frame.min_clearance,
            ]);

            telemetry_buffer.extend([
                frame.contact_impulse,
                cumulative_motor_work,
                ComplexField::sqrt(frame.vx * frame.vx + frame.vy * frame.vy),
                frame.y,
            ]);

            frames.push(frame);
            touching_rear = false;
            touching_front = false;
            accumulated_rear_impulse = 0.0;
            accumulated_front_impulse = 0.0;

            if touchdown_t.is_some_and(|landed| t - landed >= POST_LANDING_FOLLOW_SECONDS) {
                break;
            }

            // Nothing left to model once the leading wheel reaches the end of the run-out.
            if front_center[0] >= terrain_end_x {
                break;
            }
        }
    }

    let phases = build_contact_phases(&frames, landing_end_x);

    let metrics = build_metrics(
        max_height,
        scenario.entry.speed,
        0.0,
        telemetry_buffer.iter().copied().step_by(4).sum::<f32>() * 0.001,
        cumulative_motor_work,
    );

    let mut hasher = Sha256::new();
    for value in &frame_buffer {
        hasher.update(value.to_le_bytes());
    }
    for value in &telemetry_buffer {
        hasher.update(value.to_le_bytes());
    }
    let result_hash = format!("{:x}", hasher.finalize());

    Ok(SolveOutput {
        run_id: run_id.to_string(),
        scenario_hash,
        solver_version: scenario.solver.solver_version.clone(),
        output_hz: scenario.solver.output_hz,
        stride_float32: FRAME_STRIDE_FLOAT32,
        frames,
        frame_buffer,
        telemetry_buffer,
        phases,
        metrics,
        summary: SolveSummary {
            takeoff_x,
            max_height,
        },
        result_hash,
    })
}
