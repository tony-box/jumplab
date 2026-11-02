use std::collections::BTreeMap;

use rapier2d::na::ComplexField;

use crate::bike::{BikeMassProperties, derive_bike_mass_properties};
use crate::scenario::{
    BIKE_GEOMETRY_MODEL_VERSION, BikeFlavor, BikeSpec, JumpKind, RiderSpec, Scenario,
    kicker_transition_length,
};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GroundSegment {
    pub id: String,
    pub kind: String,
    pub points: Vec<[f32; 2]>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TerrainProfile {
    pub segments: Vec<GroundSegment>,
    pub approach_start_x: f32,
    pub lip_x: f32,
    pub landing_start_x: f32,
    pub sample_step: f32,
}

/// A finite bike-local point in metres (positive x forward, positive y up).
#[derive(Debug, Clone, Copy, Default, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct Point2 {
    pub x: f32,
    pub y: f32,
}

impl Point2 {
    pub fn new(x: f32, y: f32) -> Self {
        Self { x, y }
    }

    pub fn is_finite(&self) -> bool {
        self.x.is_finite() && self.y.is_finite()
    }

    pub fn distance(&self, other: &Point2) -> f32 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        ComplexField::sqrt(dx * dx + dy * dy)
    }

    pub fn midpoint(&self, other: &Point2) -> Point2 {
        Point2::new((self.x + other.x) * 0.5, (self.y + other.y) * 0.5)
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GeometryIssue {
    pub code: String,
    pub fields: Vec<String>,
    pub bike_parts: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct BikeMember {
    pub name: String,
    pub start: Point2,
    pub end: Point2,
    #[serde(skip_serializing, skip_deserializing, default)]
    pub radius: f32,
}

impl BikeMember {
    pub fn length(&self) -> f32 {
        self.start.distance(&self.end)
    }
}

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ContactSurface {
    None,
    Hand,
    Foot,
    #[serde(rename = "saddle-top")]
    SaddleTop,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(
    tag = "shape",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ProtectedShapeGeometry {
    Capsule {
        start: Point2,
        end: Point2,
        radius: f32,
    },
    Circle {
        center: Point2,
        radius: f32,
    },
    Ring {
        center: Point2,
        inner_radius: f32,
        outer_radius: f32,
    },
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ClearanceShape {
    Capsule {
        start: Point2,
        end: Point2,
        radius: f32,
    },
    Circle {
        center: Point2,
        radius: f32,
    },
    Ring {
        center: Point2,
        inner_radius: f32,
        outer_radius: f32,
    },
}

impl From<&ProtectedShapeGeometry> for ClearanceShape {
    fn from(value: &ProtectedShapeGeometry) -> Self {
        match *value {
            ProtectedShapeGeometry::Capsule { start, end, radius } => {
                Self::Capsule { start, end, radius }
            }
            ProtectedShapeGeometry::Circle { center, radius } => Self::Circle { center, radius },
            ProtectedShapeGeometry::Ring {
                center,
                inner_radius,
                outer_radius,
            } => Self::Ring {
                center,
                inner_radius,
                outer_radius,
            },
        }
    }
}

pub fn signed_shape_separation(left: &ClearanceShape, right: &ClearanceShape) -> f32 {
    match (*left, *right) {
        (
            ClearanceShape::Circle {
                center: left_center,
                radius: left_radius,
            },
            ClearanceShape::Circle {
                center: right_center,
                radius: right_radius,
            },
        ) => left_center.distance(&right_center) - left_radius - right_radius,
        (
            ClearanceShape::Capsule { start, end, radius },
            ClearanceShape::Circle {
                center,
                radius: circle_radius,
            },
        )
        | (
            ClearanceShape::Circle {
                center,
                radius: circle_radius,
            },
            ClearanceShape::Capsule { start, end, radius },
        ) => point_segment_distance(center, start, end) - radius - circle_radius,
        (
            ClearanceShape::Capsule {
                start: left_start,
                end: left_end,
                radius: left_radius,
            },
            ClearanceShape::Capsule {
                start: right_start,
                end: right_end,
                radius: right_radius,
            },
        ) => {
            segment_segment_distance(left_start, left_end, right_start, right_end)
                - left_radius
                - right_radius
        }
        (ClearanceShape::Ring { .. }, ClearanceShape::Ring { .. }) => {
            ring_ring_separation(left, right)
        }
        (ClearanceShape::Ring { .. }, _) => ring_shape_separation(left, right),
        (_, ClearanceShape::Ring { .. }) => ring_shape_separation(right, left),
    }
}

fn point_segment_distance(point: Point2, start: Point2, end: Point2) -> f32 {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let length_squared = dx * dx + dy * dy;
    if length_squared <= f32::EPSILON {
        return point.distance(&start);
    }
    let projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / length_squared;
    let projection = projection.clamp(0.0, 1.0);
    point.distance(&Point2::new(
        start.x + dx * projection,
        start.y + dy * projection,
    ))
}

fn segment_segment_distance(
    left_start: Point2,
    left_end: Point2,
    right_start: Point2,
    right_end: Point2,
) -> f32 {
    if segments_intersect_or_touch(left_start, left_end, right_start, right_end) {
        return 0.0;
    }
    [
        point_segment_distance(left_start, right_start, right_end),
        point_segment_distance(left_end, right_start, right_end),
        point_segment_distance(right_start, left_start, left_end),
        point_segment_distance(right_end, left_start, left_end),
    ]
    .into_iter()
    .fold(f32::INFINITY, f32::min)
}

fn segments_intersect_or_touch(a: Point2, b: Point2, c: Point2, d: Point2) -> bool {
    let cross = |origin: Point2, first: Point2, second: Point2| {
        (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x)
    };
    let ab_c = cross(a, b, c);
    let ab_d = cross(a, b, d);
    let cd_a = cross(c, d, a);
    let cd_b = cross(c, d, b);
    ab_c * ab_d <= 0.0 && cd_a * cd_b <= 0.0
}

fn ring_shape_separation(ring: &ClearanceShape, shape: &ClearanceShape) -> f32 {
    let ClearanceShape::Ring {
        center,
        inner_radius,
        outer_radius,
    } = *ring
    else {
        unreachable!("ring_shape_separation requires a ring")
    };
    let (shape_min, shape_max) = radial_interval(shape, center);
    interval_separation(inner_radius, outer_radius, shape_min, shape_max)
}

fn ring_ring_separation(left: &ClearanceShape, right: &ClearanceShape) -> f32 {
    let ClearanceShape::Ring {
        center: left_center,
        inner_radius: left_inner,
        outer_radius: left_outer,
    } = *left
    else {
        unreachable!("ring_ring_separation requires rings")
    };
    let ClearanceShape::Ring {
        center: right_center,
        inner_radius: right_inner,
        outer_radius: right_outer,
    } = *right
    else {
        unreachable!("ring_ring_separation requires rings")
    };
    let center_distance = left_center.distance(&right_center);
    let right_min = (center_distance - right_outer).max(0.0);
    let right_max = center_distance + right_outer;
    let outer_separation = interval_separation(left_inner, left_outer, right_min, right_max);
    if outer_separation >= 0.0 {
        return outer_separation;
    }
    let nested_gap = (left_inner - (center_distance + right_inner))
        .max(right_inner - (center_distance + left_inner));
    if nested_gap > 0.0 {
        nested_gap
    } else {
        outer_separation
    }
}

fn radial_interval(shape: &ClearanceShape, origin: Point2) -> (f32, f32) {
    match *shape {
        ClearanceShape::Circle { center, radius } => {
            let distance = center.distance(&origin);
            ((distance - radius).max(0.0), distance + radius)
        }
        ClearanceShape::Capsule { start, end, radius } => {
            let minimum = (point_segment_distance(origin, start, end) - radius).max(0.0);
            let maximum = start.distance(&origin).max(end.distance(&origin)) + radius;
            (minimum, maximum)
        }
        ClearanceShape::Ring {
            center,
            outer_radius,
            ..
        } => {
            let distance = center.distance(&origin);
            ((distance - outer_radius).max(0.0), distance + outer_radius)
        }
    }
}

fn interval_separation(left_min: f32, left_max: f32, right_min: f32, right_max: f32) -> f32 {
    if left_max < right_min {
        right_min - left_max
    } else if right_max < left_min {
        left_min - right_max
    } else {
        -(left_max.min(right_max) - left_min.max(right_min))
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProtectedShape {
    pub part: String,
    pub contact_surface: ContactSurface,
    #[serde(flatten)]
    pub geometry: ProtectedShapeGeometry,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BikeGeometryInspection {
    pub model_version: u32,
    pub valid: bool,
    pub issues: Vec<GeometryIssue>,
    pub closure_residual: f32,
    pub landmarks: BTreeMap<String, Point2>,
    pub members: Vec<BikeMember>,
    pub protected_shapes: Vec<ProtectedShape>,
    pub mass_properties: BikeMassProperties,
}

const FRAME_RADIUS_M: f32 = 0.025;
const STEERING_RADIUS_M: f32 = 0.018;
const CRANK_MEMBER_RADIUS_M: f32 = 0.012;
const TIRE_THICKNESS_M: f32 = 0.03;
const RIM_THICKNESS_M: f32 = 0.012;

pub fn inspect_bike_geometry(bike: &BikeSpec) -> BikeGeometryInspection {
    let wheel_radius = bike.wheel_size * 0.0254 * 0.5;
    let rear_axle = Point2::new(-bike.wheelbase * 0.5, wheel_radius);
    let front_axle = Point2::new(bike.wheelbase * 0.5, wheel_radius);
    let vertical = bike.bb_height - wheel_radius;
    let chainstay_horizontal_squared = bike.chainstay * bike.chainstay - vertical * vertical;
    let bottom_bracket = Point2::new(
        rear_axle.x + ComplexField::sqrt(chainstay_horizontal_squared.max(0.0)),
        bike.bb_height,
    );
    let geometry = &bike.geometry;
    let head_tube_top = Point2::new(
        bottom_bracket.x + geometry.reach,
        bottom_bracket.y + geometry.stack,
    );
    let head_axis = Point2::new(
        libm::cosf(geometry.head_tube_angle),
        -libm::sinf(geometry.head_tube_angle),
    );
    let head_tube_bottom = offset(head_tube_top, head_axis, geometry.head_tube_length);
    let fork_offset_axis = Point2::new(-head_axis.y, head_axis.x);
    let predicted_front_axle = offset(
        offset(head_tube_bottom, head_axis, geometry.fork_length),
        fork_offset_axis,
        geometry.fork_offset,
    );
    let closure_residual = predicted_front_axle.distance(&front_axle);
    let seat_axis = Point2::new(
        -libm::cosf(geometry.seat_tube_angle),
        libm::sinf(geometry.seat_tube_angle),
    );
    let seat_tube_top = offset(bottom_bracket, seat_axis, geometry.seat_tube_length);
    let mut saddle_center = offset(bottom_bracket, seat_axis, geometry.saddle_height);
    saddle_center.x -= geometry.saddle_setback;
    let pedal_forward = Point2::new(bottom_bracket.x + geometry.crank_length, bottom_bracket.y);
    let pedal_rearward = Point2::new(bottom_bracket.x - geometry.crank_length, bottom_bracket.y);
    let handlebar_contact = Point2::new(
        head_tube_top.x + geometry.handlebar_offset_x,
        head_tube_top.y + geometry.handlebar_offset_y,
    );

    let mut landmarks = BTreeMap::new();
    for (name, point) in [
        ("rearAxle", rear_axle),
        ("frontAxle", front_axle),
        ("bottomBracket", bottom_bracket),
        ("headTubeTop", head_tube_top),
        ("headTubeBottom", head_tube_bottom),
        ("predictedFrontAxle", predicted_front_axle),
        ("seatTubeTop", seat_tube_top),
        ("saddleCenter", saddle_center),
        ("pedalForward", pedal_forward),
        ("pedalRearward", pedal_rearward),
        ("handlebarContact", handlebar_contact),
    ] {
        landmarks.insert(name.to_string(), point);
    }

    let mut members = vec![
        bike_member("chainstay", rear_axle, bottom_bracket, FRAME_RADIUS_M),
        bike_member("seatstay", rear_axle, seat_tube_top, FRAME_RADIUS_M),
        bike_member("seatTube", bottom_bracket, seat_tube_top, FRAME_RADIUS_M),
        bike_member("topTube", seat_tube_top, head_tube_top, FRAME_RADIUS_M),
        bike_member("downTube", bottom_bracket, head_tube_bottom, FRAME_RADIUS_M),
        bike_member("headTube", head_tube_top, head_tube_bottom, FRAME_RADIUS_M),
        bike_member("fork", head_tube_bottom, front_axle, STEERING_RADIUS_M),
        bike_member(
            "seatSupport",
            seat_tube_top,
            saddle_center,
            STEERING_RADIUS_M,
        ),
        bike_member(
            "crankForward",
            bottom_bracket,
            pedal_forward,
            CRANK_MEMBER_RADIUS_M,
        ),
        bike_member(
            "crankRearward",
            bottom_bracket,
            pedal_rearward,
            CRANK_MEMBER_RADIUS_M,
        ),
        bike_member(
            "stemHandlebar",
            head_tube_top,
            handlebar_contact,
            STEERING_RADIUS_M,
        ),
    ];
    if matches!(bike.frame_type, BikeFlavor::Full) {
        let rear_shock_frame = seat_tube_top.midpoint(&head_tube_bottom);
        let rear_shock_swingarm = rear_axle.midpoint(&bottom_bracket);
        landmarks.insert("rearShockFrame".to_string(), rear_shock_frame);
        landmarks.insert("rearShockSwingarm".to_string(), rear_shock_swingarm);
        members.push(bike_member(
            "rearShock",
            rear_shock_swingarm,
            rear_shock_frame,
            STEERING_RADIUS_M,
        ));
    }

    let issues = geometry_issues(
        bike,
        chainstay_horizontal_squared,
        closure_residual,
        &members,
    );
    let protected_shapes = protected_shapes(wheel_radius, &landmarks, &members);
    let mass_properties = derive_bike_mass_properties(bike, &landmarks, &members);
    BikeGeometryInspection {
        model_version: BIKE_GEOMETRY_MODEL_VERSION,
        valid: issues.is_empty(),
        issues,
        closure_residual,
        landmarks,
        members,
        protected_shapes,
        mass_properties,
    }
}

fn offset(origin: Point2, direction: Point2, distance: f32) -> Point2 {
    Point2::new(
        origin.x + direction.x * distance,
        origin.y + direction.y * distance,
    )
}

fn bike_member(name: &str, start: Point2, end: Point2, radius: f32) -> BikeMember {
    BikeMember {
        name: name.to_string(),
        start,
        end,
        radius,
    }
}

fn geometry_issues(
    bike: &BikeSpec,
    chainstay_horizontal_squared: f32,
    closure_residual: f32,
    members: &[BikeMember],
) -> Vec<GeometryIssue> {
    let mut issues = Vec::new();
    let geometry = &bike.geometry;
    if !bike.wheel_size.is_finite() || ![26.0, 27.5, 29.0].contains(&bike.wheel_size) {
        issues.push(issue(
            "field-range",
            &["wheelSize"],
            &[],
            "wheelSize must be 26, 27.5, or 29 inches".to_string(),
        ));
    }
    for (field, value, minimum, maximum) in [
        ("wheelbase", bike.wheelbase, 0.80, 1.50),
        ("chainstay", bike.chainstay, 0.30, 0.65),
        ("bbHeight", bike.bb_height, 0.20, 0.50),
        ("mass", bike.mass, 5.0, 30.0),
        ("geometry.reach", geometry.reach, 0.30, 0.60),
        ("geometry.stack", geometry.stack, 0.45, 0.80),
        (
            "geometry.headTubeLength",
            geometry.head_tube_length,
            0.06,
            0.25,
        ),
        (
            "geometry.headTubeAngle",
            geometry.head_tube_angle,
            0.87,
            1.40,
        ),
        ("geometry.forkLength", geometry.fork_length, 0.30, 0.65),
        ("geometry.forkOffset", geometry.fork_offset, 0.00, 0.10),
        (
            "geometry.seatTubeLength",
            geometry.seat_tube_length,
            0.25,
            0.65,
        ),
        (
            "geometry.seatTubeAngle",
            geometry.seat_tube_angle,
            1.05,
            1.45,
        ),
        ("geometry.saddleHeight", geometry.saddle_height, 0.30, 0.90),
        (
            "geometry.saddleSetback",
            geometry.saddle_setback,
            -0.15,
            0.25,
        ),
        ("geometry.crankLength", geometry.crank_length, 0.145, 0.190),
        (
            "geometry.handlebarOffsetX",
            geometry.handlebar_offset_x,
            -0.10,
            0.30,
        ),
        (
            "geometry.handlebarOffsetY",
            geometry.handlebar_offset_y,
            -0.15,
            0.25,
        ),
    ] {
        if !value.is_finite() || !(minimum..=maximum).contains(&value) {
            issues.push(issue(
                "field-range",
                &[field],
                &[],
                format!("{field} must be finite and between {minimum} and {maximum}"),
            ));
        }
    }
    if geometry.model_version != BIKE_GEOMETRY_MODEL_VERSION {
        issues.push(issue(
            "field-range",
            &["geometry.modelVersion"],
            &[],
            "geometry.modelVersion must be 1".to_string(),
        ));
    }
    if chainstay_horizontal_squared < 0.0 {
        issues.push(issue(
            "chainstay-bb-triangle",
            &["chainstay", "bbHeight", "wheelSize"],
            &["chainstay"],
            "chainstay cannot connect the rear axle to the bottom bracket".to_string(),
        ));
    }

    let zero_members: Vec<String> = members
        .iter()
        .filter(|member| member.length() <= f32::EPSILON)
        .map(|member| member.name.clone())
        .collect();
    if !zero_members.is_empty() {
        issues.push(GeometryIssue {
            code: "zero-length-member".to_string(),
            fields: Vec::new(),
            bike_parts: zero_members,
            message: "frame and steering members must have non-zero length".to_string(),
        });
    }
    if !closure_residual.is_finite() || closure_residual > 0.010 {
        issues.push(issue(
            "steering-closure",
            &[
                "wheelbase",
                "geometry.headTubeLength",
                "geometry.headTubeAngle",
                "geometry.forkLength",
                "geometry.forkOffset",
            ],
            &["fork", "frontAxle"],
            "fork and head assembly must close within 0.010 m of the front axle".to_string(),
        ));
    }
    if chainstay_horizontal_squared >= 0.0 && has_unintentional_intersection(members) {
        issues.push(issue(
            "self-intersection",
            &[],
            &["frame"],
            "present frame members must not self-intersect".to_string(),
        ));
    }

    let relationship_valid = match bike.frame_type {
        BikeFlavor::Full => bike.rear_shock.is_some(),
        BikeFlavor::Rigid | BikeFlavor::Hardtail => bike.rear_shock.is_none(),
    };
    if !relationship_valid {
        issues.push(issue(
            "frame-suspension-relationship",
            &["frameType", "rearShock"],
            &["rearShock"],
            "rearShock is required only for full suspension frames".to_string(),
        ));
    }
    issues
}

fn issue(code: &str, fields: &[&str], bike_parts: &[&str], message: String) -> GeometryIssue {
    GeometryIssue {
        code: code.to_string(),
        fields: fields.iter().map(|value| (*value).to_string()).collect(),
        bike_parts: bike_parts
            .iter()
            .map(|value| (*value).to_string())
            .collect(),
        message,
    }
}

fn has_unintentional_intersection(members: &[BikeMember]) -> bool {
    let frame_names = ["chainstay", "seatstay", "seatTube", "topTube", "downTube"];
    let frame: Vec<&BikeMember> = members
        .iter()
        .filter(|member| frame_names.contains(&member.name.as_str()))
        .collect();
    for (index, left) in frame.iter().enumerate() {
        for right in frame.iter().skip(index + 1) {
            if !shares_endpoint(left, right)
                && segments_intersect(left.start, left.end, right.start, right.end)
            {
                return true;
            }
        }
    }
    false
}

fn shares_endpoint(left: &BikeMember, right: &BikeMember) -> bool {
    [left.start, left.end].iter().any(|left_point| {
        [right.start, right.end]
            .iter()
            .any(|right_point| left_point.distance(right_point) <= 1.0e-6)
    })
}

fn segments_intersect(a: Point2, b: Point2, c: Point2, d: Point2) -> bool {
    let cross = |origin: Point2, first: Point2, second: Point2| {
        (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x)
    };
    cross(a, b, c) * cross(a, b, d) < 0.0 && cross(c, d, a) * cross(c, d, b) < 0.0
}

fn protected_shapes(
    wheel_radius: f32,
    landmarks: &BTreeMap<String, Point2>,
    members: &[BikeMember],
) -> Vec<ProtectedShape> {
    let rear_axle = landmarks["rearAxle"];
    let front_axle = landmarks["frontAxle"];
    let mut shapes = vec![
        ring(
            "rearTire",
            rear_axle,
            wheel_radius - TIRE_THICKNESS_M,
            wheel_radius,
        ),
        ring(
            "rearRim",
            rear_axle,
            wheel_radius * 0.72 - RIM_THICKNESS_M,
            wheel_radius * 0.72,
        ),
        ring(
            "frontTire",
            front_axle,
            wheel_radius - TIRE_THICKNESS_M,
            wheel_radius,
        ),
        ring(
            "frontRim",
            front_axle,
            wheel_radius * 0.72 - RIM_THICKNESS_M,
            wheel_radius * 0.72,
        ),
    ];
    shapes.extend(members.iter().map(|member| {
        let end = match member.name.as_str() {
            "crankForward" | "stemHandlebar" => inset_toward(member.end, member.start, 0.07),
            _ => member.end,
        };
        ProtectedShape {
            part: member.name.clone(),
            contact_surface: ContactSurface::None,
            geometry: ProtectedShapeGeometry::Capsule {
                start: member.start,
                end,
                radius: member.radius,
            },
        }
    }));
    let saddle_center = landmarks["saddleCenter"];
    shapes.push(ProtectedShape {
        part: "saddle".to_string(),
        contact_surface: ContactSurface::SaddleTop,
        geometry: ProtectedShapeGeometry::Capsule {
            start: Point2::new(saddle_center.x - 0.13, saddle_center.y),
            end: Point2::new(saddle_center.x + 0.13, saddle_center.y),
            radius: 0.025,
        },
    });
    shapes.push(circle(
        "pedalForward",
        landmarks["pedalForward"],
        ContactSurface::Foot,
    ));
    shapes.push(circle(
        "pedalRearward",
        landmarks["pedalRearward"],
        ContactSurface::Foot,
    ));
    shapes.push(circle(
        "handlebar",
        landmarks["handlebarContact"],
        ContactSurface::Hand,
    ));
    shapes
}

fn ring(part: &str, center: Point2, inner_radius: f32, outer_radius: f32) -> ProtectedShape {
    ProtectedShape {
        part: part.to_string(),
        contact_surface: ContactSurface::None,
        geometry: ProtectedShapeGeometry::Ring {
            center,
            inner_radius,
            outer_radius,
        },
    }
}

fn circle(part: &str, center: Point2, contact_surface: ContactSurface) -> ProtectedShape {
    ProtectedShape {
        part: part.to_string(),
        contact_surface,
        geometry: ProtectedShapeGeometry::Circle {
            center,
            radius: 0.035,
        },
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

/// Deterministic rider link lengths shared by segment reporting and pose kinematics.
/// Ratios mirror the canonical anthropometric split documented in `docs/physics/model.md`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RiderLinkLengths {
    pub torso: f32,
    pub thigh: f32,
    pub shank: f32,
    pub upper_arm: f32,
    pub forearm: f32,
    pub head: f32,
}

pub fn rider_link_lengths(rider: &RiderSpec) -> RiderLinkLengths {
    let leg_len = rider.height * rider.leg_ratio;
    let arm_len = rider.height * rider.arm_ratio;
    let torso_len = (rider.height - leg_len - arm_len * 0.5).max(0.2);

    RiderLinkLengths {
        torso: torso_len,
        thigh: leg_len * 0.53,
        shank: leg_len * 0.47,
        upper_arm: arm_len * 0.55,
        forearm: arm_len * 0.45,
        head: rider.height * 0.12,
    }
}

/// Rider-to-bike contact points taken from the measured bike geometry: the
/// forward pedal at a level crank and the handlebar grip.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BikeContactPoints {
    pub pedal_contact: Point2,
    pub handlebar_contact: Point2,
}

pub fn bike_contact_points(bike: &BikeSpec) -> BikeContactPoints {
    let inspection = inspect_bike_geometry(bike);

    BikeContactPoints {
        pedal_contact: inspection.landmarks["pedalForward"],
        handlebar_contact: inspection.landmarks["handlebarContact"],
    }
}

pub fn generate_terrain_profile(scenario: &Scenario, step: f32) -> TerrainProfile {
    let step_size = if step > 0.0 { step } else { 0.25 };
    let jump = &scenario.jump;
    let lip_len = if jump.is_kicker() {
        kicker_transition_length(jump.lip_height, jump.lip_angle)
    } else {
        jump.transition_length
    };
    let wheel_radius = scenario.bike.wheel_size * 0.0254 * 0.5;
    let approach_start = scenario.entry.start_x - scenario.bike.wheelbase * 0.5 - wheel_radius;
    let mut approach_points = vec![[approach_start, 0.0], [0.0, 0.0]];

    if jump.is_kicker() {
        // Constant-radius transition: flat at the base, leaving the lip at the authored angle.
        let radius = jump.lip_height / (1.0 - libm::cosf(jump.lip_angle));
        let segment_count = ((radius * jump.lip_angle) / step_size).ceil().max(1.0) as usize;
        approach_points.extend((1..=segment_count).map(|index| {
            let angle = jump.lip_angle * index as f32 / segment_count as f32;
            [
                quantize_terrain(radius * libm::sinf(angle)),
                quantize_terrain(radius * (1.0 - libm::cosf(angle))),
            ]
        }));
        if let Some(lip) = approach_points.last_mut() {
            *lip = [quantize_terrain(lip_len), quantize_terrain(jump.lip_height)];
        }
    } else {
        let tangent = libm::tanf(jump.lip_angle);
        // Only a rising exit can overshoot the lip; a level or falling edge keeps the full handle.
        let end_handle_x = if tangent > 0.0 {
            (lip_len / 3.0).min(jump.lip_height / (2.0 * tangent))
        } else {
            lip_len / 3.0
        };
        let mut lip_points = sample_cubic_bezier(
            [0.0, 0.0],
            [lip_len / 3.0, 0.0],
            [
                lip_len - end_handle_x,
                jump.lip_height - end_handle_x * tangent,
            ],
            [lip_len, jump.lip_height],
            step_size,
        );
        approach_points.append(&mut lip_points.drain(1..).collect());
    }

    let landing_start_x = lip_len + jump.gap;
    let landing_y = jump.lip_height + jump.step_delta;
    let landing_end_x = landing_start_x + jump.landing_length;
    let landing_tangent = libm::tanf(jump.landing_angle);
    let landing_end_y = quantize_terrain(landing_y - landing_tangent * jump.landing_length);
    // The run-out has to carry the rider for the whole post-landing follow window, measured from
    // the far edge of the landing so any touchdown on it is covered.
    let follow_end_x =
        landing_end_x + scenario.entry.speed * crate::solver::POST_LANDING_FOLLOW_SECONDS;
    let rollout_end_x = (landing_end_x + jump.rollout).max(follow_end_x);

    let landing_handle_x = jump.landing_length / 3.0;
    let mut landing_points = sample_cubic_bezier(
        [landing_start_x, landing_y],
        [
            landing_start_x + landing_handle_x,
            landing_y - landing_tangent * landing_handle_x,
        ],
        [landing_end_x - landing_handle_x, landing_end_y],
        [landing_end_x, landing_end_y],
        step_size,
    );
    landing_points.push([rollout_end_x, landing_end_y]);

    let mut segments = vec![GroundSegment {
        id: "approach-takeoff".to_string(),
        kind: "approach-takeoff".to_string(),
        points: approach_points,
    }];

    if matches!(jump.kind, JumpKind::Table) && landing_start_x > lip_len {
        segments.push(GroundSegment {
            id: "table-deck".to_string(),
            kind: "table-deck".to_string(),
            points: vec![[lip_len, jump.lip_height], [landing_start_x, landing_y]],
        });
    }

    let landing_start = landing_points[0];
    if let Some(face) = exposed_landing_face(
        segments
            .last()
            .and_then(|segment| segment.points.last())
            .copied(),
        landing_start,
        landing_end_y,
    ) {
        segments.push(face);
    }

    segments.push(GroundSegment {
        id: "landing-rollout".to_string(),
        kind: "landing-rollout".to_string(),
        points: landing_points,
    });

    TerrainProfile {
        segments,
        approach_start_x: approach_start,
        lip_x: lip_len,
        landing_start_x,
        sample_step: step_size,
    }
}

/// Half of the 1 mm quantisation step: closer coordinates describe the same stitched point.
const TERRAIN_JOIN_EPSILON_M: f32 = 5.0e-4;

/// Vertical wall where the landing meets whatever precedes it. Touching surfaces expose the step
/// between their two heights; across a true gap the landing exposes its own leading face.
fn exposed_landing_face(
    previous_end: Option<[f32; 2]>,
    landing_start: [f32; 2],
    landing_end_y: f32,
) -> Option<GroundSegment> {
    let touching =
        previous_end.filter(|end| (end[0] - landing_start[0]).abs() <= TERRAIN_JOIN_EPSILON_M);
    let opposite_y = touching.map_or(landing_end_y, |end| end[1]);

    if (opposite_y - landing_start[1]).abs() <= TERRAIN_JOIN_EPSILON_M {
        return None;
    }

    Some(GroundSegment {
        id: "landing-face".to_string(),
        kind: "landing-face".to_string(),
        points: vec![
            [landing_start[0], opposite_y.min(landing_start[1])],
            [landing_start[0], opposite_y.max(landing_start[1])],
        ],
    })
}

fn sample_cubic_bezier(
    start: [f32; 2],
    control_1: [f32; 2],
    control_2: [f32; 2],
    end: [f32; 2],
    maximum_step: f32,
) -> Vec<[f32; 2]> {
    let monotone_span = (end[0] - start[0]).abs() + (end[1] - start[1]).abs();
    let segment_count = (monotone_span / maximum_step).ceil().max(1.0) as usize + 1;

    (0..=segment_count)
        .map(|index| {
            let t = index as f32 / segment_count as f32;
            let inverse = 1.0 - t;
            let weights = [
                inverse.powi(3),
                3.0 * inverse.powi(2) * t,
                3.0 * inverse * t.powi(2),
                t.powi(3),
            ];
            [
                quantize_terrain(
                    weights[0] * start[0]
                        + weights[1] * control_1[0]
                        + weights[2] * control_2[0]
                        + weights[3] * end[0],
                ),
                quantize_terrain(
                    weights[0] * start[1]
                        + weights[1] * control_1[1]
                        + weights[2] * control_2[1]
                        + weights[3] * end[1],
                ),
            ]
        })
        .collect()
}

fn quantize_terrain(value: f32) -> f32 {
    (value * 1_000.0).round() / 1_000.0
}

pub fn terrain_height_at(profile: &TerrainProfile, x: f32) -> Option<f32> {
    for segment in &profile.segments {
        for pair in segment.points.windows(2) {
            let left = pair[0];
            let right = pair[1];
            if (right[0] - left[0]).abs() <= f32::EPSILON {
                continue;
            }
            if x >= left[0].min(right[0]) && x <= left[0].max(right[0]) {
                let alpha = (x - left[0]) / (right[0] - left[0]);
                return Some(left[1] + (right[1] - left[1]) * alpha);
            }
        }
    }
    None
}

pub fn nearest_surface_distance(profile: &TerrainProfile, point: [f32; 2]) -> Option<f32> {
    nearest_surface_edge(profile, point).map(|(distance, _)| distance)
}

/// Riding-surface slope angle (radians, counter-clockwise from +x) at `x`, from a central
/// difference over the terrain height. `None` over a true gap.
pub fn terrain_slope_angle_at(profile: &TerrainProfile, x: f32) -> Option<f32> {
    const HALF_SPAN_M: f32 = 0.05;
    let left = terrain_height_at(profile, x - HALF_SPAN_M);
    let right = terrain_height_at(profile, x + HALF_SPAN_M);
    let center = terrain_height_at(profile, x);
    match (left, center, right) {
        (Some(left), _, Some(right)) => Some(libm::atan2f(right - left, 2.0 * HALF_SPAN_M)),
        (Some(left), Some(center), None) => Some(libm::atan2f(center - left, HALF_SPAN_M)),
        (None, Some(center), Some(right)) => Some(libm::atan2f(right - center, HALF_SPAN_M)),
        _ => None,
    }
}

pub fn nearest_surface_clearance(
    profile: &TerrainProfile,
    center: [f32; 2],
    radius: f32,
) -> Option<f32> {
    nearest_surface_edge(profile, center).map(|(distance, side)| {
        let clearance = distance - radius;
        if side < 0.0 && clearance < 0.0 {
            clearance
        } else {
            clearance.max(0.0)
        }
    })
}

fn nearest_surface_edge(profile: &TerrainProfile, point: [f32; 2]) -> Option<(f32, f32)> {
    let mut nearest: Option<(f32, f32)> = None;
    for segment in &profile.segments {
        for pair in segment.points.windows(2) {
            let dx = pair[1][0] - pair[0][0];
            let dy = pair[1][1] - pair[0][1];
            let length_squared = dx * dx + dy * dy;
            if length_squared <= f32::EPSILON {
                continue;
            }
            let alpha = (((point[0] - pair[0][0]) * dx + (point[1] - pair[0][1]) * dy)
                / length_squared)
                .clamp(0.0, 1.0);
            let closest = [pair[0][0] + alpha * dx, pair[0][1] + alpha * dy];
            let length = ComplexField::sqrt(length_squared);
            let offset_x = point[0] - closest[0];
            let offset_y = point[1] - closest[1];
            let side = offset_x * (-dy / length) + (point[1] - closest[1]) * (dx / length);
            let distance = ComplexField::sqrt(offset_x * offset_x + offset_y * offset_y);
            if nearest.is_none_or(|(current, _)| distance < current) {
                nearest = Some((distance, side));
            }
        }
    }
    nearest
}
