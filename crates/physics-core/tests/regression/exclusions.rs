use physics_core::solver::solver_invariants;

#[test]
fn enforces_zero_drag_zero_friction_and_zero_unmodeled_damping() {
    let invariants = solver_invariants();
    assert_eq!(invariants.aero_drag_coefficient, 0.0);
    assert_eq!(invariants.contact_friction_coefficient, 0.0);
    assert_eq!(invariants.unmodeled_linear_damping, 0.0);
    assert_eq!(invariants.unmodeled_angular_damping, 0.0);
}
