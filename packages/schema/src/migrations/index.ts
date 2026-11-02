import { z } from "zod";

import { SCENARIO_SCHEMA_VERSION, SOLVER_VERSION } from "../versions";

const migrationEnvelopeSchema = z
  .object({
    format: z.literal("bike-jumper-scenario"),
    schemaVersion: z.number().int().positive()
  })
  .passthrough();

const V2_GEOMETRY = {
  modelVersion: 1 as const,
  reach: 0.47,
  stack: 0.63,
  headTubeLength: 0.11,
  headTubeAngle: (65 * Math.PI) / 180,
  forkOffset: 0.05,
  seatTubeLength: 0.46 * 0.7,
  seatTubeAngle: (76 * Math.PI) / 180,
  saddleHeight: 0.46,
  saddleSetback: 0,
  crankLength: 0.17,
  handlebarOffsetX: 0.05,
  handlebarOffsetY: 0.03
};

const migrateScenarioValueV1 = (input: unknown): unknown => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const scenario = input as Record<string, unknown>;
  const jump = scenario.jump;
  if (!jump || typeof jump !== "object" || Array.isArray(jump)) return input;
  const legacyJump = jump as Record<string, unknown>;
  const radius = legacyJump.transitionRadius;
  const angle = legacyJump.lipAngle;
  if (typeof radius !== "number" || typeof angle !== "number") return input;

  const { transitionRadius: _removed, ...currentJump } = legacyJump;
  const transitionLength = radius * Math.max(angle, 0.05);
  const height = typeof legacyJump.lipHeight === "number" ? legacyJump.lipHeight : 0;
  const minimumAngle = Math.atan((1.5 * height) / transitionLength);
  return {
    ...scenario,
    schemaVersion: 2,
    jump: {
      ...currentJump,
      lipAngle: Math.max(angle, minimumAngle),
      transitionLength
    }
  };
};

const migrateScenarioValueV2 = (input: unknown): unknown => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const scenario = input as Record<string, unknown>;
  const bikeValue = scenario.bike;
  if (!bikeValue || typeof bikeValue !== "object" || Array.isArray(bikeValue)) return input;
  const bike = bikeValue as Record<string, unknown>;
  const { wheelSize, wheelbase, chainstay, bbHeight } = bike;
  if (
    typeof wheelSize !== "number" ||
    typeof wheelbase !== "number" ||
    typeof chainstay !== "number" ||
    typeof bbHeight !== "number"
  ) {
    return input;
  }

  const wheelRadius = wheelSize * 0.0254 * 0.5;
  const rearAxleX = -wheelbase * 0.5;
  const frontAxleX = wheelbase * 0.5;
  const bbRise = bbHeight - wheelRadius;
  const bbRun = Math.sqrt(Math.max(0, chainstay * chainstay - bbRise * bbRise));
  const bottomBracketX = rearAxleX + bbRun;
  const headAxisX = Math.cos(V2_GEOMETRY.headTubeAngle);
  const headAxisY = -Math.sin(V2_GEOMETRY.headTubeAngle);
  const offsetAxisX = -headAxisY;
  const offsetAxisY = headAxisX;
  const headTubeTopX = bottomBracketX + V2_GEOMETRY.reach;
  const headTubeTopY = bbHeight + V2_GEOMETRY.stack;
  const forkCrownX = headTubeTopX + V2_GEOMETRY.headTubeLength * headAxisX;
  const forkCrownY = headTubeTopY + V2_GEOMETRY.headTubeLength * headAxisY;
  const forkTargetX = frontAxleX - V2_GEOMETRY.forkOffset * offsetAxisX;
  const forkTargetY = wheelRadius - V2_GEOMETRY.forkOffset * offsetAxisY;
  const forkLength =
    (forkTargetX - forkCrownX) * headAxisX + (forkTargetY - forkCrownY) * headAxisY;

  return {
    ...scenario,
    schemaVersion: 3,
    bike: {
      ...bike,
      geometry: {
        ...V2_GEOMETRY,
        forkLength
      }
    }
  };
};

/** Rider coupling defaults introduced with the two-body model (scenario schema 4). */
export const DEFAULT_RIDER_COUPLING = Object.freeze({
  linearFrequency: 30,
  pitchFrequency: 25,
  dampingRatio: 1,
  foreAftStrength: 1.5,
  verticalStrength: 3,
  pitchLever: 0.4
});

export const DEFAULT_RIDER_INSTINCT = Object.freeze({
  enabled: true,
  maxOffset: 0.1,
  maxAngle: 0.17
});

/** Kicker transitions are circular arcs: a run of h·cot(θ/2) for height h and lip angle θ. */
export const kickerTransitionLength = (lipHeight: number, lipAngle: number): number =>
  lipHeight / Math.tan(0.5 * lipAngle);

export const KICKER_TRANSITION_MIN = 0.5;
export const KICKER_TRANSITION_MAX = 30;
const MIN_PHYSICS_HZ = 240;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * Schema 3 -> 4: kickers become circular arcs whose length follows from height and lip angle,
 * the rider gains coupling settings, unused actuator gains and the solver seed are dropped,
 * and the physics rate is raised to the 240 Hz minimum.
 */
const migrateScenarioValueV3 = (input: unknown): unknown => {
  const scenario = asRecord(input);
  const jump = asRecord(scenario?.jump);
  const rider = asRecord(scenario?.rider);
  const solver = asRecord(scenario?.solver);
  if (!scenario || !jump || !rider || !solver) {
    throw new Error("Cannot migrate scenario schema 3: jump, rider, and solver are required");
  }

  let migratedJump = jump;
  const { kind, lipHeight, lipAngle } = jump;
  if (kind !== "drop" && typeof lipHeight === "number" && typeof lipAngle === "number") {
    const derived = kickerTransitionLength(lipHeight, lipAngle);
    const length = Math.min(Math.max(derived, KICKER_TRANSITION_MIN), KICKER_TRANSITION_MAX);
    migratedJump = {
      ...jump,
      // Only a clamped length changes the arc; recomputing otherwise can drift past angle limits.
      lipAngle: length === derived ? lipAngle : 2 * Math.atan(lipHeight / length),
      transitionLength: length
    };
  }

  const { kp: _kp, kd: _kd, joints, ...riderRest } = rider;
  const jointRecord = asRecord(joints) ?? {};
  const migratedJoints = Object.fromEntries(
    Object.entries(jointRecord).map(([name, limit]) => {
      const { tauMax: _tauMax, ...range } = asRecord(limit) ?? {};
      return [name, range];
    })
  );

  const { seed: _seed, ...solverRest } = solver;
  const dt = typeof solver.dt === "number" ? solver.dt : 1 / 240;
  const substeps = typeof solver.substeps === "number" ? solver.substeps : 1;
  const minimumSubsteps = Math.ceil(MIN_PHYSICS_HZ * dt - 1e-9);

  return {
    ...scenario,
    schemaVersion: 4,
    jump: migratedJump,
    rider: { ...riderRest, coupling: { ...DEFAULT_RIDER_COUPLING }, joints: migratedJoints },
    solver: {
      ...solverRest,
      substeps: Math.max(substeps, minimumSubsteps),
      solverVersion: SOLVER_VERSION,
      riderInstinct: { ...DEFAULT_RIDER_INSTINCT }
    }
  };
};

const scenarioMigrations: Record<number, (input: unknown) => unknown> = {
  1: migrateScenarioValueV1,
  2: migrateScenarioValueV2,
  3: migrateScenarioValueV3
};

const schemaVersionOf = (value: unknown): unknown => asRecord(value)?.schemaVersion;

export const migrateScenarioValue = (input: unknown): unknown => {
  if (!asRecord(input)) return input;
  let current = input;
  let version = schemaVersionOf(current);
  while (version !== SCENARIO_SCHEMA_VERSION) {
    const migrate = typeof version === "number" ? scenarioMigrations[version] : undefined;
    if (!migrate) {
      throw new Error(`Unsupported scenario schemaVersion: ${String(version)}`);
    }
    const next = migrate(current);
    const nextVersion = schemaVersionOf(next);
    if (typeof nextVersion !== "number" || nextVersion <= (version as number)) {
      throw new Error(`Cannot migrate scenario schemaVersion ${String(version)}`);
    }
    current = next;
    version = nextVersion;
  }
  return current;
};

export const migrateScenarioFile = (input: unknown): unknown => {
  const envelope = migrationEnvelopeSchema.parse(input);
  if (envelope.schemaVersion === SCENARIO_SCHEMA_VERSION) return envelope;
  if (envelope.schemaVersion > SCENARIO_SCHEMA_VERSION) {
    throw new Error(`Unsupported scenario file schemaVersion: ${envelope.schemaVersion}`);
  }
  return {
    ...envelope,
    schemaVersion: SCENARIO_SCHEMA_VERSION,
    scenario: migrateScenarioValue(envelope.scenario)
  };
};
