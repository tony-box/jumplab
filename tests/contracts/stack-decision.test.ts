import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

type JsonObject = Record<string, unknown>;

const validatorScript = join(process.cwd(), "scripts", "validate-stack-decision.mjs");

const makeFixtureSet = (overrides?: {
  rubric?: JsonObject;
  decision?: JsonObject;
  catalog?: JsonObject;
}) => {
  const catalog = {
    evidence: [
      {
        id: "ev-physics",
        kind: "primary-doc",
        title: "Rapier determinism",
        source: "https://rapier.rs/docs/user_guides/rust/determinism",
        observedAt: "2026-08-24",
        claim: "Deterministic mode supports reproducibility across targets."
      },
      {
        id: "ev-offline",
        kind: "primary-doc",
        title: "Service worker model",
        source: "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API",
        observedAt: "2026-08-24",
        claim: "Offline shell can serve cached assets after first load."
      },
      {
        id: "ev-maintainability",
        kind: "primary-doc",
        title: "Boundary rules",
        source: "specs/001-stack-evaluation/research.md",
        observedAt: "2026-08-24",
        claim: "Boundaries and fallback triggers are explicitly documented."
      }
    ]
  };

  const rubric = {
    schemaVersion: 1,
    generatedAt: "2026-08-24T12:00:00.000Z",
    criteria: [
      {
        id: "physics",
        name: "Physics correctness",
        kind: "weighted",
        weight: 50,
        sourceRefs: ["FR-006", "FR-007"],
        acceptanceRule: "Score from determinism and articulated dynamics evidence."
      },
      {
        id: "offline-gate",
        name: "Offline gate",
        kind: "gate",
        weight: 0,
        sourceRefs: ["FR-017"],
        acceptanceRule: "Core workflows must run offline after first successful load."
      },
      {
        id: "maintainability",
        name: "Maintainability",
        kind: "weighted",
        weight: 50,
        sourceRefs: ["FR-014"],
        acceptanceRule: "Score from clear boundaries and migration path quality."
      }
    ],
    tieBreakPolicy: {
      orderedCriteriaIds: ["physics", "maintainability"]
    },
    candidates: [
      {
        id: "cand-selected",
        stackAreaIds: ["physics", "worker"],
        name: "Rust + Rapier in dedicated worker",
        versionBaseline: "rapier2d 0.35.2",
        license: "Apache-2.0",
        ratings: [
          {
            criterionId: "physics",
            score: 5,
            gateResult: null,
            evidenceIds: ["ev-physics"],
            notes: "Best determinism evidence."
          },
          {
            criterionId: "offline-gate",
            score: null,
            gateResult: true,
            evidenceIds: ["ev-offline"],
            notes: "Offline shell can cache app and worker assets."
          },
          {
            criterionId: "maintainability",
            score: 4,
            gateResult: null,
            evidenceIds: ["ev-maintainability"],
            notes: "Clear boundaries with Rust/WASM complexity tradeoff."
          }
        ],
        risks: ["WASM build and toolchain complexity"],
        fallback: "Deterministic npm Rapier binding",
        alternatives: ["cand-alt", "cand-gated"]
      },
      {
        id: "cand-alt",
        stackAreaIds: ["physics"],
        name: "Direct deterministic npm Rapier usage",
        versionBaseline: "@dimforge/rapier2d-deterministic",
        license: "Apache-2.0",
        ratings: [
          {
            criterionId: "physics",
            score: 4,
            gateResult: null,
            evidenceIds: ["ev-physics"],
            notes: "Strong, but preprocessing could drift in JS."
          },
          {
            criterionId: "offline-gate",
            score: null,
            gateResult: true,
            evidenceIds: ["ev-offline"],
            notes: "Offline is achievable."
          },
          {
            criterionId: "maintainability",
            score: 4,
            gateResult: null,
            evidenceIds: ["ev-maintainability"],
            notes: "Simpler build than Rust/WASM."
          }
        ],
        risks: ["JS-side deterministic preprocessing risk"],
        fallback: null,
        alternatives: ["cand-selected"]
      },
      {
        id: "cand-gated",
        stackAreaIds: ["physics"],
        name: "Main-thread solver",
        versionBaseline: null,
        license: "MIT",
        ratings: [
          {
            criterionId: "physics",
            score: 5,
            gateResult: null,
            evidenceIds: ["ev-physics"],
            notes: "Physics can still be correct."
          },
          {
            criterionId: "offline-gate",
            score: null,
            gateResult: false,
            evidenceIds: ["ev-offline"],
            notes: "Fails responsiveness/cancel behavior gate when busy."
          },
          {
            criterionId: "maintainability",
            score: 5,
            gateResult: null,
            evidenceIds: ["ev-maintainability"],
            notes: "Single language, but architecture breaks required isolation."
          }
        ],
        risks: ["UI thread blocking"],
        fallback: null,
        alternatives: ["cand-selected"]
      }
    ]
  };

  const decision = {
    schemaVersion: 1,
    id: "dr-stack-001",
    stackAreaIds: ["physics", "worker", "offline"],
    selectedCandidateId: "cand-selected",
    rationale: "Best balances determinism and architecture safety under hard gates.",
    rejectedCandidateIds: ["cand-alt", "cand-gated"],
    singleCandidateJustification: null,
    riskIds: ["risk-wasm-build-complexity"],
    revisitTriggers: ["Cross-browser parity or benchmark gate failure"],
    provisionallyApprovedBy: "project-maintainer",
    provisionallyApprovedAt: "2026-08-24T20:30:00.000Z",
    approvedBy: null,
    approvedAt: null,
    status: "provisionally-approved",
    supersedes: null
  };

  return {
    catalog: { ...catalog, ...(overrides?.catalog ?? {}) },
    rubric: { ...rubric, ...(overrides?.rubric ?? {}) },
    decision: { ...decision, ...(overrides?.decision ?? {}) }
  };
};

const runValidator = (fixtures: {
  catalog: JsonObject;
  rubric: JsonObject;
  decision: JsonObject;
}) => {
  const tempDir = mkdtempSync(join(tmpdir(), "stack-decision-"));
  const catalogPath = join(tempDir, "catalog.json");
  const rubricPath = join(tempDir, "stack-rubric.json");
  const decisionPath = join(tempDir, "stack-decision.json");
  const outputPath = join(tempDir, "stack-validation.json");

  writeFileSync(catalogPath, JSON.stringify(fixtures.catalog, null, 2));
  writeFileSync(rubricPath, JSON.stringify(fixtures.rubric, null, 2));
  writeFileSync(decisionPath, JSON.stringify(fixtures.decision, null, 2));

  const result = spawnSync(
    process.execPath,
    [
      validatorScript,
      "--catalog",
      catalogPath,
      "--rubric",
      rubricPath,
      "--decision",
      decisionPath,
      "--output",
      outputPath
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  );

  const output = result.status === 0 ? JSON.parse(readFileSync(outputPath, "utf8")) : null;

  rmSync(tempDir, { recursive: true, force: true });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output
  };
};

describe("stack decision validator", () => {
  it("normalizes weighted scores and marks the selected candidate as the winner", () => {
    const result = runValidator(makeFixtureSet());

    expect(result.status).toBe(0);
    expect(result.output).toMatchObject({
      decisionStatus: "provisionally-approved",
      selectedCandidateId: "cand-selected",
      winnerCandidateId: "cand-selected"
    });

    const scorecard = (
      result.output as { scorecard: Array<{ id: string; normalizedScore: number }> }
    ).scorecard;
    const selected = scorecard.find((entry) => entry.id === "cand-selected");
    expect(selected?.normalizedScore).toBe(90);
  });

  it("rejects candidates that fail hard gates even if weighted scores are high", () => {
    const result = runValidator(makeFixtureSet());

    expect(result.status).toBe(0);

    const scorecard = (
      result.output as {
        scorecard: Array<{ id: string; hardGatePassed: boolean; rejectedByHardGate: boolean }>;
      }
    ).scorecard;

    const gated = scorecard.find((entry) => entry.id === "cand-gated");
    expect(gated).toMatchObject({
      hardGatePassed: false,
      rejectedByHardGate: true
    });
  });

  it("uses tie-break criteria when normalized weighted totals are equal", () => {
    const base = makeFixtureSet();

    const tieRubric = {
      ...base.rubric,
      candidates: [
        {
          ...(base.rubric as { candidates: JsonObject[] }).candidates[0],
          ratings: [
            {
              criterionId: "physics",
              score: 4,
              gateResult: null,
              evidenceIds: ["ev-physics"],
              notes: "tie"
            },
            {
              criterionId: "offline-gate",
              score: null,
              gateResult: true,
              evidenceIds: ["ev-offline"],
              notes: "pass"
            },
            {
              criterionId: "maintainability",
              score: 4,
              gateResult: null,
              evidenceIds: ["ev-maintainability"],
              notes: "tie"
            }
          ]
        },
        {
          ...(base.rubric as { candidates: JsonObject[] }).candidates[1],
          ratings: [
            {
              criterionId: "physics",
              score: 5,
              gateResult: null,
              evidenceIds: ["ev-physics"],
              notes: "wins tie-break by physics"
            },
            {
              criterionId: "offline-gate",
              score: null,
              gateResult: true,
              evidenceIds: ["ev-offline"],
              notes: "pass"
            },
            {
              criterionId: "maintainability",
              score: 3,
              gateResult: null,
              evidenceIds: ["ev-maintainability"],
              notes: "keeps same weighted total"
            }
          ]
        },
        (base.rubric as { candidates: JsonObject[] }).candidates[2]
      ]
    };

    const result = runValidator(
      makeFixtureSet({
        rubric: tieRubric,
        decision: {
          selectedCandidateId: "cand-alt",
          rejectedCandidateIds: ["cand-selected", "cand-gated"]
        }
      })
    );

    expect(result.status).toBe(0);
    expect(result.output).toMatchObject({
      winnerCandidateId: "cand-alt",
      selectedCandidateId: "cand-alt"
    });
  });

  it("fails when any candidate rating references missing evidence", () => {
    const base = makeFixtureSet();
    const missingEvidenceRubric = {
      ...base.rubric,
      candidates: [
        {
          ...(base.rubric as { candidates: JsonObject[] }).candidates[0],
          ratings: [
            {
              criterionId: "physics",
              score: 5,
              gateResult: null,
              evidenceIds: ["ev-does-not-exist"],
              notes: "missing evidence should fail validation"
            },
            {
              criterionId: "offline-gate",
              score: null,
              gateResult: true,
              evidenceIds: ["ev-offline"],
              notes: "pass"
            },
            {
              criterionId: "maintainability",
              score: 4,
              gateResult: null,
              evidenceIds: ["ev-maintainability"],
              notes: "pass"
            }
          ]
        },
        (base.rubric as { candidates: JsonObject[] }).candidates[1],
        (base.rubric as { candidates: JsonObject[] }).candidates[2]
      ]
    };

    const result = runValidator(makeFixtureSet({ rubric: missingEvidenceRubric }));

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("evidence");
  });
});
