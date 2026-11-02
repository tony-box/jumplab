use physics_core::geometry::inspect_bike_geometry;
use physics_core::scenario::{BikeFlavor, Scenario};
use physics_core::solver::solve_scenario;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

fn standard_scenario() -> Scenario {
    serde_json::from_str(STANDARD_SCENARIO).expect("valid standard scenario")
}

#[test]
fn every_editable_dimension_changes_canonical_geometry_deterministically() {
    let scenario = standard_scenario();
    let baseline = inspect_bike_geometry(&scenario.bike);
    let edits: [(&str, fn(&mut Scenario)); 16] = [
        ("wheelSize", |value| value.bike.wheel_size = 27.5),
        ("wheelbase", |value| value.bike.wheelbase += 0.01),
        ("chainstay", |value| value.bike.chainstay += 0.01),
        ("bbHeight", |value| value.bike.bb_height += 0.01),
        ("reach", |value| value.bike.geometry.reach += 0.01),
        ("stack", |value| value.bike.geometry.stack += 0.01),
        ("headTubeLength", |value| {
            value.bike.geometry.head_tube_length += 0.01
        }),
        ("headTubeAngle", |value| {
            value.bike.geometry.head_tube_angle += 0.01
        }),
        ("forkLength", |value| {
            value.bike.geometry.fork_length += 0.01
        }),
        ("forkOffset", |value| {
            value.bike.geometry.fork_offset += 0.005
        }),
        ("seatTubeLength", |value| {
            value.bike.geometry.seat_tube_length += 0.01
        }),
        ("seatTubeAngle", |value| {
            value.bike.geometry.seat_tube_angle += 0.01
        }),
        ("saddleHeight", |value| {
            value.bike.geometry.saddle_height += 0.01
        }),
        ("saddleSetback", |value| {
            value.bike.geometry.saddle_setback += 0.01
        }),
        ("crankLength", |value| {
            value.bike.geometry.crank_length += 0.005
        }),
        ("handlebarOffset", |value| {
            value.bike.geometry.handlebar_offset_x += 0.01
        }),
    ];

    for (name, edit) in edits {
        let mut changed = scenario.clone();
        edit(&mut changed);
        let first = inspect_bike_geometry(&changed.bike);
        let second = inspect_bike_geometry(&changed.bike);
        assert_eq!(first, second, "{name} inspection must be deterministic");
        assert_ne!(first, baseline, "{name} must affect canonical geometry");
    }

    let mut vertical_handlebar = scenario.clone();
    vertical_handlebar.bike.geometry.handlebar_offset_y += 0.01;
    assert_ne!(
        inspect_bike_geometry(&vertical_handlebar.bike),
        baseline,
        "handlebarOffsetY must affect canonical geometry"
    );
}

#[test]
fn reports_combined_invalid_geometry_and_frame_specific_members_stably() {
    let mut invalid = standard_scenario();
    invalid.bike.chainstay = 0.10;
    invalid.bike.bb_height = 0.50;
    invalid.bike.geometry.reach = 0.30;
    invalid.bike.geometry.fork_length = 0.30;
    let first = inspect_bike_geometry(&invalid.bike);
    let second = inspect_bike_geometry(&invalid.bike);
    let codes: Vec<&str> = first
        .issues
        .iter()
        .map(|issue| issue.code.as_str())
        .collect();

    assert_eq!(first, second);
    assert!(codes.contains(&"chainstay-bb-triangle"));
    assert!(codes.contains(&"steering-closure"));
    assert!(first.closure_residual > 0.010);

    for frame_type in [BikeFlavor::Rigid, BikeFlavor::Hardtail, BikeFlavor::Full] {
        let mut candidate = standard_scenario();
        candidate.bike.frame_type = frame_type.clone();
        candidate.bike.rear_shock = if matches!(frame_type, BikeFlavor::Full) {
            Some(candidate.bike.fork.clone())
        } else {
            None
        };
        let inspection = inspect_bike_geometry(&candidate.bike);
        let has_rear_shock = inspection
            .members
            .iter()
            .any(|member| member.name == "rearShock");
        assert_eq!(has_rear_shock, matches!(frame_type, BikeFlavor::Full));
    }
}

#[test]
fn geometry_changes_mass_distribution_and_reproducible_run_without_changing_total_mass() {
    let baseline_scenario = standard_scenario();
    let mut changed_scenario = baseline_scenario.clone();
    changed_scenario.bike.geometry.seat_tube_length += 0.03;

    let baseline_mass = inspect_bike_geometry(&baseline_scenario.bike).mass_properties;
    let changed_mass = inspect_bike_geometry(&changed_scenario.bike).mass_properties;
    assert_eq!(baseline_mass.total_mass, baseline_scenario.bike.mass);
    assert_eq!(changed_mass.total_mass, baseline_scenario.bike.mass);
    assert_ne!(
        baseline_mass.center_of_gravity,
        changed_mass.center_of_gravity
    );
    assert_ne!(baseline_mass.planar_inertia, changed_mass.planar_inertia);

    let baseline = solve_scenario(&baseline_scenario, "bike-designer-baseline")
        .expect("baseline geometry must solve");
    let changed = solve_scenario(&changed_scenario, "bike-designer-changed")
        .expect("changed geometry must solve");
    let repeated = solve_scenario(&changed_scenario, "bike-designer-repeated")
        .expect("changed geometry must solve repeatedly");

    assert_ne!(baseline.result_hash, changed.result_hash);
    assert_eq!(changed.result_hash, repeated.result_hash);
}
