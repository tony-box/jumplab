use std::collections::BTreeMap;

use crate::geometry::{BikeMember, Point2};
use crate::pose::AchievedPoseLandmarks;
use crate::scenario::{BikeSpec, RiderSpec};

pub use crate::scenario::BikeFlavor;

pub const BIKE_MASS_DISTRIBUTION_VERSION: u32 = 1;

#[derive(Debug, Clone, Copy, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BikeMassProperties {
    pub total_mass: f32,
    pub center_of_gravity: Point2,
    pub planar_inertia: f32,
    pub distribution_version: u32,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CombinedMassProperties {
    pub total_mass: f32,
    pub center_of_gravity: Point2,
    pub planar_inertia: f32,
}

#[derive(Debug, Clone, Copy)]
struct MassElement {
    mass: f32,
    center: Point2,
    local_inertia: f32,
}

pub fn derive_bike_mass_properties(
    spec: &BikeSpec,
    landmarks: &BTreeMap<String, Point2>,
    members: &[BikeMember],
) -> BikeMassProperties {
    let total_mass = spec.mass;
    let mut elements = Vec::new();

    add_member_group(
        &mut elements,
        members,
        &["chainstay", "seatstay", "seatTube", "topTube", "downTube"],
        total_mass * 0.24,
    );
    add_wheel(
        &mut elements,
        total_mass * 0.10,
        point(landmarks, "rearAxle"),
    );
    add_wheel(
        &mut elements,
        total_mass * 0.09,
        point(landmarks, "frontAxle"),
    );
    add_member_group(
        &mut elements,
        members,
        &["headTube", "fork"],
        total_mass * 0.15,
    );
    add_member_group(
        &mut elements,
        members,
        &["stemHandlebar"],
        total_mass * 0.07,
    );

    let bottom_bracket = point(landmarks, "bottomBracket");
    let rear_axle = point(landmarks, "rearAxle");
    elements.push(MassElement {
        mass: total_mass * 0.15,
        center: bottom_bracket,
        local_inertia: 0.0,
    });
    elements.push(MassElement {
        mass: total_mass * 0.05,
        center: bottom_bracket.midpoint(&rear_axle),
        local_inertia: 0.0,
    });
    add_member_group(&mut elements, members, &["seatSupport"], total_mass * 0.03);
    elements.push(MassElement {
        mass: total_mass * 0.03,
        center: point(landmarks, "saddleCenter"),
        local_inertia: total_mass * 0.03 * 0.26_f32.powi(2) / 12.0,
    });
    elements.push(MassElement {
        mass: total_mass * 0.09,
        center: rear_axle.midpoint(&point(landmarks, "seatTubeTop")),
        local_inertia: 0.0,
    });

    let mass_denominator = if total_mass.abs() > f32::EPSILON {
        total_mass
    } else {
        1.0
    };
    let center_of_gravity = Point2::new(
        elements
            .iter()
            .map(|element| element.mass * element.center.x)
            .sum::<f32>()
            / mass_denominator,
        elements
            .iter()
            .map(|element| element.mass * element.center.y)
            .sum::<f32>()
            / mass_denominator,
    );
    let planar_inertia = elements
        .iter()
        .map(|element| {
            let distance = element.center.distance(&center_of_gravity);
            element.local_inertia + element.mass * distance * distance
        })
        .sum();

    BikeMassProperties {
        total_mass,
        center_of_gravity,
        planar_inertia,
        distribution_version: BIKE_MASS_DISTRIBUTION_VERSION,
    }
}

pub fn rider_mass_properties(
    rider: &RiderSpec,
    landmarks: &AchievedPoseLandmarks,
) -> (Point2, f32) {
    let rider_elements = [
        segment_element(rider.mass * 0.50, landmarks.hip, landmarks.shoulder),
        point_element(rider.mass * 0.08, landmarks.head),
        segment_element(rider.mass * 0.20, landmarks.hip, landmarks.knee),
        segment_element(rider.mass * 0.12, landmarks.knee, landmarks.ankle),
        segment_element(rider.mass * 0.06, landmarks.shoulder, landmarks.elbow),
        segment_element(rider.mass * 0.04, landmarks.elbow, landmarks.hand),
    ];
    let rider_center = weighted_center(&rider_elements, rider.mass);
    (rider_center, inertia_about(&rider_elements, rider_center))
}

pub fn combine_bike_and_rider_mass_properties(
    bike: BikeMassProperties,
    rider: &RiderSpec,
    landmarks: &AchievedPoseLandmarks,
) -> CombinedMassProperties {
    let (rider_center, rider_inertia) = rider_mass_properties(rider, landmarks);
    let total_mass = bike.total_mass + rider.mass;
    let center_of_gravity = Point2::new(
        (bike.total_mass * bike.center_of_gravity.x + rider.mass * rider_center.x) / total_mass,
        (bike.total_mass * bike.center_of_gravity.y + rider.mass * rider_center.y) / total_mass,
    );
    let bike_offset = bike.center_of_gravity.distance(&center_of_gravity);
    let rider_offset = rider_center.distance(&center_of_gravity);

    CombinedMassProperties {
        total_mass,
        center_of_gravity,
        planar_inertia: bike.planar_inertia
            + bike.total_mass * bike_offset * bike_offset
            + rider_inertia
            + rider.mass * rider_offset * rider_offset,
    }
}

fn point_element(mass: f32, center: Point2) -> MassElement {
    MassElement {
        mass,
        center,
        local_inertia: 0.0,
    }
}

fn segment_element(mass: f32, start: Point2, end: Point2) -> MassElement {
    let length = start.distance(&end);
    MassElement {
        mass,
        center: start.midpoint(&end),
        local_inertia: mass * length * length / 12.0,
    }
}

fn weighted_center(elements: &[MassElement], total_mass: f32) -> Point2 {
    Point2::new(
        elements
            .iter()
            .map(|element| element.mass * element.center.x)
            .sum::<f32>()
            / total_mass,
        elements
            .iter()
            .map(|element| element.mass * element.center.y)
            .sum::<f32>()
            / total_mass,
    )
}

fn inertia_about(elements: &[MassElement], center: Point2) -> f32 {
    elements
        .iter()
        .map(|element| {
            let distance = element.center.distance(&center);
            element.local_inertia + element.mass * distance * distance
        })
        .sum()
}

fn point(landmarks: &BTreeMap<String, Point2>, name: &str) -> Point2 {
    landmarks.get(name).copied().unwrap_or_default()
}

/// Wheels spin on bearings, so their own rotational inertia does not resist frame pitch: each
/// wheel contributes only its mass at the axle.
fn add_wheel(elements: &mut Vec<MassElement>, mass: f32, center: Point2) {
    elements.push(MassElement {
        mass,
        center,
        local_inertia: 0.0,
    });
}

fn add_member_group(
    elements: &mut Vec<MassElement>,
    members: &[BikeMember],
    names: &[&str],
    group_mass: f32,
) {
    let selected: Vec<&BikeMember> = members
        .iter()
        .filter(|member| names.contains(&member.name.as_str()))
        .collect();
    let total_length: f32 = selected.iter().map(|member| member.length()).sum();
    if total_length <= f32::EPSILON {
        elements.push(MassElement {
            mass: group_mass,
            center: Point2::default(),
            local_inertia: 0.0,
        });
        return;
    }

    for member in selected {
        let length = member.length();
        let mass = group_mass * length / total_length;
        elements.push(MassElement {
            mass,
            center: member.start.midpoint(&member.end),
            local_inertia: mass * length * length / 12.0,
        });
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct BikeModel {
    pub flavor: BikeFlavor,
    pub wheel_radius_m: f32,
    pub wheelbase_m: f32,
    pub rear_axle: Point2,
    pub front_axle: Point2,
    pub combined_mass_kg: f32,
    pub ccd_enabled: bool,
    pub has_rear_suspension: bool,
    pub tire_friction: f32,
}

pub fn build_bike_model(spec: &BikeSpec, rider: &RiderSpec, ccd_enabled: bool) -> BikeModel {
    let wheel_radius_m = (spec.wheel_size * 0.0254) * 0.5;
    let has_rear_suspension =
        matches!(spec.frame_type, BikeFlavor::Full) && spec.rear_shock.is_some();

    BikeModel {
        flavor: spec.frame_type.clone(),
        wheel_radius_m,
        wheelbase_m: spec.wheelbase,
        rear_axle: Point2::new(-spec.wheelbase * 0.5, wheel_radius_m),
        front_axle: Point2::new(spec.wheelbase * 0.5, wheel_radius_m),
        combined_mass_kg: spec.mass + rider.mass,
        ccd_enabled,
        has_rear_suspension,
        tire_friction: 0.0,
    }
}
