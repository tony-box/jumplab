#[derive(Debug, Clone, Copy, PartialEq)]
pub struct JointActuator {
    pub min: f32,
    pub max: f32,
    pub kp: f32,
    pub kd: f32,
    pub tau_max: f32,
}

pub fn clamp_joint_target(target: f32, actuator: &JointActuator) -> f32 {
    target.clamp(actuator.min, actuator.max)
}

pub fn pd_torque(target: f32, position: f32, velocity: f32, actuator: &JointActuator) -> f32 {
    let error = clamp_joint_target(target, actuator) - position;
    let raw = actuator.kp * error - actuator.kd * velocity;
    raw.clamp(-actuator.tau_max, actuator.tau_max)
}
