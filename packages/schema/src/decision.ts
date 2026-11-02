import { z } from "zod";

export const stackAreaIdSchema = z.enum([
  "ui",
  "routing",
  "rendering",
  "charts",
  "physics",
  "worker",
  "state",
  "validation",
  "storage",
  "offline",
  "testing",
  "delivery"
]);

export const decisionStatusSchema = z.enum([
  "draft",
  "provisionally-approved",
  "evidence-complete",
  "approved",
  "superseded"
]);

export const evidenceKindSchema = z.enum([
  "primary-doc",
  "package-metadata",
  "measurement",
  "validation-result"
]);

export const evaluationCriterionKindSchema = z.enum(["weighted", "gate"]);

const nonEmptyString = z.string().min(1);

export const evidenceItemSchema = z
  .object({
    id: nonEmptyString,
    kind: evidenceKindSchema,
    title: nonEmptyString,
    source: nonEmptyString,
    observedAt: z.string().date(),
    claim: nonEmptyString
  })
  .strict();

export const evaluationCriterionSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    weight: z.int().min(0).max(100),
    kind: evaluationCriterionKindSchema,
    sourceRefs: z.array(nonEmptyString).min(1),
    acceptanceRule: nonEmptyString
  })
  .strict();

export const criterionRatingSchema = z
  .object({
    criterionId: nonEmptyString,
    score: z.union([z.int().min(1).max(5), z.null()]),
    gateResult: z.union([z.boolean(), z.null()]),
    evidenceIds: z.array(nonEmptyString).min(1),
    notes: nonEmptyString
  })
  .strict();

export const candidateSchema = z
  .object({
    id: nonEmptyString,
    stackAreaIds: z.array(stackAreaIdSchema).min(1),
    name: nonEmptyString,
    versionBaseline: z.union([nonEmptyString, z.null()]),
    license: z.union([nonEmptyString, z.null()]),
    ratings: z.array(criterionRatingSchema).min(1),
    gateStatus: z.enum(["pass", "fail", "risk"]),
    risks: z.array(nonEmptyString),
    fallback: z.union([nonEmptyString, z.null()])
  })
  .strict()
  .superRefine((candidate, context) => {
    const stackAreaSet = new Set(candidate.stackAreaIds);
    if (stackAreaSet.size !== candidate.stackAreaIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "candidate stackAreaIds must be unique",
        path: ["stackAreaIds"]
      });
    }

    const ratingSet = new Set(candidate.ratings.map((rating) => rating.criterionId));
    if (ratingSet.size !== candidate.ratings.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "candidate ratings must not repeat criterionId values",
        path: ["ratings"]
      });
    }
  });

export const decisionRecordSchema = z
  .object({
    id: nonEmptyString,
    stackAreaIds: z.array(stackAreaIdSchema).min(1),
    selectedCandidateId: nonEmptyString,
    rationale: nonEmptyString,
    rejectedCandidateIds: z.array(nonEmptyString),
    singleCandidateJustification: z.union([nonEmptyString, z.null()]),
    riskIds: z.array(nonEmptyString),
    revisitTriggers: z.array(nonEmptyString).min(1),
    provisionallyApprovedBy: z.union([nonEmptyString, z.null()]),
    provisionallyApprovedAt: z.union([z.string().datetime(), z.null()]),
    approvedBy: z.union([nonEmptyString, z.null()]),
    approvedAt: z.union([z.string().datetime(), z.null()]),
    status: decisionStatusSchema,
    supersedes: z.union([nonEmptyString, z.null()])
  })
  .strict()
  .superRefine((record, context) => {
    const stackAreaSet = new Set(record.stackAreaIds);
    if (stackAreaSet.size !== record.stackAreaIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "decisionRecord stackAreaIds must be unique",
        path: ["stackAreaIds"]
      });
    }

    const rejectedSet = new Set(record.rejectedCandidateIds);
    if (rejectedSet.size !== record.rejectedCandidateIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "rejectedCandidateIds must be unique",
        path: ["rejectedCandidateIds"]
      });
    }

    if (record.rejectedCandidateIds.includes(record.selectedCandidateId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "selectedCandidateId cannot also be rejected",
        path: ["selectedCandidateId"]
      });
    }

    if (record.rejectedCandidateIds.length === 0 && record.singleCandidateJustification === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "singleCandidateJustification is required when no rejected candidates are listed",
        path: ["singleCandidateJustification"]
      });
    }

    if (record.rejectedCandidateIds.length > 0 && record.singleCandidateJustification !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "singleCandidateJustification must be null when rejected candidates are listed",
        path: ["singleCandidateJustification"]
      });
    }

    const needsProvisional =
      record.status === "provisionally-approved" ||
      record.status === "evidence-complete" ||
      record.status === "approved" ||
      record.status === "superseded";

    if (needsProvisional) {
      if (record.provisionallyApprovedBy === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "provisionallyApprovedBy is required after draft",
          path: ["provisionallyApprovedBy"]
        });
      }
      if (record.provisionallyApprovedAt === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "provisionallyApprovedAt is required after draft",
          path: ["provisionallyApprovedAt"]
        });
      }
    } else {
      if (record.provisionallyApprovedBy !== null || record.provisionallyApprovedAt !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "draft decisions must not include provisional approval metadata",
          path: ["status"]
        });
      }
    }

    const needsFinalApproval = record.status === "approved" || record.status === "superseded";
    if (needsFinalApproval) {
      if (record.approvedBy === null || record.approvedAt === null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "approved decisions require approvedBy and approvedAt",
          path: ["approvedBy"]
        });
      }
    } else if (record.approvedBy !== null || record.approvedAt !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "non-approved decisions must not include final approval metadata",
        path: ["approvedBy"]
      });
    }

    if (record.status === "superseded" && record.supersedes === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "superseded decisions must reference a prior decision id",
        path: ["supersedes"]
      });
    }

    if (record.status !== "superseded" && record.supersedes !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "supersedes must be null unless status is superseded",
        path: ["supersedes"]
      });
    }
  });

export const stackRubricCandidateSchema = candidateSchema.extend({
  alternatives: z.array(nonEmptyString)
});

export const stackRubricSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.string().datetime(),
    criteria: z.array(evaluationCriterionSchema).min(1),
    tieBreakPolicy: z
      .object({
        orderedCriteriaIds: z.array(nonEmptyString).min(1)
      })
      .strict(),
    candidates: z.array(stackRubricCandidateSchema).min(1)
  })
  .strict();

export const evidenceCatalogSchema = z
  .object({
    schemaVersion: z.literal(1).optional(),
    generatedAt: z.string().datetime().optional(),
    evidence: z.array(evidenceItemSchema).min(1)
  })
  .strict();

export const decisionPackageSchema = z
  .object({
    criteria: z.array(evaluationCriterionSchema).min(1),
    candidates: z.array(candidateSchema).min(1),
    evidenceCatalog: z.array(evidenceItemSchema).min(1),
    decisionRecord: decisionRecordSchema
  })
  .strict()
  .superRefine((input, context) => {
    const weightedCriteria = input.criteria.filter((criterion) => criterion.kind === "weighted");
    const weightedTotal = weightedCriteria.reduce((sum, criterion) => sum + criterion.weight, 0);

    if (weightedTotal !== 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "weighted criteria must total exactly 100",
        path: ["criteria"]
      });
    }

    const criterionIds = new Set<string>();
    for (const criterion of input.criteria) {
      if (criterionIds.has(criterion.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "criterion ids must be unique",
          path: ["criteria"]
        });
        break;
      }
      criterionIds.add(criterion.id);

      if (criterion.kind === "weighted" && criterion.weight <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "weighted criteria require positive weight",
          path: ["criteria"]
        });
      }

      if (criterion.kind === "gate" && criterion.weight !== 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "gate criteria must use weight 0",
          path: ["criteria"]
        });
      }
    }

    const evidenceIds = new Set(input.evidenceCatalog.map((evidence) => evidence.id));

    const candidateIds = new Set<string>();
    for (const candidate of input.candidates) {
      if (candidateIds.has(candidate.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "candidate ids must be unique",
          path: ["candidates"]
        });
      }
      candidateIds.add(candidate.id);

      if (candidate.ratings.length !== input.criteria.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "every candidate must provide exactly one rating per criterion",
          path: ["candidates"]
        });
      }

      for (const rating of candidate.ratings) {
        if (!criterionIds.has(rating.criterionId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `rating references unknown criterion ${rating.criterionId}`,
            path: ["candidates"]
          });
          continue;
        }

        for (const evidenceId of rating.evidenceIds) {
          if (!evidenceIds.has(evidenceId)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `rating references unknown evidence ${evidenceId}`,
              path: ["candidates"]
            });
          }
        }

        const criterion = input.criteria.find((item) => item.id === rating.criterionId);
        if (!criterion) {
          continue;
        }

        if (criterion.kind === "weighted") {
          if (rating.score === null || rating.gateResult !== null) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message: `weighted criterion ${criterion.id} requires score and null gateResult`,
              path: ["candidates"]
            });
          }
        } else if (rating.score !== null || rating.gateResult === null) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `gate criterion ${criterion.id} requires gateResult and null score`,
            path: ["candidates"]
          });
        }
      }
    }

    if (!candidateIds.has(input.decisionRecord.selectedCandidateId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "decisionRecord selectedCandidateId must reference a known candidate",
        path: ["decisionRecord", "selectedCandidateId"]
      });
    }

    for (const rejectedId of input.decisionRecord.rejectedCandidateIds) {
      if (!candidateIds.has(rejectedId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `decisionRecord rejected candidate ${rejectedId} does not exist`,
          path: ["decisionRecord", "rejectedCandidateIds"]
        });
      }
    }

    const selected = input.candidates.find(
      (candidate) => candidate.id === input.decisionRecord.selectedCandidateId
    );

    if (selected?.gateStatus === "fail") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "selected candidate must not be marked as gateStatus=fail",
        path: ["decisionRecord", "selectedCandidateId"]
      });
    }
  });

export type StackAreaId = z.infer<typeof stackAreaIdSchema>;
export type DecisionStatus = z.infer<typeof decisionStatusSchema>;
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export type EvaluationCriterionKind = z.infer<typeof evaluationCriterionKindSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type EvaluationCriterion = z.infer<typeof evaluationCriterionSchema>;
export type CriterionRating = z.infer<typeof criterionRatingSchema>;
export type Candidate = z.infer<typeof candidateSchema>;
export type DecisionRecord = z.infer<typeof decisionRecordSchema>;
export type StackRubricCandidate = z.infer<typeof stackRubricCandidateSchema>;
export type StackRubric = z.infer<typeof stackRubricSchema>;
export type EvidenceCatalog = z.infer<typeof evidenceCatalogSchema>;
export type DecisionPackage = z.infer<typeof decisionPackageSchema>;

export const parseDecisionPackage = (input: unknown): DecisionPackage =>
  decisionPackageSchema.parse(input);
export const parseDecisionRecord = (input: unknown): DecisionRecord =>
  decisionRecordSchema.parse(input);
export const parseStackRubric = (input: unknown): StackRubric => stackRubricSchema.parse(input);
export const parseEvidenceCatalog = (input: unknown): EvidenceCatalog =>
  evidenceCatalogSchema.parse(input);
