/* eslint-env node */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const fail = (message) => {
  throw new Error(message);
};

const parseArgs = (argv) => {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for ${arg}`);
    }
    args.set(arg.slice(2), value);
    index += 1;
  }

  const catalogPath = args.get("catalog");
  const rubricPath = args.get("rubric");
  const decisionPath = args.get("decision");
  const outputPath = args.get("output");

  if (!catalogPath || !rubricPath || !decisionPath || !outputPath) {
    fail(
      "Usage: node scripts/validate-stack-decision.mjs --catalog <catalog.json> --rubric <stack-rubric.json> --decision <stack-decision.json> --output <stack-validation.json>"
    );
  }

  return {
    catalogPath: resolve(catalogPath),
    rubricPath: resolve(rubricPath),
    decisionPath: resolve(decisionPath),
    outputPath: resolve(outputPath)
  };
};

const readJson = (filePath) => {
  const content = readFileSync(filePath, "utf8");
  return JSON.parse(content);
};

const ensureArray = (value, label) => {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }
};

const validateCatalog = (catalog) => {
  ensureArray(catalog.evidence, "catalog.evidence");
  if (catalog.evidence.length === 0) {
    fail("catalog.evidence must not be empty");
  }

  const evidenceIds = new Set();
  for (const evidence of catalog.evidence) {
    if (typeof evidence?.id !== "string" || evidence.id.length === 0) {
      fail("Each catalog evidence item requires a non-empty id");
    }
    if (evidenceIds.has(evidence.id)) {
      fail(`Duplicate evidence id: ${evidence.id}`);
    }
    evidenceIds.add(evidence.id);

    if (
      typeof evidence.observedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(evidence.observedAt)
    ) {
      fail(`Evidence ${evidence.id} must include an ISO date observedAt value`);
    }

    if (typeof evidence.source !== "string" || evidence.source.length === 0) {
      fail(`Evidence ${evidence.id} must include a source`);
    }

    if (typeof evidence.claim !== "string" || evidence.claim.length === 0) {
      fail(`Evidence ${evidence.id} must include a claim`);
    }
  }

  return evidenceIds;
};

const validateRubric = (rubric, evidenceIds) => {
  if (rubric.schemaVersion !== 1) {
    fail("rubric.schemaVersion must equal 1");
  }

  if (typeof rubric.generatedAt !== "string" || Number.isNaN(Date.parse(rubric.generatedAt))) {
    fail("rubric.generatedAt must be an ISO timestamp");
  }

  ensureArray(rubric.criteria, "rubric.criteria");
  ensureArray(rubric.candidates, "rubric.candidates");

  if (rubric.criteria.length === 0) {
    fail("rubric.criteria must not be empty");
  }
  if (rubric.candidates.length < 2) {
    fail("rubric.candidates must include at least two alternatives");
  }

  const criterionIds = new Set();
  const weightedCriteria = [];
  const gateCriteria = [];

  for (const criterion of rubric.criteria) {
    if (typeof criterion.id !== "string" || criterion.id.length === 0) {
      fail("Each criterion requires a non-empty id");
    }
    if (criterionIds.has(criterion.id)) {
      fail(`Duplicate criterion id: ${criterion.id}`);
    }
    criterionIds.add(criterion.id);

    if (criterion.kind !== "weighted" && criterion.kind !== "gate") {
      fail(`Criterion ${criterion.id} has unsupported kind ${criterion.kind}`);
    }

    if (!Number.isInteger(criterion.weight) || criterion.weight < 0 || criterion.weight > 100) {
      fail(`Criterion ${criterion.id} has invalid weight ${criterion.weight}`);
    }

    if (criterion.kind === "weighted") {
      if (criterion.weight === 0) {
        fail(`Weighted criterion ${criterion.id} must use positive weight`);
      }
      weightedCriteria.push(criterion);
    } else {
      if (criterion.weight !== 0) {
        fail(`Gate criterion ${criterion.id} must use weight 0`);
      }
      gateCriteria.push(criterion);
    }
  }

  const totalWeight = weightedCriteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  if (totalWeight !== 100) {
    fail(`Weighted criteria must sum to 100; received ${totalWeight}`);
  }

  if (!rubric.tieBreakPolicy || !Array.isArray(rubric.tieBreakPolicy.orderedCriteriaIds)) {
    fail("rubric.tieBreakPolicy.orderedCriteriaIds is required");
  }

  for (const criterionId of rubric.tieBreakPolicy.orderedCriteriaIds) {
    if (!criterionIds.has(criterionId)) {
      fail(`tieBreakPolicy references unknown criterion ${criterionId}`);
    }
  }

  const candidateIds = new Set();
  for (const candidate of rubric.candidates) {
    if (typeof candidate.id !== "string" || candidate.id.length === 0) {
      fail("Each candidate requires a non-empty id");
    }

    if (candidateIds.has(candidate.id)) {
      fail(`Duplicate candidate id: ${candidate.id}`);
    }
    candidateIds.add(candidate.id);

    if (!Array.isArray(candidate.stackAreaIds) || candidate.stackAreaIds.length === 0) {
      fail(`Candidate ${candidate.id} must include stackAreaIds`);
    }

    if (!Array.isArray(candidate.ratings) || candidate.ratings.length !== rubric.criteria.length) {
      fail(`Candidate ${candidate.id} must include one rating per criterion`);
    }

    if (!Array.isArray(candidate.alternatives) || candidate.alternatives.length === 0) {
      fail(`Candidate ${candidate.id} must include at least one alternative candidate id`);
    }

    const candidateAlternativeSet = new Set(candidate.alternatives);
    if (candidateAlternativeSet.size !== candidate.alternatives.length) {
      fail(`Candidate ${candidate.id} contains duplicate alternatives`);
    }

    const ratingCriterionIds = new Set();
    for (const rating of candidate.ratings) {
      if (typeof rating.criterionId !== "string" || !criterionIds.has(rating.criterionId)) {
        fail(`Candidate ${candidate.id} references unknown criterion in ratings`);
      }

      if (ratingCriterionIds.has(rating.criterionId)) {
        fail(`Candidate ${candidate.id} has duplicate rating for criterion ${rating.criterionId}`);
      }
      ratingCriterionIds.add(rating.criterionId);

      const criterion = rubric.criteria.find((item) => item.id === rating.criterionId);
      if (!criterion) {
        fail(`Candidate ${candidate.id} references missing criterion ${rating.criterionId}`);
      }

      if (!Array.isArray(rating.evidenceIds) || rating.evidenceIds.length === 0) {
        fail(`Candidate ${candidate.id} criterion ${rating.criterionId} must include evidenceIds`);
      }

      for (const evidenceId of rating.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          fail(
            `Candidate ${candidate.id} criterion ${rating.criterionId} references unknown evidence ${evidenceId}`
          );
        }
      }

      if (criterion.kind === "weighted") {
        if (!Number.isInteger(rating.score) || rating.score < 1 || rating.score > 5) {
          fail(
            `Weighted criterion ${criterion.id} for candidate ${candidate.id} requires score in [1,5]`
          );
        }
        if (rating.gateResult !== null) {
          fail(
            `Weighted criterion ${criterion.id} for candidate ${candidate.id} must set gateResult=null`
          );
        }
      }

      if (criterion.kind === "gate") {
        if (typeof rating.gateResult !== "boolean") {
          fail(
            `Gate criterion ${criterion.id} for candidate ${candidate.id} requires boolean gateResult`
          );
        }
        if (rating.score !== null) {
          fail(`Gate criterion ${criterion.id} for candidate ${candidate.id} must set score=null`);
        }
      }
    }
  }

  for (const candidate of rubric.candidates) {
    for (const alternativeId of candidate.alternatives) {
      if (!candidateIds.has(alternativeId)) {
        fail(`Candidate ${candidate.id} alternative ${alternativeId} does not exist`);
      }
      if (alternativeId === candidate.id) {
        fail(`Candidate ${candidate.id} cannot list itself as an alternative`);
      }
    }
  }

  return {
    criterionIds,
    weightedCriteria,
    gateCriteria,
    candidateIds
  };
};

const validateDecision = (decision, rubricMeta) => {
  if (decision.schemaVersion !== 1) {
    fail("decision.schemaVersion must equal 1");
  }

  if (!Array.isArray(decision.stackAreaIds) || decision.stackAreaIds.length === 0) {
    fail("decision.stackAreaIds must be a non-empty array");
  }

  if (!rubricMeta.candidateIds.has(decision.selectedCandidateId)) {
    fail(
      `decision.selectedCandidateId references unknown candidate ${decision.selectedCandidateId}`
    );
  }

  ensureArray(decision.rejectedCandidateIds, "decision.rejectedCandidateIds");

  for (const candidateId of decision.rejectedCandidateIds) {
    if (!rubricMeta.candidateIds.has(candidateId)) {
      fail(`decision.rejectedCandidateIds references unknown candidate ${candidateId}`);
    }
  }

  if (decision.rejectedCandidateIds.includes(decision.selectedCandidateId)) {
    fail("decision.selectedCandidateId cannot appear in rejectedCandidateIds");
  }

  const status = decision.status;
  const allowedStatuses = new Set([
    "draft",
    "provisionally-approved",
    "evidence-complete",
    "approved",
    "superseded"
  ]);

  if (!allowedStatuses.has(status)) {
    fail(`decision.status must be one of ${Array.from(allowedStatuses).join(", ")}`);
  }

  const needsProvisional =
    status === "provisionally-approved" ||
    status === "evidence-complete" ||
    status === "approved" ||
    status === "superseded";

  if (needsProvisional) {
    if (decision.provisionallyApprovedBy !== "project-maintainer") {
      fail("decision.provisionallyApprovedBy must be project-maintainer for provisional approval");
    }
    if (
      typeof decision.provisionallyApprovedAt !== "string" ||
      Number.isNaN(Date.parse(decision.provisionallyApprovedAt))
    ) {
      fail("decision.provisionallyApprovedAt must be an ISO timestamp");
    }
  }

  const requiresFinalApproval = status === "approved" || status === "superseded";
  if (requiresFinalApproval) {
    if (typeof decision.approvedBy !== "string" || decision.approvedBy.length === 0) {
      fail("decision.approvedBy is required when status is approved or superseded");
    }
    if (typeof decision.approvedAt !== "string" || Number.isNaN(Date.parse(decision.approvedAt))) {
      fail("decision.approvedAt must be an ISO timestamp when status is approved or superseded");
    }
  }

  if (status === "draft") {
    fail(
      "Stop-work gate: decision.status is draft. Transition to provisionally-approved with project-maintainer sign-off before US2/US3 implementation."
    );
  }
};

const scoreCandidate = (candidate, rubricMeta) => {
  const weightedBreakdown = [];
  let weightedTotal = 0;

  for (const criterion of rubricMeta.weightedCriteria) {
    const rating = candidate.ratings.find((item) => item.criterionId === criterion.id);
    if (!rating) {
      fail(`Candidate ${candidate.id} is missing weighted criterion ${criterion.id}`);
    }

    const normalizedContribution = (rating.score / 5) * criterion.weight;
    weightedBreakdown.push({
      criterionId: criterion.id,
      weight: criterion.weight,
      score: rating.score,
      normalizedContribution
    });
    weightedTotal += normalizedContribution;
  }

  const hardGateResults = rubricMeta.gateCriteria.map((criterion) => {
    const rating = candidate.ratings.find((item) => item.criterionId === criterion.id);
    if (!rating) {
      fail(`Candidate ${candidate.id} is missing gate criterion ${criterion.id}`);
    }

    return {
      criterionId: criterion.id,
      passed: rating.gateResult
    };
  });

  const hardGatePassed = hardGateResults.every((gate) => gate.passed === true);

  return {
    id: candidate.id,
    name: candidate.name,
    normalizedScore: Number(weightedTotal.toFixed(2)),
    hardGatePassed,
    rejectedByHardGate: !hardGatePassed,
    weightedBreakdown,
    hardGateResults
  };
};

const compareForTieBreak = (left, right, rubric) => {
  for (const criterionId of rubric.tieBreakPolicy.orderedCriteriaIds) {
    const leftRating = left.ratings.find((rating) => rating.criterionId === criterionId);
    const rightRating = right.ratings.find((rating) => rating.criterionId === criterionId);

    const leftValue = leftRating?.score ?? (leftRating?.gateResult ? 1 : 0);
    const rightValue = rightRating?.score ?? (rightRating?.gateResult ? 1 : 0);

    if (leftValue > rightValue) {
      return -1;
    }
    if (leftValue < rightValue) {
      return 1;
    }
  }

  return left.id.localeCompare(right.id);
};

const findWinner = (rubric, scoredCandidates) => {
  const passSet = new Set(
    scoredCandidates.filter((item) => item.hardGatePassed).map((item) => item.id)
  );
  const passingCandidates = rubric.candidates.filter((candidate) => passSet.has(candidate.id));

  if (passingCandidates.length === 0) {
    fail("No candidate passes all hard gates");
  }

  passingCandidates.sort((left, right) => {
    const leftScore = scoredCandidates.find((item) => item.id === left.id)?.normalizedScore ?? -1;
    const rightScore = scoredCandidates.find((item) => item.id === right.id)?.normalizedScore ?? -1;

    if (leftScore > rightScore) {
      return -1;
    }
    if (leftScore < rightScore) {
      return 1;
    }

    return compareForTieBreak(left, right, rubric);
  });

  return passingCandidates[0]?.id;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));

  const catalog = readJson(args.catalogPath);
  const rubric = readJson(args.rubricPath);
  const decision = readJson(args.decisionPath);

  const evidenceIds = validateCatalog(catalog);
  const rubricMeta = validateRubric(rubric, evidenceIds);
  validateDecision(decision, rubricMeta);

  const scorecard = rubric.candidates.map((candidate) => scoreCandidate(candidate, rubricMeta));
  const winnerCandidateId = findWinner(rubric, scorecard);

  if (!winnerCandidateId) {
    fail("Unable to determine winner candidate");
  }

  if (winnerCandidateId !== decision.selectedCandidateId) {
    fail(
      `Selected candidate ${decision.selectedCandidateId} does not match computed winner ${winnerCandidateId}`
    );
  }

  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    validatorVersion: "1.0.0",
    decisionId: decision.id,
    decisionStatus: decision.status,
    selectedCandidateId: decision.selectedCandidateId,
    winnerCandidateId,
    hardGateCriteria: rubricMeta.gateCriteria.map((criterion) => criterion.id),
    weightedCriteria: rubricMeta.weightedCriteria.map((criterion) => ({
      id: criterion.id,
      weight: criterion.weight
    })),
    scorecard,
    evidenceCoverage: {
      totalEvidenceItems: catalog.evidence.length,
      referencedEvidenceItems: new Set(
        rubric.candidates
          .flatMap((candidate) => candidate.ratings)
          .flatMap((rating) => rating.evidenceIds)
      ).size
    },
    alternatives: rubric.candidates
      .filter((candidate) => candidate.id !== decision.selectedCandidateId)
      .map((candidate) => ({
        id: candidate.id,
        name: candidate.name,
        rejectedByHardGate:
          scorecard.find((entry) => entry.id === candidate.id)?.rejectedByHardGate ?? false,
        normalizedScore: scorecard.find((entry) => entry.id === candidate.id)?.normalizedScore ?? 0
      }))
  };

  writeFileSync(args.outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Stack decision validation passed: ${decision.selectedCandidateId}`);
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Stack decision validation failed: ${message}`);
  process.exitCode = 1;
}
