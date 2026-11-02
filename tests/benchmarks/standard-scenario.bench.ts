import { describe, expect, it } from "vitest";

import { runStandardBenchmark } from "../../scripts/run-standard-benchmark.mjs";

describe("standard scenario benchmark", () => {
  it("measures solve and cancellation latency against their budgets", async () => {
    const result = await runStandardBenchmark({ runs: 2 });

    expect(result.solve.p95Ms).toBeGreaterThan(0);
    expect(result.solve.p95Ms).toBeLessThan(result.solve.budgetMs);
    expect(result.solve.status).toBe("pass");
    expect(result.cancel.p95Ms).toBeGreaterThan(0);
    expect(result.cancel.p95Ms).toBeLessThan(250);
    expect(result.cancel.status).toBe("pass");
  }, 120_000);
});
