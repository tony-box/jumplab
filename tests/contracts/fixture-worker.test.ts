import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  PROTOCOL_VERSION,
  runResultSchema,
  workerCommandSchema,
  workerEventSchema
} from "../../packages/schema/src/index";
import { createFixtureWorkerRuntime } from "../../apps/web/src/solver/fixture.worker";

const fixture = runResultSchema.parse(
  JSON.parse(readFileSync(resolve("tests", "fixtures", "run-results", "standard-v1.json"), "utf8"))
);
const scenario = JSON.parse(
  readFileSync(resolve("tests", "fixtures", "scenarios", "standard-v1.json"), "utf8")
);

describe("fixture worker", () => {
  it("emits deterministic monotonic progress and fresh result buffers", () => {
    const runtime = createFixtureWorkerRuntime(fixture);
    const solve = workerCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: "solve",
      requestId: "11111111-1111-4111-8111-111111111111",
      runId: "22222222-2222-4222-8222-222222222222",
      scenario
    });

    const first = runtime.handleCommand(solve).map((event) => workerEventSchema.parse(event));
    const second = runtime.handleCommand(solve).map((event) => workerEventSchema.parse(event));
    const progress = first.filter((event) => event.type === "progress");
    const result = first.find((event) => event.type === "result");
    const repeatedResult = second.find((event) => event.type === "result");

    expect(progress.map((event) => event.fraction)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(result?.type).toBe("result");
    expect(repeatedResult?.type).toBe("result");
    if (result?.type === "result" && repeatedResult?.type === "result") {
      expect(result.manifest.resultHash).toBe(fixture.resultHash);
      expect(result.frameBuffer).not.toBe(repeatedResult.frameBuffer);
      expect(result.frameBuffer.byteLength).toBe(
        fixture.frameCount * fixture.frameLayout.strideFloat32 * Float32Array.BYTES_PER_ELEMENT
      );
    }
  });

  it("emits cancellation and deterministic configured failures", () => {
    const cancelRuntime = createFixtureWorkerRuntime(fixture);
    const cancelled = cancelRuntime.handleCommand(
      workerCommandSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "cancel",
        requestId: "11111111-1111-4111-8111-111111111111",
        runId: "22222222-2222-4222-8222-222222222222"
      })
    );
    expect(workerEventSchema.parse(cancelled[0]).type).toBe("cancelled");

    const failed = createFixtureWorkerRuntime(fixture, { failSolve: true }).handleCommand(
      workerCommandSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "solve",
        requestId: "11111111-1111-4111-8111-111111111111",
        runId: "22222222-2222-4222-8222-222222222222",
        scenario
      })
    );
    expect(workerEventSchema.parse(failed[0])).toMatchObject({
      type: "error",
      code: "internal_error",
      recoverable: true
    });
  });
});
