import { describe, expect, it } from "vitest";

import {
  transitionDecision,
  validateEvidenceFreshness,
  validateExceptions
} from "../../scripts/manage-stack-decision.mjs";

const base = {
  id: "DR-test",
  status: "draft",
  provisionallyApprovedBy: null,
  provisionallyApprovedAt: null,
  approvedBy: null,
  approvedAt: null,
  supersedes: null
};

describe("decision lifecycle", () => {
  it("requires ordered approval transitions and fresh evidence", () => {
    const provisional = transitionDecision(base, "provisionally-approved", {
      actor: "maintainer",
      at: "2026-08-25T00:00:00.000Z"
    });
    const complete = transitionDecision(provisional, "evidence-complete", {
      actor: "maintainer",
      at: "2026-08-25T00:00:00.000Z",
      evidence: [{ id: "gate", observedAt: "2026-08-24" }]
    });
    const approved = transitionDecision(complete, "approved", {
      actor: "maintainer",
      at: "2026-08-25T00:00:00.000Z",
      maintainerSignoff: true
    });
    expect(approved.status).toBe("approved");
    expect(() => transitionDecision(base, "approved", { actor: "maintainer" })).toThrow(
      /Invalid decision transition/
    );
  });

  it("rejects stale evidence and expired exceptions", () => {
    expect(() =>
      validateEvidenceFreshness(
        [{ id: "old", observedAt: "2025-01-01" }],
        new Date("2026-08-25"),
        60
      )
    ).toThrow(/Stale evidence/);
    expect(() =>
      validateExceptions([{ id: "waiver", expiresAt: "2026-08-01" }], new Date("2026-08-25"))
    ).toThrow(/Expired exceptions/);
  });

  it("supersedes only approved decisions with an explicit replacement", () => {
    const approved = {
      ...base,
      status: "approved",
      provisionallyApprovedBy: "maintainer",
      provisionallyApprovedAt: "2026-08-24T00:00:00Z",
      approvedBy: "maintainer",
      approvedAt: "2026-08-25T00:00:00Z"
    };
    expect(
      transitionDecision(approved, "superseded", { actor: "maintainer", supersedes: "DR-next" })
        .supersedes
    ).toBe("DR-next");
    expect(() => transitionDecision(approved, "superseded", { actor: "maintainer" })).toThrow(
      /replacement/
    );
  });
});
