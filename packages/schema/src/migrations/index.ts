import { z } from "zod";

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

export const migrateScenarioValue = (input: unknown): unknown => {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const version = (input as Record<string, unknown>).schemaVersion;
  if (version === 1) return migrateScenarioValue(migrateScenarioValueV1(input));
  if (version === 2) return migrateScenarioValueV2(input);
  if (version === 3) return input;
  throw new Error(`Unsupported scenario schemaVersion: ${String(version)}`);
};

export const migrateScenarioFile = (input: unknown): unknown => {
  const envelope = migrationEnvelopeSchema.parse(input);

  if (envelope.schemaVersion === 1 || envelope.schemaVersion === 2) {
    return {
      ...envelope,
      schemaVersion: 3,
      scenario: migrateScenarioValue(envelope.scenario)
    };
  }

  if (envelope.schemaVersion === 3) return envelope;

  throw new Error(`Unsupported scenario file schemaVersion: ${envelope.schemaVersion}`);
};
