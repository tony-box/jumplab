use std::collections::BTreeMap;

use rapier2d::prelude::*;
use sha2::{Digest, Sha256};

use crate::geometry::{Point2, TerrainProfile};
use crate::outcome::{LandingOutcome, build_metrics, classify_landing};
use crate::pose::validate_design;
use crate::scenario::Scenario;
use crate::simulation::{EndReason, Simulation, SimulationOptions, simulate};
use crate::telemetry::{MetricValue, TELEMETRY_STRIDE_FLOAT32};
use crate::version::{FRAME_LAYOUT_VERSION, MODEL_VERSION, SOLVER_VERSION};

/// Frame layout 3: one interleaved row of `f32` values per output frame, in this order.
pub const FRAME_LAYOUT_FIELDS: [&str; 57] = [
    "t",
    "x",
    "y",
    "pitch",
    "vx",
    "vy",
    "airborne",
    "contactImpulse",
    "shoulder",
    "elbow",
    "knee",
    "hip",
    "spine",
    "pedalContactX",
    "pedalContactY",
    "ankleX",
    "ankleY",
    "kneeX",
    "kneeY",
    "hipX",
    "hipY",
    "shoulderX",
    "shoulderY",
    "elbowX",
    "elbowY",
    "handX",
    "handY",
    "handlebarContactX",
    "handlebarContactY",
    "headX",
    "headY",
    "groundedRear",
    "groundedFront",
    "normalForceRear",
    "normalForceFront",
    "minClearance",
    "pitchRate",
    "s",
    "riderX",
    "riderY",
    "riderAngle",
    "riderOffsetX",
    "riderOffsetY",
    "riderOffsetAngle",
    "targetOffsetX",
    "targetOffsetY",
    "targetOffsetAngle",
    "instinctOffset",
    "instinctAngle",
    "instinctSaturated",
    "actuatorForceX",
    "actuatorForceY",
    "actuatorTorque",
    "actuatorSaturated",
    "workspaceLimited",
    "trackingError",
    "crashed",
];
pub const FRAME_STRIDE_FLOAT32: usize = FRAME_LAYOUT_FIELDS.len();

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
/// Riding surfaces are sampled polylines. A wheel touching a vertex would otherwise receive a
/// normal pointing out of that vertex and be kicked by every facet boundary, so contact normals
/// are blended from the neighbouring facet normals along the surface.
pub(crate) struct SmoothSurfaceHooks {
    surfaces: Vec<(ColliderHandle, Vec<[f32; 2]>)>,
}

fn facet_normal(left: [f32; 2], right: [f32; 2]) -> Vector {
    Vector::new(-(right[1] - left[1]), right[0] - left[0]).normalize()
}

fn vertex_normal(points: &[[f32; 2]], index: usize) -> Vector {
    let last = points.len() - 1;
    let before = (index > 0).then(|| facet_normal(points[index - 1], points[index]));
    let after = (index < last).then(|| facet_normal(points[index], points[index + 1]));
    match (before, after) {
        (Some(before), Some(after)) => (before + after).normalize(),
        (Some(normal), None) | (None, Some(normal)) => normal,
        (None, None) => Vector::new(0.0, 1.0),
    }
}

/// Normals blend toward a vertex only within this distance of it (or half the facet, if shorter),
/// so long straight facets keep their exact normal.
const NORMAL_BLEND_DISTANCE_M: f32 = 0.05;

/// Upward surface normal at `x`: the facet normal, blended toward the shared vertex normal close
/// to each end so the normal is continuous across vertices.
pub(crate) fn smooth_surface_normal(points: &[[f32; 2]], x: f32) -> Vector {
    if points.len() < 2 {
        return Vector::new(0.0, 1.0);
    }
    let upper = points
        .partition_point(|point| point[0] <= x)
        .clamp(1, points.len() - 1);
    let (left, right) = (points[upper - 1], points[upper]);
    let facet = facet_normal(left, right);
    let span = right[0] - left[0];
    if span <= f32::EPSILON {
        return facet;
    }
    let blend = NORMAL_BLEND_DISTANCE_M.min(0.5 * span);
    let left_weight = (1.0 - (x - left[0]) / blend).clamp(0.0, 1.0);
    let right_weight = (1.0 - (right[0] - x) / blend).clamp(0.0, 1.0);
    let blended = facet
        + (vertex_normal(points, upper - 1) - facet) * left_weight
        + (vertex_normal(points, upper) - facet) * right_weight;
    blended.normalize()
}

impl PhysicsHooks for SmoothSurfaceHooks {
    fn modify_solver_contacts(&self, context: &mut ContactModificationContext) {
        let Some((ground_is_first, points)) = self.surfaces.iter().find_map(|(handle, points)| {
            if context.collider1 == *handle {
                Some((true, points))
            } else if context.collider2 == *handle {
                Some((false, points))
            } else {
                None
            }
        }) else {
            return;
        };
        let Some(contact) = context.solver_contacts.first() else {
            return;
        };
        let contact_x = if ground_is_first {
            contact.anchor1.x
        } else {
            contact.anchor2.x
        };
        let upward = smooth_surface_normal(points, contact_x);
        *context.normal = if ground_is_first { upward } else { -upward };
    }
}
pub(crate) fn wheel_contact(narrow_phase: &NarrowPhase, collider: ColliderHandle) -> (bool, f32) {
    narrow_phase
        .contact_pairs_with(collider)
        .fold((false, 0.0), |(touching, impulse), pair| {
            (
                touching || pair.has_any_active_contact(),
                impulse + pair.total_impulse_magnitude().max(0.0),
            )
        })
}

pub(crate) fn world_point(body: &RigidBody, local: Point2) -> [f32; 2] {
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

/// Inserts every terrain segment as a static frictionless collider. Riding surfaces get smooth
/// contact normals; vertical faces stay plain so their corners remain real body boundaries.
pub(crate) fn insert_terrain_colliders(
    terrain: &TerrainProfile,
    collider_set: &mut ColliderSet,
) -> SmoothSurfaceHooks {
    let mut surfaces = Vec::new();
    for segment in &terrain.segments {
        let points = simplify_collinear_points(segment.points.clone());
        let vertices = points.iter().map(|[x, y]| Vector::new(*x, *y)).collect();
        let builder = ColliderBuilder::polyline(vertices, None)
            .friction(0.0)
            .restitution(0.0);
        if segment.kind == "landing-face" {
            collider_set.insert(builder.build());
        } else {
            let handle = collider_set.insert(
                builder
                    .active_hooks(ActiveHooks::MODIFY_SOLVER_CONTACTS)
                    .build(),
            );
            surfaces.push((handle, points));
        }
    }
    SmoothSurfaceHooks { surfaces }
}
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PhaseInterval {
    pub name: String,
    pub start_frame: usize,
    pub end_frame: usize,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SolveSummary {
    pub takeoff_x: Option<f32>,
    pub touchdown_x: Option<f32>,
    pub end_reason: String,
}

/// Solver output. Frame and telemetry rows travel as binary buffers, not JSON.
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SolveOutput {
    pub run_id: String,
    pub scenario_hash: String,
    pub solver_version: String,
    pub model_version: String,
    pub frame_layout_version: u32,
    pub output_hz: u32,
    pub stride_float32: usize,
    pub frame_count: usize,
    pub telemetry_stride_float32: usize,
    pub phases: Vec<PhaseInterval>,
    pub metrics: BTreeMap<String, MetricValue>,
    pub landing: LandingOutcome,
    pub summary: SolveSummary,
    pub result_hash: String,
    #[serde(skip)]
    pub frame_buffer: Vec<f32>,
    #[serde(skip)]
    pub telemetry_buffer: Vec<f32>,
    #[serde(skip)]
    pub simulation: Simulation,
}

fn flag(value: bool) -> f32 {
    if value { 1.0 } else { 0.0 }
}

impl SolveOutput {
    /// Full-precision frames behind the binary buffers.
    pub fn frames(&self) -> &[crate::simulation::SimFrame] {
        &self.simulation.frames
    }
}

fn frame_index_at(simulation: &Simulation, t: f32) -> usize {
    simulation
        .frames
        .iter()
        .position(|frame| frame.t >= t)
        .unwrap_or(simulation.frames.len().saturating_sub(1))
}

/// Phases follow the takeoff and touchdown events: approach, transition up the takeoff,
/// takeoff, flight, landing, and rollout once past the landing slope.
fn build_phases(simulation: &Simulation, lip_x: f32, landing_end_x: f32) -> Vec<PhaseInterval> {
    let frames = &simulation.frames;
    if frames.is_empty() {
        return Vec::new();
    }
    let last = frames.len() - 1;
    let phase = |name: &str, start: usize, end: usize| PhaseInterval {
        name: name.to_string(),
        start_frame: start,
        end_frame: end,
    };
    let ramp_start = frames
        .iter()
        .position(|frame| frame.bike_origin.x >= 0.0 && frame.bike_origin.x <= lip_x + 1.0);

    let Some(takeoff) = simulation.takeoff else {
        return match ramp_start {
            Some(start) if start > 0 => vec![
                phase("approach", 0, start - 1),
                phase("transition", start, last),
            ],
            _ => vec![phase("approach", 0, last)],
        };
    };
    let takeoff_frame = frame_index_at(simulation, takeoff.t).max(1);
    let mut phases = Vec::new();
    match ramp_start {
        Some(start) if start > 0 && start < takeoff_frame => {
            phases.push(phase("approach", 0, start - 1));
            phases.push(phase("transition", start, takeoff_frame - 1));
        }
        _ => phases.push(phase("approach", 0, takeoff_frame - 1)),
    }
    phases.push(phase("takeoff", takeoff_frame, takeoff_frame));

    let Some(touchdown) = simulation.touchdown else {
        if takeoff_frame < last {
            phases.push(phase("flight", takeoff_frame + 1, last));
        }
        return phases;
    };
    let touchdown_frame = frame_index_at(simulation, touchdown.t).max(takeoff_frame + 1);
    if touchdown_frame > last {
        return phases;
    }
    if touchdown_frame > takeoff_frame + 1 {
        phases.push(phase("flight", takeoff_frame + 1, touchdown_frame - 1));
    }
    let rollout = frames
        .iter()
        .enumerate()
        .skip(touchdown_frame + 1)
        .find_map(|(index, frame)| (frame.bike_origin.x >= landing_end_x).then_some(index));
    // Phases tile the whole run: landing lasts until the bike leaves the landing slope.
    phases.push(phase(
        "landing",
        touchdown_frame,
        rollout.map_or(last, |index| index - 1),
    ));
    if let Some(rollout) = rollout {
        phases.push(phase("rollout", rollout, last));
    }
    phases
}

fn write_buffers(simulation: &Simulation) -> (Vec<f32>, Vec<f32>) {
    let inertia = &simulation.inertia;
    let total = inertia.bike_mass + inertia.rider_mass;
    let mut frames = Vec::with_capacity(simulation.frames.len() * FRAME_STRIDE_FLOAT32);
    let mut telemetry = Vec::with_capacity(simulation.frames.len() * TELEMETRY_STRIDE_FLOAT32);
    for frame in &simulation.frames {
        let landmarks = &frame.skeleton.landmarks;
        let rider_world = frame.rider.com;
        let command = &frame.command;
        let tracking_x = frame.relative.com.x - frame.target.com.x;
        let tracking_y = frame.relative.com.y - frame.target.com.y;
        let row = [
            frame.t,
            frame.bike_origin.x,
            frame.bike_origin.y,
            frame.bike.angle,
            frame.bike.velocity.x,
            frame.bike.velocity.y,
            flag(frame.airborne),
            frame.contact_impulse,
            frame.skeleton.shoulder,
            frame.skeleton.elbow,
            frame.skeleton.targets.knee,
            frame.skeleton.targets.hip,
            frame.skeleton.targets.spine,
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
            flag(frame.grounded_rear),
            flag(frame.grounded_front),
            frame.normal_force_rear,
            frame.normal_force_front,
            frame.min_clearance,
            frame.bike.angular_velocity,
            frame.s,
            rider_world.x,
            rider_world.y,
            frame.rider.angle,
            frame.relative.com.x,
            frame.relative.com.y,
            frame.relative.angle,
            frame.authored_target.com.x,
            frame.authored_target.com.y,
            frame.authored_target.angle,
            frame.instinct_offset,
            frame.instinct_angle,
            flag(frame.instinct_saturated),
            command.force_local.x + frame.workspace_force.x,
            command.force_local.y + frame.workspace_force.y,
            command.torque,
            flag(
                command.saturated_fore_aft || command.saturated_vertical || command.saturated_pitch,
            ),
            flag(frame.workspace_force.x != 0.0 || frame.workspace_force.y != 0.0),
            (tracking_x * tracking_x + tracking_y * tracking_y).sqrt(),
            flag(frame.crashed),
        ];
        debug_assert_eq!(row.len(), FRAME_STRIDE_FLOAT32);
        frames.extend(row);

        let velocity = frame.linear_momentum;
        let com_height =
            (inertia.bike_mass * frame.bike.com.y + inertia.rider_mass * frame.rider.com.y) / total;
        telemetry.extend([
            frame.contact_impulse,
            frame.actuator_work,
            (velocity.x * velocity.x + velocity.y * velocity.y).sqrt() / total,
            com_height,
        ]);
    }
    (frames, telemetry)
}

fn end_reason_name(reason: EndReason) -> &'static str {
    match reason {
        EndReason::PostLandingWindow => "post-landing-window",
        EndReason::TerrainEnd => "terrain-end",
        EndReason::Stalled => "stalled",
        EndReason::TimeLimit => "time-limit",
    }
}

pub fn solve_scenario(scenario: &Scenario, run_id: &str) -> Result<SolveOutput, String> {
    scenario
        .validate()
        .map_err(|err| format!("invalid scenario: {err}"))?;
    if !validate_design(scenario)?.can_solve {
        return Err("design-invalid".to_string());
    }
    let scenario_hash = scenario.canonical_hash()?;
    let simulation = simulate(scenario, &SimulationOptions::default())?;

    let landing_end_x = simulation.terrain.landing_start_x + scenario.jump.landing_length;
    let phases = build_phases(&simulation, simulation.terrain.lip_x, landing_end_x);
    let metrics = build_metrics(scenario, &simulation);
    let landing = classify_landing(scenario, &simulation);
    let (frame_buffer, telemetry_buffer) = write_buffers(&simulation);

    let mut hasher = Sha256::new();
    for value in frame_buffer.iter().chain(telemetry_buffer.iter()) {
        hasher.update(value.to_le_bytes());
    }
    let result_hash = format!("{:x}", hasher.finalize());

    Ok(SolveOutput {
        run_id: run_id.to_string(),
        scenario_hash,
        solver_version: SOLVER_VERSION.to_string(),
        model_version: MODEL_VERSION.to_string(),
        frame_layout_version: FRAME_LAYOUT_VERSION,
        output_hz: scenario.solver.output_hz,
        stride_float32: FRAME_STRIDE_FLOAT32,
        frame_count: simulation.frames.len(),
        telemetry_stride_float32: TELEMETRY_STRIDE_FLOAT32,
        phases,
        metrics,
        landing,
        summary: SolveSummary {
            takeoff_x: simulation.takeoff.map(|event| event.bike_origin.x),
            touchdown_x: simulation.touchdown.map(|event| event.contact_x),
            end_reason: end_reason_name(simulation.end_reason).to_string(),
        },
        result_hash,
        frame_buffer,
        telemetry_buffer,
        simulation,
    })
}
