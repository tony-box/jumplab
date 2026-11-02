/**
 * Version identities shared with the Rust physics core (`crates/physics-core/src/version.rs`).
 * The worker compares these against the core's own report at startup.
 */
export const SCENARIO_SCHEMA_VERSION = 4 as const;
export const PROTOCOL_VERSION = 4 as const;
export const FRAME_LAYOUT_VERSION = 3 as const;
export const TELEMETRY_LAYOUT_VERSION = 2 as const;
export const MODEL_VERSION = "two-body-rider-coupling-v1-geometry-v1-mass-distribution-v2";
export const SOLVER_VERSION = "rapier-0.35.2-two-body-v6-geometry-v1-mass-distribution-v2";
