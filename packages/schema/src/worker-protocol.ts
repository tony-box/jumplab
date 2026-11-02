import { z } from "zod";

import { providerSourceSchema, solverCapabilityManifestSchema } from "./application";
import {
  bikeSpecSchema,
  poseClipSchema,
  poseTargetsSchema,
  riderSpecSchema,
  scenarioSchema
} from "./scenario";
import {
  bikeGeometryInspectionSchema,
  designValidationSchema,
  entrySpeedWindowSchema,
  poseEditResolutionSchema,
  poseSampleSchema,
  runResultSchema
} from "./run-result";

export const PROTOCOL_VERSION = 3 as const;

const finiteNumber = z.number().refine(Number.isFinite, "Expected a finite number");

export const groundSegmentKindSchema = z.enum([
  "approach-takeoff",
  "table-deck",
  "landing-face",
  "landing-rollout"
]);

export const terrainPointSchema = z.tuple([finiteNumber, finiteNumber]);

export const groundSegmentSchema = z
  .object({
    id: z.string().min(1),
    kind: groundSegmentKindSchema,
    points: z.array(terrainPointSchema).min(2)
  })
  .strict();

export const terrainProfileSchema = z
  .object({
    segments: z.array(groundSegmentSchema),
    approachStartX: finiteNumber,
    lipX: finiteNumber,
    landingStartX: finiteNumber,
    sampleStep: finiteNumber.positive()
  })
  .strict();

const envelopeSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    type: z.string().min(1),
    requestId: z.string().uuid()
  })
  .strict();

export const initCommandSchema = envelopeSchema.extend({
  type: z.literal("init"),
  appVersion: z.string().min(1),
  expectedSolverVersion: z.string().min(1)
});

export const solveCommandSchema = envelopeSchema.extend({
  type: z.literal("solve"),
  runId: z.string().uuid(),
  scenario: scenarioSchema
});

export const cancelCommandSchema = envelopeSchema.extend({
  type: z.literal("cancel"),
  runId: z.string().uuid()
});

export const samplePoseCommandSchema = envelopeSchema.extend({
  type: z.literal("sample-pose"),
  poseClip: poseClipSchema,
  s: z.number().refine(Number.isFinite),
  rider: riderSpecSchema,
  bike: bikeSpecSchema
});

export const analyzeSpeedWindowCommandSchema = envelopeSchema.extend({
  type: z.literal("analyze-speed-window"),
  scenario: scenarioSchema
});

export const terrainCommandSchema = envelopeSchema.extend({
  type: z.literal("terrain"),
  scenario: scenarioSchema,
  step: finiteNumber
});

export const inspectBikeGeometryCommandSchema = envelopeSchema.extend({
  type: z.literal("inspect-bike-geometry"),
  bike: bikeSpecSchema
});

export const resolvePoseEditCommandSchema = envelopeSchema.extend({
  type: z.literal("resolve-pose-edit"),
  scenario: scenarioSchema,
  keyIndex: z.int().min(0),
  baselineTargets: poseTargetsSchema,
  requestedTargets: poseTargetsSchema
});

export const validateDesignCommandSchema = envelopeSchema.extend({
  type: z.literal("validate-design"),
  scenario: scenarioSchema
});

export const disposeCommandSchema = envelopeSchema.extend({
  type: z.literal("dispose")
});

export const workerCommandSchema = z.discriminatedUnion("type", [
  initCommandSchema,
  solveCommandSchema,
  cancelCommandSchema,
  samplePoseCommandSchema,
  analyzeSpeedWindowCommandSchema,
  terrainCommandSchema,
  inspectBikeGeometryCommandSchema,
  resolvePoseEditCommandSchema,
  validateDesignCommandSchema,
  disposeCommandSchema
]);

export const readyEventSchema = envelopeSchema.extend({
  type: z.literal("ready"),
  solverVersion: z.string().min(1),
  modelVersion: z.string().min(1),
  capabilities: solverCapabilityManifestSchema
});

export const progressEventSchema = envelopeSchema
  .extend({
    type: z.literal("progress"),
    runId: z.string().uuid(),
    completedSteps: z.int().min(0),
    totalSteps: z.int().min(1),
    fraction: z.number().min(0).max(1)
  })
  .superRefine((value, context) => {
    if (value.completedSteps > value.totalSteps) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "completedSteps must not exceed totalSteps",
        path: ["completedSteps"]
      });
    }

    const expectedFraction = value.completedSteps / value.totalSteps;
    if (Math.abs(value.fraction - expectedFraction) > 0.01) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "fraction must match completedSteps/totalSteps",
        path: ["fraction"]
      });
    }
  });

export const resultEventSchema = envelopeSchema.extend({
  type: z.literal("result"),
  runId: z.string().uuid(),
  source: providerSourceSchema,
  manifest: runResultSchema,
  frameBuffer: z.instanceof(ArrayBuffer),
  telemetryBuffer: z.instanceof(ArrayBuffer)
});

export const cancelledEventSchema = envelopeSchema.extend({
  type: z.literal("cancelled"),
  runId: z.string().uuid()
});

export const poseSampleEventSchema = envelopeSchema.extend({
  type: z.literal("pose-sample"),
  sample: poseSampleSchema
});

export const speedWindowEventSchema = envelopeSchema.extend({
  type: z.literal("speed-window"),
  window: entrySpeedWindowSchema
});

export const terrainEventSchema = envelopeSchema.extend({
  type: z.literal("terrain"),
  profile: terrainProfileSchema
});

export const bikeGeometryInspectedEventSchema = envelopeSchema.extend({
  type: z.literal("bike-geometry-inspected"),
  inspection: bikeGeometryInspectionSchema
});

export const poseEditResolvedEventSchema = envelopeSchema.extend({
  type: z.literal("pose-edit-resolved"),
  resolution: poseEditResolutionSchema
});

export const designValidatedEventSchema = envelopeSchema.extend({
  type: z.literal("design-validated"),
  validation: designValidationSchema
});

export const workerErrorCodeSchema = z.enum([
  "protocol_mismatch",
  "solver_version_mismatch",
  "invalid_scenario",
  "unsupported_schema",
  "core_init_failed",
  "numerical_instability",
  "buffer_layout_error",
  "internal_error",
  "unsupported-schema",
  "invalid-bike-json",
  "geometry-invalid",
  "invalid-baseline",
  "design-invalid",
  "cancelled",
  "core-unavailable",
  "operation-unsupported"
]);

export const errorEventSchema = envelopeSchema.extend({
  type: z.literal("error"),
  runId: z.union([z.string().uuid(), z.null()]),
  code: workerErrorCodeSchema,
  message: z.string().min(1),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  recoverable: z.boolean()
});

export const disposedEventSchema = envelopeSchema.extend({
  type: z.literal("disposed")
});

export const workerEventSchema = z.discriminatedUnion("type", [
  readyEventSchema,
  progressEventSchema,
  resultEventSchema,
  cancelledEventSchema,
  poseSampleEventSchema,
  speedWindowEventSchema,
  terrainEventSchema,
  bikeGeometryInspectedEventSchema,
  poseEditResolvedEventSchema,
  designValidatedEventSchema,
  errorEventSchema,
  disposedEventSchema
]);

export type GroundSegmentKind = z.infer<typeof groundSegmentKindSchema>;
export type TerrainPoint = z.infer<typeof terrainPointSchema>;
export type GroundSegment = z.infer<typeof groundSegmentSchema>;
export type TerrainProfile = z.infer<typeof terrainProfileSchema>;
export type WorkerErrorCode = z.infer<typeof workerErrorCodeSchema>;
export type WorkerCommand = z.infer<typeof workerCommandSchema>;
export type WorkerEvent = z.infer<typeof workerEventSchema>;
