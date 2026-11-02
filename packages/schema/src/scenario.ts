import { z } from "zod";

import { hashScenario } from "./canonical";
import { migrateScenarioFile, migrateScenarioValue } from "./migrations/index";

const semverPattern = /^[0-9]+\.[0-9]+\.[0-9]+(?:[-+].+)?$/;
const hashPattern = /^[a-f0-9]{64}$/;

export const SCENARIO_FILE_FORMAT = "bike-jumper-scenario" as const;

const finiteNumber = z.number().refine(Number.isFinite, "Expected a finite number");

export const minimumLipAngle = (lipHeight: number, transitionLength: number): number =>
  Math.atan((1.5 * lipHeight) / transitionLength);

/** Drops roll off an edge instead of kicking, so their exit tangent may be level or falling. */
export const DROP_LIP_ANGLE_MIN = -0.35;
export const DROP_LIP_ANGLE_MAX = 0.35;
export const MAX_LIP_ANGLE = 1.5;

export const lipAngleRange = (jump: {
  kind?: string;
  lipHeight: number;
  transitionLength: number;
}): { minimum: number; maximum: number } =>
  jump.kind === "drop"
    ? { minimum: DROP_LIP_ANGLE_MIN, maximum: DROP_LIP_ANGLE_MAX }
    : {
        minimum: Math.max(0.05, minimumLipAngle(jump.lipHeight, jump.transitionLength)),
        maximum: MAX_LIP_ANGLE
      };

export const normalizeLipAngle = (
  jump: { kind?: string; lipHeight: number; lipAngle: number; transitionLength: number },
  step = 0.01
): number => {
  const { minimum, maximum } = lipAngleRange(jump);
  return Math.min(Math.max(jump.lipAngle, Math.ceil(minimum / step - 1e-9) * step), maximum);
};

export const jointLimitSchema = z
  .object({
    min: finiteNumber.min(-Math.PI).max(Math.PI),
    max: finiteNumber.min(-Math.PI).max(Math.PI),
    tauMax: finiteNumber.min(0).max(2000)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.min > value.max) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "joint min must be less than or equal to max",
        path: ["min"]
      });
    }
  });

export const suspensionSpecSchema = z
  .object({
    travel: finiteNumber.min(0).max(0.3),
    sag: finiteNumber.min(0).max(0.12),
    springRate: finiteNumber.min(0).max(100000),
    damping: finiteNumber.min(0).max(10000)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.sag > value.travel) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sag must be less than or equal to travel",
        path: ["sag"]
      });
    }
  });

export const jumpSpecSchema = z
  .object({
    kind: z.enum(["table", "gap", "stepup", "stepdown", "drop"]),
    lipHeight: finiteNumber.min(0.2).max(4),
    lipAngle: finiteNumber.min(DROP_LIP_ANGLE_MIN).max(MAX_LIP_ANGLE),
    transitionLength: finiteNumber.min(0.5).max(30),
    gap: finiteNumber.min(0).max(20),
    stepDelta: finiteNumber.min(-5).max(5),
    landingAngle: finiteNumber.min(0.05).max(1.2),
    landingLength: finiteNumber.min(1).max(40),
    rollout: finiteNumber.min(0).max(60)
  })
  .strict()
  .superRefine((value, context) => {
    const { minimum: minimumAngle, maximum: maximumAngle } = lipAngleRange(value);
    if (value.lipAngle + 1e-9 < minimumAngle) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `lipAngle must be at least ${minimumAngle.toFixed(3)} rad for this height and transition length`,
        path: ["lipAngle"]
      });
    }

    if (value.lipAngle - 1e-9 > maximumAngle) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `lipAngle must be at most ${maximumAngle.toFixed(3)} rad for a ${value.kind} jump`,
        path: ["lipAngle"]
      });
    }

    if ((value.kind === "table" || value.kind === "gap") && value.stepDelta !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stepDelta must be zero for table and gap jumps",
        path: ["stepDelta"]
      });
    }

    if (value.kind === "stepup" && value.stepDelta <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stepup jumps require a positive stepDelta",
        path: ["stepDelta"]
      });
    }

    if ((value.kind === "stepdown" || value.kind === "drop") && value.stepDelta >= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${value.kind} jumps require a negative stepDelta`,
        path: ["stepDelta"]
      });
    }
  });

export const riderSpecSchema = z
  .object({
    height: finiteNumber.min(1.2).max(2.2),
    mass: finiteNumber.min(35).max(160),
    legRatio: finiteNumber.min(0.35).max(0.6),
    armRatio: finiteNumber.min(0.3).max(0.5),
    strengthScale: finiteNumber.gt(0).max(3),
    kp: finiteNumber.min(0).max(5000),
    kd: finiteNumber.min(0).max(500),
    joints: z
      .object({
        knee: jointLimitSchema,
        hip: jointLimitSchema,
        spine: jointLimitSchema,
        shoulder: jointLimitSchema,
        elbow: jointLimitSchema
      })
      .strict()
  })
  .strict();

export const bikeGeometrySpecSchema = z
  .object({
    modelVersion: z.literal(1),
    reach: finiteNumber.min(0.3).max(0.6),
    stack: finiteNumber.min(0.45).max(0.8),
    headTubeLength: finiteNumber.min(0.06).max(0.25),
    headTubeAngle: finiteNumber.min(0.87).max(1.4),
    forkLength: finiteNumber.min(0.3).max(0.65),
    forkOffset: finiteNumber.min(0).max(0.1),
    seatTubeLength: finiteNumber.min(0.25).max(0.65),
    seatTubeAngle: finiteNumber.min(1.05).max(1.45),
    saddleHeight: finiteNumber.min(0.3).max(0.9),
    saddleSetback: finiteNumber.min(-0.15).max(0.25),
    crankLength: finiteNumber.min(0.145).max(0.19),
    handlebarOffsetX: finiteNumber.min(-0.1).max(0.3),
    handlebarOffsetY: finiteNumber.min(-0.15).max(0.25)
  })
  .strict();

export const bikeSpecSchema = z
  .object({
    frameType: z.enum(["rigid", "hardtail", "full"]),
    wheelSize: z.union([z.literal(26), z.literal(27.5), z.literal(29)]),
    wheelbase: finiteNumber.min(0.8).max(1.5),
    chainstay: finiteNumber.min(0.3).max(0.65),
    bbHeight: finiteNumber.min(0.2).max(0.5),
    mass: finiteNumber.min(5).max(30),
    fork: suspensionSpecSchema,
    rearShock: z.union([suspensionSpecSchema, z.null()]),
    geometry: bikeGeometrySpecSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.frameType === "full" && value.rearShock === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rearShock is required for full suspension frames",
        path: ["rearShock"]
      });
    }

    if (value.frameType !== "full" && value.rearShock !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rearShock must be null for rigid and hardtail frames",
        path: ["rearShock"]
      });
    }
  });

export const entrySpecSchema = z
  .object({
    speed: finiteNumber.min(0.5).max(30),
    startX: finiteNumber.min(-100).max(-0.1)
  })
  .strict();

export const poseTargetsSchema = z
  .object({
    knee: finiteNumber.min(-Math.PI).max(Math.PI),
    hip: finiteNumber.min(-Math.PI).max(Math.PI),
    spine: finiteNumber.min(-Math.PI).max(Math.PI)
  })
  .strict();

export const poseKeySchema = z
  .object({
    s: finiteNumber.min(-50).max(50),
    label: z.string().min(1).max(40),
    targets: poseTargetsSchema
  })
  .strict();

export const poseClipSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80),
    interpolation: z.enum(["cubic", "linear", "step"]),
    keys: z.array(poseKeySchema).min(2).max(64)
  })
  .strict()
  .superRefine((value, context) => {
    for (const [index, current] of value.keys.entries()) {
      if (index === 0) {
        continue;
      }

      const previous = value.keys[index - 1];
      if (!previous) {
        continue;
      }

      if (current.s <= previous.s) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "pose keys must be in strictly increasing s order",
          path: ["keys", index, "s"]
        });
      }
    }
  });

const supportedDt = z.union([
  z.literal(0.0010416666666666667),
  z.literal(0.0020833333333333333),
  z.literal(0.004166666666666667),
  z.literal(0.008333333333333333),
  z.literal(0.016666666666666666)
]);

const supportedOutputHz = z.union([
  z.literal(60),
  z.literal(120),
  z.literal(240),
  z.literal(480),
  z.literal(960)
]);

export const solverConfigSchema = z
  .object({
    dt: supportedDt,
    substeps: z.int().min(1).max(16),
    ccd: z.boolean(),
    seed: z.int().min(0).max(4294967295),
    outputHz: supportedOutputHz,
    solverVersion: z.string().min(1).max(80)
  })
  .strict()
  .superRefine((value, context) => {
    const physicsFrequency = (1 / value.dt) * value.substeps;
    const rounded = Math.round(physicsFrequency);
    const nearlyInteger = Math.abs(physicsFrequency - rounded) < 1e-9;

    if (!nearlyInteger || rounded % value.outputHz !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "outputHz must divide the fixed physics frequency exactly",
        path: ["outputHz"]
      });
    }
  });

export const scenarioSchema = z.preprocess(
  migrateScenarioValue,
  z
    .object({
      schemaVersion: z.literal(3),
      id: z.string().uuid(),
      name: z.string().min(1).max(80),
      jump: jumpSpecSchema,
      rider: riderSpecSchema,
      bike: bikeSpecSchema,
      entry: entrySpecSchema,
      poseClip: poseClipSchema,
      solver: solverConfigSchema
    })
    .strict()
);

export const versionStampSchema = z
  .object({
    appVersion: z.string().regex(semverPattern, "Expected semantic version"),
    solverVersion: z.string().min(1).max(80),
    exportedAt: z.string().datetime()
  })
  .strict();

export const scenarioFileSchema = z
  .object({
    format: z.literal(SCENARIO_FILE_FORMAT),
    schemaVersion: z.literal(3),
    exportedBy: versionStampSchema,
    scenario: scenarioSchema,
    contentHash: z.string().regex(hashPattern, "Expected lowercase SHA-256 hash")
  })
  .strict();

const migrationEnvelopeSchemaForHash = z
  .object({
    schemaVersion: z.number().int().positive(),
    scenario: z.unknown(),
    contentHash: z.string().regex(hashPattern)
  })
  .passthrough();

export type JointLimit = z.infer<typeof jointLimitSchema>;
export type SuspensionSpec = z.infer<typeof suspensionSpecSchema>;
export type JumpSpec = z.infer<typeof jumpSpecSchema>;
export type RiderSpec = z.infer<typeof riderSpecSchema>;
export type BikeGeometrySpec = z.infer<typeof bikeGeometrySpecSchema>;
export type BikeSpec = z.infer<typeof bikeSpecSchema>;
export type EntrySpec = z.infer<typeof entrySpecSchema>;
export type PoseTargets = z.infer<typeof poseTargetsSchema>;
export type PoseKey = z.infer<typeof poseKeySchema>;
export type PoseClip = z.infer<typeof poseClipSchema>;
export type SolverConfig = z.infer<typeof solverConfigSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type VersionStamp = z.infer<typeof versionStampSchema>;
export type ScenarioFile = z.infer<typeof scenarioFileSchema>;

export const parseScenario = (input: unknown): Scenario => scenarioSchema.parse(input);

export const parseScenarioFile = async (input: unknown): Promise<ScenarioFile> => {
  const original = migrationEnvelopeSchemaForHash.parse(input);
  const originalHash = await hashScenario(original.scenario);
  if (originalHash !== original.contentHash) {
    throw new Error("Scenario file content hash mismatch");
  }
  const migrated = migrateScenarioFile(input);
  const parsed = scenarioFileSchema.parse(migrated);
  const normalizedScenario = scenarioSchema.parse(parsed.scenario);

  return {
    ...parsed,
    scenario: normalizedScenario,
    contentHash: await hashScenario(normalizedScenario)
  };
};
