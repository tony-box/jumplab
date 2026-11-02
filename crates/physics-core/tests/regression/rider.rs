use physics_core::rider::{JointActuator, clamp_joint_target, pd_torque};

#[test]
fn applies_joint_limits_pd_motor_and_torque_caps() {
    let actuator = JointActuator {
        min: -0.5,
        max: 0.5,
        kp: 120.0,
        kd: 10.0,
        tau_max: 35.0,
    };

    let target = clamp_joint_target(1.2, &actuator);
    assert_eq!(target, 0.5);

    let torque = pd_torque(target, -0.25, -3.0, &actuator);
    assert!(torque.abs() <= actuator.tau_max + f32::EPSILON);
}
