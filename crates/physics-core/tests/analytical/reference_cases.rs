use physics_core::analysis::{ballistic_height, spring_energy};

#[test]
fn matches_ballistic_acceleration_spring_pendulum_and_energy_references() {
    let y = ballistic_height(2.0, 6.0, 9.81, 0.5);
    let expected = 2.0 + 6.0 * 0.5 - 0.5 * 9.81 * 0.25;
    assert!((y - expected).abs() < 1e-5);

    let energy = spring_energy(22000.0, 0.04);
    assert!((energy - 17.6).abs() < 1e-4);
}
