use physics_core::bike::{BikeFlavor, build_bike_model};
use physics_core::scenario::Scenario;

const STANDARD_SCENARIO: &str =
    include_str!("../../../../tests/fixtures/scenarios/standard-v1.json");

#[test]
fn supports_rigid_hardtail_and_full_two_wheel_contact_geometry() {
    let mut scenario: Scenario =
        serde_json::from_str(STANDARD_SCENARIO).expect("valid scenario fixture");

    scenario.bike.frame_type = BikeFlavor::Rigid;
    let rigid = build_bike_model(&scenario.bike, &scenario.rider, true);

    scenario.bike.frame_type = BikeFlavor::Hardtail;
    let hardtail = build_bike_model(&scenario.bike, &scenario.rider, true);

    scenario.bike.frame_type = BikeFlavor::Full;
    scenario.bike.rear_shock = Some(scenario.bike.fork.clone());
    let full = build_bike_model(&scenario.bike, &scenario.rider, true);

    assert!(rigid.ccd_enabled && hardtail.ccd_enabled && full.ccd_enabled);
    assert_eq!(
        hardtail.combined_mass_kg,
        scenario.bike.mass + scenario.rider.mass
    );
    assert_eq!(hardtail.rear_axle.x, -scenario.bike.wheelbase * 0.5);
    assert_eq!(hardtail.front_axle.x, scenario.bike.wheelbase * 0.5);
    assert_eq!(hardtail.rear_axle.y, hardtail.wheel_radius_m);
}
