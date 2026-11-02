import { z } from "zod";

import { runResultSchema } from "./run-result";
import { scenarioSchema } from "./scenario";
import { PROTOCOL_VERSION } from "./versions";

const hashPattern = /^[a-f0-9]{64}$/;
const finiteNumber = z.number().refine(Number.isFinite, "Expected a finite number");

export const providerSourceSchema = z.enum(["solver", "representative-fixture"]);

export const solverCapabilityManifestSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    solverVersion: z.string().min(1),
    modelVersion: z.string().min(1),
    deterministic: z.literal(true),
    supportedScenarioPaths: z.array(z.string().regex(/^scenario\.[A-Za-z0-9_.]+$/)),
    supportedOutputs: z.array(z.string().regex(/^[A-Za-z0-9_.-]+$/)),
    ccd: z.boolean(),
    contactImpulse: z.boolean(),
    motorWork: z.boolean(),
    jointTorque: z.boolean()
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.supportedScenarioPaths).size !== value.supportedScenarioPaths.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "supportedScenarioPaths values must be unique",
        path: ["supportedScenarioPaths"]
      });
    }
    if (new Set(value.supportedOutputs).size !== value.supportedOutputs.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "supportedOutputs values must be unique",
        path: ["supportedOutputs"]
      });
    }
  });

export const modelMetadataSchema = z
  .object({
    scenarioSchemaVersion: z.int().min(1),
    solverVersion: z.string().min(1),
    modelVersion: z.string().min(1),
    assumptionsId: z.string().min(1),
    unitSystemId: z.string().min(1),
    metricDefinitionVersion: z.string().min(1),
    terrainSampleStep: finiteNumber.positive().default(0.1)
  })
  .strict();

export const runArtifactSchema = z
  .object({
    runId: z.string().uuid(),
    createdAt: z.string().datetime(),
    scenarioSnapshot: scenarioSchema,
    scenarioHash: z.string().regex(hashPattern),
    manifest: runResultSchema,
    model: modelMetadataSchema,
    frameBuffer: z.instanceof(ArrayBuffer),
    telemetryBuffer: z.instanceof(ArrayBuffer),
    source: providerSourceSchema
  })
  .strict()
  .superRefine((value, context) => {
    if (value.runId !== value.manifest.runId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "runId must match manifest.runId",
        path: ["runId"]
      });
    }
    if (value.scenarioHash !== value.manifest.scenarioHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scenarioHash must match manifest.scenarioHash",
        path: ["scenarioHash"]
      });
    }
    if (value.model.solverVersion !== value.manifest.solverVersion) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "model.solverVersion must match manifest.solverVersion",
        path: ["model", "solverVersion"]
      });
    }
  });

export const baselineSelectionSchema = z
  .object({
    runId: z.union([z.string().uuid(), z.null()]),
    compatibility: z.enum(["none", "compatible", "version-warning", "incompatible", "unavailable"]),
    reasons: z.array(z.string().min(1))
  })
  .strict();

export const entrySpeedWindowInfoSchema = z
  .object({
    minimum: finiteNumber,
    maximum: finiteNumber,
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
        message: "measured windows must not include a reason",
        path: ["reason"]
      });
    }
    if (value.status === "unavailable" && value.reason === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "unavailable windows require a reason",
        path: ["reason"]
      });
    }
  });

export const presetPatchSchema = z.record(z.string(), z.unknown());

export const presetSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum(["jump", "rider", "bike", "movement"]),
    name: z.string().min(1),
    tags: z.array(z.string().min(1)),
    note: z.string().min(1),
    patch: presetPatchSchema,
    readOnly: z.literal(true),
    speedWindow: z.union([entrySpeedWindowInfoSchema, z.null()])
  })
  .strict();

export const validationCheckSchema = z
  .object({
    id: z.string().min(1),
    category: z.enum(["analytical", "convergence", "determinism", "pending"]),
    label: z.string().min(1),
    measured: z.union([
      z
        .object({
          value: finiteNumber,
          unit: z.string().min(1)
        })
        .strict(),
      z.null()
    ]),
    tolerance: z.union([
      z
        .object({
          value: finiteNumber,
          unit: z.string().min(1)
        })
        .strict(),
      z.null()
    ]),
    margin: z.union([finiteNumber, z.null()]),
    traceRef: z.union([z.string().min(1), z.null()]),
    owner: z.union([z.string().min(1), z.null()]),
    blockedGate: z.union([z.string().min(1), z.null()]),
    status: z.enum(["idle", "running", "pass", "fail", "awaiting-core", "budget-exceeded"])
  })
  .strict()
  .superRefine((value, context) => {
    if (value.category === "pending") {
      if (value.owner === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "pending checks require an owner",
          path: ["owner"]
        });
      }
      if (value.blockedGate === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "pending checks require a blockedGate",
          path: ["blockedGate"]
        });
      }
    }
  });

export const sessionReferenceSchema = z
  .object({
    kind: z.enum(["scenario", "run", "baseline", "preset", "validation"]),
    id: z.string().min(1),
    label: z.string().min(1),
    reason: z.string().min(1),
    stale: z.boolean()
  })
  .strict();

export type ProviderSource = z.infer<typeof providerSourceSchema>;
export type SolverCapabilityManifest = z.infer<typeof solverCapabilityManifestSchema>;
export type ModelMetadata = z.infer<typeof modelMetadataSchema>;
export type RunArtifact = z.infer<typeof runArtifactSchema>;
export type BaselineSelection = z.infer<typeof baselineSelectionSchema>;
export type EntrySpeedWindowInfo = z.infer<typeof entrySpeedWindowInfoSchema>;
export type Preset = z.infer<typeof presetSchema>;
export type ValidationCheck = z.infer<typeof validationCheckSchema>;
export type SessionReference = z.infer<typeof sessionReferenceSchema>;
