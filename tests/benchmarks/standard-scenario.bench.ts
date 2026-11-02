import { describe, expect, it } from "vitest";

import { runStandardBenchmark } from "../../scripts/run-standard-benchmark.mjs";

describe("standard scenario benchmark", () => {
  it("measures solve, progress, and cancellation latency", async () => {
    const result = await runStandardBenchmark({ runs: 2 });

    expect(result.solve.p95Ms).toBeGreaterThan(0);
    expect(result.solve.p95Ms).toBeLessThan(5_000);
    expect(result.solve.status).toBe("pass");
    expect(result.progress.monotonic).toBe(true);
    expect(result.progress.status).toBe("pass");
    expect(result.cancel.p95Ms).toBeGreaterThan(0);
    expect(result.cancel.p95Ms).toBeLessThan(250);
    expect(result.cancel.status).toBe("pass");
  }, 120_000);
});
