import { z } from "zod";

import { poseTargetsSchema } from "./scenario";

const hashPattern = /^[a-f0-9]{64}$/;

const finiteNumber = z.number().refine(Number.isFinite, "Expected a finite number");

export const FRAME_LAYOUT_VERSION = 2 as const;
export const FRAME_STRIDE_FLOAT32 = 36 as const;

export const FRAME_LAYOUT_FIELDS = [
  { name: "t", offset: 0, length: 1 },
  { name: "x", offset: 1, length: 1 },
  { name: "y", offset: 2, length: 1 },
  { name: "pitch", offset: 3, length: 1 },
  { name: "vx", offset: 4, length: 1 },
  { name: "vy", offset: 5, length: 1 },
  { name: "airborne", offset: 6, length: 1 },
  { name: "contactImpulse", offset: 7, length: 1 },
  { name: "shoulder", offset: 8, length: 1 },
  { name: "elbow", offset: 9, length: 1 },
  { name: "knee", offset: 10, length: 1 },
  { name: "hip", offset: 11, length: 1 },
  { name: "spine", offset: 12, length: 1 },
  { name: "pedalContactX", offset: 13, length: 1 },
  { name: "pedalContactY", offset: 14, length: 1 },
  { name: "ankleX", offset: 15, length: 1 },
  { name: "ankleY", offset: 16, length: 1 },
  { name: "kneeX", offset: 17, length: 1 },
  { name: "kneeY", offset: 18, length: 1 },
  { name: "hipX", offset: 19, length: 1 },
  { name: "hipY", offset: 20, length: 1 },
  { name: "shoulderX", offset: 21, length: 1 },
  { name: "shoulderY", offset: 22, length: 1 },
  { name: "elbowX", offset: 23, length: 1 },
  { name: "elbowY", offset: 24, length: 1 },
  { name: "handX", offset: 25, length: 1 },
  { name: "handY", offset: 26, length: 1 },
  { name: "handlebarContactX", offset: 27, length: 1 },
  { name: "handlebarContactY", offset: 28, length: 1 },
  { name: "headX", offset: 29, length: 1 },
  { name: "headY", offset: 30, length: 1 },
  { name: "groundedRear", offset: 31, length: 1 },
  { name: "groundedFront", offset: 32, length: 1 },
  { name: "normalForceRear", offset: 33, length: 1 },
  { name: "normalForceFront", offset: 34, length: 1 },
  { name: "minClearance", offset: 35, length: 1 }
] as const;

export const phaseNameSchema = z.enum([
  "approach",
  "transition",
  "takeoff",
  "flight",
  "landing",
  "rollout"
]);

export const phaseSchema = z
  .object({
    name: phaseNameSchema,
    startFrame: z.int().min(0),
    endFrame: z.int().min(0)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.startFrame > value.endFrame) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startFrame must be less than or equal to endFrame",
        path: ["startFrame"]
      });
    }
  });

export const phasesSchema = z.array(phaseSchema).superRefine((value, context) => {
  for (const [index, current] of value.entries()) {
    if (index === 0) {
      continue;
    }

    const previous = value[index - 1];
    if (!previous) {
      continue;
    }

    if (current.startFrame <= previous.endFrame) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "phase intervals must be non-overlapping and strictly ordered",
        path: [index, "startFrame"]
      });
    }

    if (current.startFrame < previous.startFrame) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "phase startFrame values must be ascending",
        path: [index, "startFrame"]
      });
    }
  }
});

export const metricSchema = z
  .object({
    value: z.union([finiteNumber, z.null()]),
    unit: z.string().min(1),
    source: z.enum(["measured", "estimate", "pending-core"]),
    reason: z.union([z.string().min(1), z.null()])
  })
  .strict()
  .superRefine((value, context) => {
    if (value.source === "measured") {
      if (value.value === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "measured metrics require a numeric value",
          path: ["value"]
        });
      }
      if (value.reason !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "measured metrics must not provide a reason",
          path: ["reason"]
        });
      }
      return;
    }

    if (value.reason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "estimate and pending-core metrics require a reason",
        path: ["reason"]
      });
    }
  });

export const frameLayoutFieldSchema = z
  .object({
    name: z.string().min(1),
    offset: z.int().min(0),
    length: z.int().min(1)
  })
  .strict();

export const frameLayoutSchema = z
  .object({
    version: z.literal(FRAME_LAYOUT_VERSION),
    strideFloat32: z.literal(FRAME_STRIDE_FLOAT32),
    fields: z.array(frameLayoutFieldSchema).min(1)
  })
  .strict()
  .superRefine((value, context) => {
    if (value.fields.length !== FRAME_LAYOUT_FIELDS.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `frame layout v2 requires ${FRAME_LAYOUT_FIELDS.length} fields`,
        path: ["fields"]
      });
    }

    for (const [index, expected] of FRAME_LAYOUT_FIELDS.entries()) {
      const actual = value.fields[index];
      if (
        !actual ||
        actual.name !== expected.name ||
        actual.offset !== expected.offset ||
        actual.length !== expected.length
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `frame layout v2 field ${index} must be ${expected.name} at offset ${expected.offset}`,
          path: ["fields", index]
        });
      }
    }

    const sorted = [...value.fields].sort((left, right) => left.offset - right.offset);

    for (const [index, field] of sorted.entries()) {
      const end = field.offset + field.length;

      if (end > value.strideFloat32) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "field extends beyond frame stride",
          path: ["fields", index]
        });
      }

      if (index === 0) {
        continue;
      }

      const previous = sorted[index - 1];
      if (!previous) {
        continue;
      }

      const previousEnd = previous.offset + previous.length;
      if (field.offset < previousEnd) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "frame fields must not overlap",
          path: ["fields", index, "offset"]
        });
      }
    }
  });

export const telemetryChannelSchema = z
  .object({
    name: z.string().min(1),
    unit: z.string().min(1),
    offset: z.int().min(0),
    count: z.int().min(1)
  })
  .strict();

export const telemetrySchema = z
  .object({
    layoutVersion: z.literal(1),
    sampleCount: z.int().min(0),
    channels: z.array(telemetryChannelSchema)
  })
  .strict()
  .superRefine((value, context) => {
    for (const [index, channel] of value.channels.entries()) {
      if (channel.offset + channel.count > value.sampleCount) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "telemetry channel exceeds sampleCount",
          path: ["channels", index]
        });
      }
    }
  });

export const point2Schema = z
  .object({
    x: finiteNumber,
    y: finiteNumber
  })
  .strict();

export const bikePartSchema = z.enum([
  "rearTire",
  "rearRim",
  "frontTire",
  "frontRim",
  "chainstay",
  "seatstay",
  "seatTube",
  "topTube",
  "downTube",
  "headTube",
  "fork",
  "seatSupport",
  "saddle",
  "crankForward",
  "crankRearward",
  "pedalForward",
  "pedalRearward",
  "stemHandlebar",
  "handlebar",
  "rearShock"
]);

export const riderPartSchema = z.enum([
  "pelvis",
  "torso",
  "head",
  "leftThigh",
  "rightThigh",
  "leftShank",
  "rightShank",
  "leftUpperArm",
  "rightUpperArm",
  "leftForearm",
  "rightForearm",
  "leftHand",
  "rightHand",
  "leftFoot",
  "rightFoot"
]);

export const bikeMemberSchema = z
  .object({
    name: bikePartSchema,
    start: point2Schema,
    end: point2Schema
  })
  .strict();

const protectedShapeBase = {
  part: bikePartSchema,
  contactSurface: z.enum(["none", "hand", "foot", "saddle-top"])
};

export const capsuleProtectedShapeSchema = z
  .object({
    ...protectedShapeBase,
    shape: z.literal("capsule"),
    start: point2Schema,
    end: point2Schema,
    radius: finiteNumber.nonnegative()
  })
  .strict();

export const circleProtectedShapeSchema = z
  .object({
    ...protectedShapeBase,
    shape: z.literal("circle"),
    center: point2Schema,
    radius: finiteNumber.nonnegative()
  })
  .strict();

export const ringProtectedShapeSchema = z
  .object({
    ...protectedShapeBase,
    shape: z.literal("ring"),
    center: point2Schema,
    innerRadius: finiteNumber.nonnegative(),
    outerRadius: finiteNumber.positive()
  })
  .strict()
  .superRefine((value, context) => {
    if (value.innerRadius >= value.outerRadius) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "innerRadius must be less than outerRadius",
        path: ["innerRadius"]
      });
    }
  });

export const convexSegmentProtectedShapeSchema = z
  .object({
    ...protectedShapeBase,
    shape: z.literal("convex-segment"),
    points: z.array(point2Schema).min(3)
  })
  .strict();

export const protectedShapeSchema = z.union([
  capsuleProtectedShapeSchema,
  circleProtectedShapeSchema,
  ringProtectedShapeSchema,
  convexSegmentProtectedShapeSchema
]);

export const geometryIssueSchema = z
  .object({
    code: z.enum([
      "field-range",
      "chainstay-bb-triangle",
      "zero-length-member",
      "inverted-member",
      "steering-closure",
      "disconnected-contact",
      "self-intersection",
      "frame-suspension-relationship"
    ]),
    fields: z.array(z.string().min(1)),
    bikeParts: z.array(bikePartSchema),
    message: z.string().min(1)
  })
  .strict();

export const bikeMassPropertiesSchema = z
  .object({
    totalMass: finiteNumber.min(5).max(30),
    centerOfGravity: point2Schema,
    planarInertia: finiteNumber.nonnegative(),
    distributionVersion: z.literal(1)
  })
  .strict();

export const canonicalBikeGeometrySchema = z
  .object({
    modelVersion: z.literal(1),
    valid: z.boolean(),
    issues: z.array(geometryIssueSchema),
    closureResidual: finiteNumber.nonnegative(),
    landmarks: z.record(z.string().min(1), point2Schema),
    members: z.array(bikeMemberSchema),
    protectedShapes: z.array(protectedShapeSchema),
    massProperties: bikeMassPropertiesSchema
  })
  .strict();

export const bikeGeometryInspectionSchema = canonicalBikeGeometrySchema;

export const contactResultSchema = z
  .object({
    kind: z.enum(["hand", "foot", "saddle"]),
    riderPart: riderPartSchema,
    bikePart: bikePartSchema,
    active: z.boolean(),
    separation: finiteNumber
  })
  .strict();

export const designConflictSchema = z
  .object({
    code: z.string().min(1),
    kind: z.enum(["geometry", "clearance", "contact", "reach", "joint-limit"]),
    keyIndex: z.union([z.int().min(0), z.null()]),
    riderPart: z.union([riderPartSchema, z.null()]),
    bikePart: z.union([bikePartSchema, z.null()]),
    separation: z.union([finiteNumber, z.null()]),
    message: z.string().min(1)
  })
  .strict();

export const achievedPoseLandmarksSchema = z
  .object({
    pedalContact: point2Schema,
    ankle: point2Schema,
    knee: point2Schema,
    hip: point2Schema,
    shoulder: point2Schema,
    elbow: point2Schema,
    hand: point2Schema,
    handlebarContact: point2Schema,
    head: point2Schema
  })
  .strict();

export const poseSampleSchema = z
  .object({
    s: finiteNumber,
    targets: z
      .object({
        knee: finiteNumber,
        hip: finiteNumber,
        spine: finiteNumber
      })
      .strict(),
    derivedArm: z
      .object({
        shoulder: finiteNumber,
        elbow: finiteNumber,
        constrained: z.boolean()
      })
      .strict(),
    landmarks: achievedPoseLandmarksSchema,
    solverVersion: z.string().min(1).max(80)
  })
  .strict();

export const poseKeyValidationSchema = z
  .object({
    keyIndex: z.int().min(0),
    s: finiteNumber,
    valid: z.boolean(),
    sample: poseSampleSchema,
    minimumSeparation: finiteNumber,
    contacts: z.array(contactResultSchema),
    conflicts: z.array(designConflictSchema)
  })
  .strict();

export const poseEditResolutionSchema = z
  .object({
    requestedTargets: poseTargetsSchema,
    acceptedTargets: poseTargetsSchema,
    requestedValid: z.boolean(),
    validation: poseKeyValidationSchema,
    limitingConflicts: z.array(designConflictSchema)
  })
  .strict();

export const designValidationSchema = z
  .object({
    geometry: canonicalBikeGeometrySchema,
    poseKeys: z.array(poseKeyValidationSchema),
    canSolve: z.boolean(),
    conflictCount: z.int().min(0),
    scenarioHash: z.string().regex(hashPattern),
    modelVersion: z.string().min(1).max(80),
    solverVersion: z.string().min(1).max(80)
  })
  .strict();

export const entrySpeedWindowSchema = z
  .object({
    minimum: finiteNumber,
    maximum: finiteNumber,
    scenarioHash: z.string().regex(hashPattern),
    solverVersion: z.string().min(1).max(80),
    status: z.enum(["measured", "unavailable"]),
    reason: z.union([z.string().min(1), z.null()])
  })
  .strict()
  .superRefine((value, context) => {
    if (value.minimum > value.maximum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "minimum must be less than or equal to maximum",
        path: ["minimum"]
      });
    }

    if (value.status === "measured" && value.reason !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "measured entry windows must not include a reason",
        path: ["reason"]
      });
    }

    if (value.status === "unavailable" && value.reason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "unavailable entry windows require a reason",
        path: ["reason"]
      });
    }
  });

export const runResultSchema = z
  .object({
    runId: z.string().uuid(),
    scenarioHash: z.string().regex(hashPattern),
    solverVersion: z.string().min(1).max(80),
    frameLayout: frameLayoutSchema,
    frameCount: z.int().min(0),
    outputHz: z.int().min(1),
    phases: phasesSchema,
    metrics: z.record(z.string().min(1), metricSchema),
    telemetry: telemetrySchema,
    resultHash: z.string().regex(hashPattern)
  })
  .strict();

export type PhaseName = z.infer<typeof phaseNameSchema>;
export type Phase = z.infer<typeof phaseSchema>;
export type Metric = z.infer<typeof metricSchema>;
export type FrameLayoutField = z.infer<typeof frameLayoutFieldSchema>;
export type FrameLayout = z.infer<typeof frameLayoutSchema>;
export type TelemetryChannel = z.infer<typeof telemetryChannelSchema>;
export type Telemetry = z.infer<typeof telemetrySchema>;
export type Point2 = z.infer<typeof point2Schema>;
export type BikePart = z.infer<typeof bikePartSchema>;
export type RiderPart = z.infer<typeof riderPartSchema>;
export type BikeMember = z.infer<typeof bikeMemberSchema>;
export type ProtectedShape = z.infer<typeof protectedShapeSchema>;
export type GeometryIssue = z.infer<typeof geometryIssueSchema>;
export type BikeMassProperties = z.infer<typeof bikeMassPropertiesSchema>;
export type CanonicalBikeGeometry = z.infer<typeof canonicalBikeGeometrySchema>;
export type BikeGeometryInspection = z.infer<typeof bikeGeometryInspectionSchema>;
export type ContactResult = z.infer<typeof contactResultSchema>;
export type DesignConflict = z.infer<typeof designConflictSchema>;
export type AchievedPoseLandmarks = z.infer<typeof achievedPoseLandmarksSchema>;
export type PoseSample = z.infer<typeof poseSampleSchema>;
export type PoseKeyValidation = z.infer<typeof poseKeyValidationSchema>;
export type PoseEditResolution = z.infer<typeof poseEditResolutionSchema>;
export type DesignValidation = z.infer<typeof designValidationSchema>;
export type EntrySpeedWindow = z.infer<typeof entrySpeedWindowSchema>;
export type RunResult = z.infer<typeof runResultSchema>;
