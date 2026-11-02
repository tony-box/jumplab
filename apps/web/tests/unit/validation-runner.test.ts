import { describe, expect, it } from "vitest";

import suiteFixture from "../../../../tests/fixtures/validation/suite-v1.json";
import {
  createValidationRunnerFromSuiteFixture,
  reconcileValidationSummary,
  REFERENCE_FIXTURE_DISCLOSURE,
  type ValidationSuiteSnapshot
} from "../../src/features/validation/validation-runner";

const DT_SHIPPED = 1 / 240;
const DT_FINE = 1 / 480;
const DT_COARSE = 1 / 60;

describe("validation runner", () => {
  it("emits deterministic running transitions, settles rows monotonically, and reconciles summary exactly", async () => {
    const runner = createValidationRunnerFromSuiteFixture(suiteFixture);
    const updates: ValidationSuiteSnapshot[] = [];

    const result = await runner.run(DT_SHIPPED, (snapshot) => {
      updates.push(snapshot);
    });

    expect(updates.length).toBeGreaterThan(2);
    expect(updates[0]?.status).toBe("running");
    expect(result.status).toBe("completed");
    expect(result.summary.running).toBe(0);

    const historyById = new Map<string, string[]>();
    for (const snapshot of updates) {
      for (const row of snapshot.rows) {
        const history = historyById.get(row.id) ?? [];
        history.push(row.status);
        historyById.set(row.id, history);
      }
    }

    for (const [rowId, states] of historyById.entries()) {
      const firstSettled = states.findIndex((status) => status !== "idle" && status !== "running");
      if (firstSettled === -1) {
        continue;
      }
      for (let index = firstSettled + 1; index < states.length; index += 1) {
        expect(states[index], `row ${rowId} regressed to running`).not.toBe("running");
        expect(states[index], `row ${rowId} regressed to idle`).not.toBe("idle");
      }
    }

    const pending = result.rows.filter((row) => row.category === "pending");
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((row) => row.status === "awaiting-core")).toBe(true);
    expect(pending.every((row) => row.owner && row.blockedGate)).toBe(true);

    const expected = reconcileValidationSummary(result.rows, result.summary.wallTimeMs);
    expect(result.summary).toEqual(expected);
    expect(result.summary.checks).toBe(
      result.summary.passing + result.summary.failing + result.summary.awaitingCore
    );
  });

  it("replays every recorded profile to completion without injected failures", async () => {
    const runner = createValidationRunnerFromSuiteFixture(suiteFixture);

    for (const dt of [DT_FINE, DT_COARSE]) {
      const result = await runner.run(dt);

      expect(result.status).toBe("completed");
      expect(result.error).toBeNull();
      expect(result.summary.running).toBe(0);
      expect(result.summary.budgetExceeded).toBe(0);
      expect(result.rows.some((row) => row.status === "budget-exceeded")).toBe(false);
      expect(result.summary.checks).toBe(
        result.summary.passing + result.summary.failing + result.summary.awaitingCore
      );

      const pending = result.rows.filter((row) => row.category === "pending");
      expect(pending.every((row) => row.status === "awaiting-core")).toBe(true);
      expect(pending.every((row) => row.owner !== null && row.blockedGate !== null)).toBe(true);
    }
  });

  it("labels results as a recorded reference fixture rather than a live measurement", async () => {
    const runner = createValidationRunnerFromSuiteFixture(suiteFixture);
    const result = await runner.run(DT_SHIPPED);

    expect(result.source).toBe("representative-fixture");
    expect(result.disclosure).toBe(REFERENCE_FIXTURE_DISCLOSURE);
    expect(result.disclosure).toMatch(/recorded reference fixture/i);
    expect(result.disclosure).toMatch(/not measured live/i);
    expect(result.disclosure).not.toMatch(/calculated in this browser/i);
  });
});
