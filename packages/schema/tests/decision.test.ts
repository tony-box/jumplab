import { describe, expect, it } from "vitest";

import {
  decisionPackageSchema,
  decisionRecordSchema,
  type DecisionPackage,
  type DecisionRecord
} from "../src/index";

const baseDecisionPackage: DecisionPackage = {
  criteria: [
    {
      id: "physics-determinism",
      name: "Physics determinism",
      kind: "weighted",
      weight: 60,
      sourceRefs: ["FR-006", "FR-007"],
      acceptanceRule: "Score 1-5 from parity and determinism evidence."
    },
    {
      id: "offline-gate",
      name: "Offline capability gate",
      kind: "gate",
      weight: 0,
      sourceRefs: ["FR-017"],
      acceptanceRule: "Must support core workflows offline after first successful load."
    },
    {
      id: "maintainability",
      name: "Maintainability",
      kind: "weighted",
      weight: 40,
      sourceRefs: ["FR-014"],
      acceptanceRule: "Score 1-5 from boundary clarity and migration plan quality."
    }
  ],
  evidenceCatalog: [
    {
      id: "ev-rapier-determinism",
      kind: "primary-doc",
      title: "Rapier determinism documentation",
      source: "https://rapier.rs/docs/user_guides/rust/determinism",
      observedAt: "2026-08-24",
      claim: "Enhanced determinism mode is designed for reproducible IEEE-754 targets."
    },
    {
      id: "ev-offline-requirement",
      kind: "validation-result",
      title: "Offline requirement contract",
      source: "specs/001-stack-evaluation/spec.md",
      observedAt: "2026-08-24",
      claim: "Core workflows must run offline after first successful load."
    },
    {
      id: "ev-maintenance",
      kind: "primary-doc",
      title: "Maintenance boundaries",
      source: "specs/001-stack-evaluation/research.md",
      observedAt: "2026-08-24",
      claim: "Boundaries and revisit triggers are documented for future updates."
    }
  ],
  candidates: [
    {
      id: "cand-rust-rapier",
      stackAreaIds: ["physics", "worker"],
      name: "Rust Rapier kernel in dedicated worker",
      versionBaseline: "rapier2d 0.35.2",
      license: "Apache-2.0",
      gateStatus: "pass",
      risks: ["WASM build complexity"],
      fallback: "Direct deterministic npm Rapier binding",
      ratings: [
        {
          criterionId: "physics-determinism",
          score: 5,
          gateResult: null,
          evidenceIds: ["ev-rapier-determinism"],
          notes: "Native and WASM parity evidence supports score 5."
        },
        {
          criterionId: "offline-gate",
          score: null,
          gateResult: true,
          evidenceIds: ["ev-offline-requirement"],
          notes: "Worker+WASM assets are cacheable for offline use."
        },
        {
          criterionId: "maintainability",
          score: 4,
          gateResult: null,
          evidenceIds: ["ev-maintenance"],
          notes: "Boundaries are explicit but Rust/WASM adds build steps."
        }
      ]
    },
    {
      id: "cand-main-thread",
      stackAreaIds: ["physics"],
      name: "Main-thread physics",
      versionBaseline: null,
      license: "MIT",
      gateStatus: "fail",
      risks: ["UI jank under heavy solve"],
      fallback: null,
      ratings: [
        {
          criterionId: "physics-determinism",
          score: 4,
          gateResult: null,
          evidenceIds: ["ev-rapier-determinism"],
          notes: "Could be deterministic but blocks responsiveness requirements."
        },
        {
          criterionId: "offline-gate",
          score: null,
          gateResult: true,
          evidenceIds: ["ev-offline-requirement"],
          notes: "Offline itself is feasible."
        },
        {
          criterionId: "maintainability",
          score: 2,
          gateResult: null,
          evidenceIds: ["ev-maintenance"],
          notes: "Mixes compute and UI concerns."
        }
      ]
    }
  ],
  decisionRecord: {
    id: "dr-001",
    stackAreaIds: ["physics", "worker"],
    selectedCandidateId: "cand-rust-rapier",
    rationale: "Best satisfies determinism and UI responsiveness gates.",
    rejectedCandidateIds: ["cand-main-thread"],
    singleCandidateJustification: null,
    riskIds: ["risk-wasm-build-complexity"],
    revisitTriggers: ["Determinism parity failure in supported browsers"],
    provisionallyApprovedBy: null,
    provisionallyApprovedAt: null,
    approvedBy: null,
    approvedAt: null,
    status: "draft",
    supersedes: null
  }
};

describe("decision schemas", () => {
  it("accepts draft records with complete candidate/criterion/evidence links", () => {
    expect(() => decisionPackageSchema.parse(baseDecisionPackage)).not.toThrow();
  });

  it("enforces approval lifecycle requirements", () => {
    const provisional: DecisionRecord = {
      ...baseDecisionPackage.decisionRecord,
      status: "provisionally-approved",
      provisionallyApprovedBy: "project-maintainer",
      provisionallyApprovedAt: "2026-08-24T20:15:00.000Z"
    };

    expect(() => decisionRecordSchema.parse(provisional)).not.toThrow();

    expect(() =>
      decisionRecordSchema.parse({
        ...provisional,
        provisionallyApprovedBy: null
      })
    ).toThrow();

    expect(() =>
      decisionRecordSchema.parse({
        ...provisional,
        status: "approved",
        approvedBy: null,
        approvedAt: "2026-08-24T20:16:00.000Z"
      })
    ).toThrow();
  });

  it("rejects invalid candidate and criterion shape", () => {
    expect(() =>
      decisionPackageSchema.parse({
        ...baseDecisionPackage,
        criteria: [
          ...baseDecisionPackage.criteria,
          {
            id: "ux",
            name: "UX",
            kind: "weighted",
            weight: 5,
            sourceRefs: ["FR-010"],
            acceptanceRule: "test"
          }
        ]
      })
    ).toThrow();

    expect(() =>
      decisionPackageSchema.parse({
        ...baseDecisionPackage,
        candidates: [
          {
            ...baseDecisionPackage.candidates[0],
            ratings: [
              ...baseDecisionPackage.candidates[0].ratings,
              {
                criterionId: "maintainability",
                score: 3,
                gateResult: null,
                evidenceIds: ["ev-maintenance"],
                notes: "duplicate criterion rating"
              }
            ]
          },
          baseDecisionPackage.candidates[1]
        ]
      })
    ).toThrow();
  });

  it("rejects evidence and approval references that cannot be resolved", () => {
    expect(() =>
      decisionPackageSchema.parse({
        ...baseDecisionPackage,
        candidates: [
          {
            ...baseDecisionPackage.candidates[0],
            ratings: [
              {
                ...baseDecisionPackage.candidates[0].ratings[0],
                evidenceIds: ["ev-missing"]
              },
              ...baseDecisionPackage.candidates[0].ratings.slice(1)
            ]
          },
          baseDecisionPackage.candidates[1]
        ]
      })
    ).toThrow();

    expect(() =>
      decisionPackageSchema.parse({
        ...baseDecisionPackage,
        decisionRecord: {
          ...baseDecisionPackage.decisionRecord,
          selectedCandidateId: "cand-unknown"
        }
      })
    ).toThrow();
  });
});
