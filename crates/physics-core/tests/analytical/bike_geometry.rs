use physics_core::geometry::{BikeMember, Point2, inspect_bike_geometry};
use physics_core::inspect_bike_geometry_json;
use physics_core::scenario::{BikeFlavor, BikeSpec, Scenario};
use serde_json::json;

const EPSILON: f32 = 1.0e-5;

fn valid_bike(frame_type: BikeFlavor) -> BikeSpec {
    let rear_shock = if matches!(frame_type, BikeFlavor::Full) {
        json!({
            "travel": 0.15,
            "sag": 0.035,
            "springRate": 21000.0,
            "damping": 1450.0
        })
    } else {
        serde_json::Value::Null
    };

    serde_json::from_value(json!({
        "frameType": match frame_type {
            BikeFlavor::Rigid => "rigid",
            BikeFlavor::Hardtail => "hardtail",
            BikeFlavor::Full => "full"
        },
        "wheelSize": 29.0,
        "wheelbase": 1.25,
        "chainstay": 0.44,
        "bbHeight": 0.33,
        "mass": 14.0,
        "fork": {
            "travel": 0.15,
            "sag": 0.035,
            "springRate": 21000.0,
            "damping": 1450.0
        },
        "rearShock": rear_shock,
        "geometry": {
            "modelVersion": 1,
            "reach": 0.47,
            "stack": 0.63,
            "headTubeLength": 0.11,
            "headTubeAngle": 1.134464,
            "forkLength": 0.5706583,
            "forkOffset": 0.05,
            "seatTubeLength": 0.322,
            "seatTubeAngle": 1.3264502,
            "saddleHeight": 0.46,
            "saddleSetback": 0.0,
            "crankLength": 0.17,
            "handlebarOffsetX": 0.05,
            "handlebarOffsetY": 0.03
        }
    }))
    .expect("valid bike fixture")
}

fn assert_point(actual: Point2, expected: Point2) {
    assert!((actual.x - expected.x).abs() <= EPSILON, "x: {actual:?}");
    assert!((actual.y - expected.y).abs() <= EPSILON, "y: {actual:?}");
}

fn member<'a>(members: &'a [BikeMember], name: &str) -> &'a BikeMember {
    members
        .iter()
        .find(|member| member.name == name)
        .unwrap_or_else(|| panic!("missing member {name}"))
}

#[test]
fn constructs_axles_bottom_bracket_reach_and_stack_analytically() {
    let bike = valid_bike(BikeFlavor::Hardtail);
    let inspection = inspect_bike_geometry(&bike);
    let radius = 29.0 * 0.0254 * 0.5;
    let rear_axle = Point2::new(-0.625, radius);
    let front_axle = Point2::new(0.625, radius);
    let bb_x = rear_axle.x + (0.44_f32.powi(2) - (0.33_f32 - radius).powi(2)).sqrt();
    let bottom_bracket = Point2::new(bb_x, 0.33);

    assert!(inspection.valid, "{:?}", inspection.issues);
    assert_point(inspection.landmarks["rearAxle"], rear_axle);
    assert_point(inspection.landmarks["frontAxle"], front_axle);
    assert_point(inspection.landmarks["bottomBracket"], bottom_bracket);
    assert_point(
        inspection.landmarks["headTubeTop"],
        Point2::new(bottom_bracket.x + 0.47, bottom_bracket.y + 0.63),
    );
}

#[test]
fn constructs_seat_and_steering_axes_and_reports_closure() {
    let bike = valid_bike(BikeFlavor::Hardtail);
    let inspection = inspect_bike_geometry(&bike);
    let geometry = &bike.geometry;
    let bottom_bracket = inspection.landmarks["bottomBracket"];
    let head_top = inspection.landmarks["headTubeTop"];
    let head_axis = Point2::new(
        geometry.head_tube_angle.cos(),
        -geometry.head_tube_angle.sin(),
    );
    let seat_axis = Point2::new(
        -geometry.seat_tube_angle.cos(),
        geometry.seat_tube_angle.sin(),
    );

    assert_point(
        inspection.landmarks["headTubeBottom"],
        Point2::new(
            head_top.x + geometry.head_tube_length * head_axis.x,
            head_top.y + geometry.head_tube_length * head_axis.y,
        ),
    );
    assert_point(
        inspection.landmarks["seatTubeTop"],
        Point2::new(
            bottom_bracket.x + geometry.seat_tube_length * seat_axis.x,
            bottom_bracket.y + geometry.seat_tube_length * seat_axis.y,
        ),
    );
    assert!(inspection.closure_residual <= 0.010);
    assert!(
        (inspection.closure_residual - 0.009595).abs() <= 2.0e-5,
        "{}",
        inspection.closure_residual
    );
    assert_point(
        member(&inspection.members, "fork").end,
        inspection.landmarks["frontAxle"],
    );
}

#[test]
fn emits_connected_members_and_frame_specific_rear_hardware() {
    for frame_type in [BikeFlavor::Rigid, BikeFlavor::Hardtail, BikeFlavor::Full] {
        let inspection = inspect_bike_geometry(&valid_bike(frame_type.clone()));

        for name in [
            "chainstay",
            "seatstay",
            "seatTube",
            "topTube",
            "downTube",
            "headTube",
            "fork",
            "seatSupport",
            "crankForward",
            "crankRearward",
            "stemHandlebar",
        ] {
            let member = member(&inspection.members, name);
            assert!(member.start.is_finite() && member.end.is_finite());
            assert!(member.start.distance(&member.end) > 0.0, "{name}");
        }

        let has_rear_shock = inspection
            .members
            .iter()
            .any(|member| member.name == "rearShock");
        assert_eq!(has_rear_shock, matches!(frame_type, BikeFlavor::Full));
    }
}

#[test]
fn emits_protected_shapes_for_every_present_member_and_contact() {
    let inspection = inspect_bike_geometry(&valid_bike(BikeFlavor::Full));
    let parts: Vec<&str> = inspection
        .protected_shapes
        .iter()
        .map(|shape| shape.part.as_str())
        .collect();

    for required in [
        "rearTire",
        "frontTire",
        "chainstay",
        "topTube",
        "fork",
        "saddle",
        "pedalForward",
        "handlebar",
        "rearShock",
    ] {
        assert!(
            parts.contains(&required),
            "missing protected part {required}"
        );
    }
}

#[test]
fn orders_range_triangle_closure_and_relationship_issues_deterministically() {
    let mut bike = valid_bike(BikeFlavor::Rigid);
    bike.geometry.reach = 0.2;
    bike.chainstay = 0.1;
    bike.bb_height = 0.5;
    bike.geometry.fork_length = 0.3;
    bike.rear_shock = Some(bike.fork.clone());

    let first = inspect_bike_geometry(&bike);
    let second = inspect_bike_geometry(&bike);
    let codes: Vec<&str> = first
        .issues
        .iter()
        .map(|issue| issue.code.as_str())
        .collect();

    assert_eq!(first.issues, second.issues);
    assert_eq!(
        codes,
        [
            "field-range",
            "field-range",
            "chainstay-bb-triangle",
            "steering-closure",
            "frame-suspension-relationship"
        ]
    );
}

#[test]
fn preserves_authored_mass_and_derives_geometry_dependent_cog_and_inertia() {
    let bike = valid_bike(BikeFlavor::Full);
    let baseline = inspect_bike_geometry(&bike).mass_properties;
    let mut longer = bike.clone();
    longer.geometry.reach += 0.04;
    longer.geometry.fork_length += 0.017;
    let changed = inspect_bike_geometry(&longer).mass_properties;

    assert_eq!(baseline.total_mass, bike.mass);
    assert_eq!(changed.total_mass, bike.mass);
    assert!(baseline.center_of_gravity.is_finite());
    assert!(baseline.planar_inertia > 0.0);
    assert_ne!(baseline.center_of_gravity, changed.center_of_gravity);
    assert_ne!(baseline.planar_inertia, changed.planar_inertia);
}

#[test]
fn requires_strict_geometry_input_and_rejects_semantically_invalid_scenarios() {
    let bike = valid_bike(BikeFlavor::Hardtail);
    let mut bike_value = serde_json::to_value(&bike).unwrap();
    bike_value["geometry"]["unexpected"] = json!(true);
    assert!(serde_json::from_value::<BikeSpec>(bike_value).is_err());

    let mut missing_geometry = serde_json::to_value(&bike).unwrap();
    missing_geometry.as_object_mut().unwrap().remove("geometry");
    assert!(serde_json::from_value::<BikeSpec>(missing_geometry).is_err());

    let mut scenario_value: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/scenarios/standard-v1.json"
    ))
    .unwrap();
    scenario_value["bike"] = serde_json::to_value(&bike).unwrap();
    let mut scenario: Scenario = serde_json::from_value(scenario_value).unwrap();
    scenario.bike.geometry.reach = 0.2;
    assert!(scenario.validate().unwrap_err().contains("field-range"));
}

#[test]
fn serializes_deterministic_camel_case_inspection_output() {
    let bike_json = serde_json::to_string(&valid_bike(BikeFlavor::Full)).unwrap();
    let first = inspect_bike_geometry_json(&bike_json).expect("geometry inspection");
    let second = inspect_bike_geometry_json(&bike_json).expect("geometry inspection");
    let output: serde_json::Value = serde_json::from_str(&first).unwrap();

    assert_eq!(first, second);
    assert_eq!(output["modelVersion"], 1);
    assert_eq!(output["valid"], true);
    assert!(output.get("closureResidual").is_some());
    assert_eq!(output["massProperties"]["totalMass"], 14.0);
    assert_eq!(output["massProperties"]["distributionVersion"], 2);
    let ring = output["protectedShapes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|shape| shape["shape"] == "ring")
        .unwrap();
    assert!(ring.get("innerRadius").is_some());
    assert!(ring.get("outerRadius").is_some());
}
