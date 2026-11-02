import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  FRAME_STRIDE_FLOAT32,
  PROTOCOL_VERSION,
  runResultSchema,
  workerCommandSchema,
  workerEventSchema
} from "../../packages/schema/src/index";
import { createFixtureWorkerRuntime } from "../../apps/web/src/solver/fixture.worker";

const fixture = runResultSchema.parse(
  JSON.parse(readFileSync(resolve("tests", "fixtures", "run-results", "standard-v2.json"), "utf8"))
);
const scenario = JSON.parse(
  readFileSync(resolve("tests", "fixtures", "scenarios", "standard-v1.json"), "utf8")
);

const solveCommand = () =>
  workerCommandSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    type: "solve",
    requestId: "11111111-1111-4111-8111-111111111111",
    runId: "22222222-2222-4222-8222-222222222222",
    scenario
  });

describe("fixture worker", () => {
  it("uses the layout 3 standard solver fixture", () => {
    expect(fixture.frameLayout.version).toBe(3);
    expect(fixture.frameLayout.strideFloat32).toBe(FRAME_STRIDE_FLOAT32);
    expect(fixture.frameCount).toBe(293);
    expect(fixture.outputHz).toBe(60);
    expect(fixture.telemetry.sampleCount).toBe(fixture.frameCount);
  });

  it("advertises the two-body capability flags", () => {
    const events = createFixtureWorkerRuntime(fixture).handleCommand(
      workerCommandSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: "init",
        requestId: "11111111-1111-4111-8111-111111111111",
        appVersion: "0.2.0",
        expectedSolverVersion: fixture.solverVersion
      })
    );

    expect(events).toHaveLength(1);
    const ready = workerEventSchema.parse(events[0]);
    expect(ready.type).toBe("ready");
    if (ready.type !== "ready") return;
    expect(ready.solverVersion).toBe(fixture.solverVersion);
    expect(ready.capabilities).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      deterministic: true,
      ccd: true,
      contactImpulse: true,
      riderCoupling: false,
      riderInstinct: false,
      suspension: false
    });
  });

  it("returns exactly one deterministic result event with fresh buffers", () => {
    const runtime = createFixtureWorkerRuntime(fixture);
    const solve = solveCommand();

    const first = runtime.handleCommand(solve).map((event) => workerEventSchema.parse(event));
    const second = runtime.handleCommand(solve).map((event) => workerEventSchema.parse(event));

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first.some((event) => event.type === "progress")).toBe(false);
    const [result] = first;
    const [repeatedResult] = second;
    if (result?.type !== "result" || repeatedResult?.type !== "result") {
      throw new Error("fixture worker did not return a result");
    }

    expect(result.source).toBe("representative-fixture");
    expect(result.runId).toBe(solve.type === "solve" ? solve.runId : null);
    expect(result.manifest.runId).toBe(result.runId);
    expect(result.manifest.resultHash).toBe(fixture.resultHash);
    expect(result.manifest.landing).toEqual(fixture.landing);
    expect(result.manifest.landing).not.toBe(fixture.landing);
    expect(result.manifest.landing.reasons).not.toBe(fixture.landing.reasons);
    expect(result.manifest.telemetry).toEqual(fixture.telemetry);

    expect(result.frameBuffer).not.toBe(repeatedResult.frameBuffer);
    expect(new Float32Array(result.frameBuffer)).toEqual(
      new Float32Array(repeatedResult.frameBuffer)
    );
    expect(result.frameBuffer.byteLength).toBe(
      fixture.frameCount * fixture.frameLayout.strideFloat32 * Float32Array.BYTES_PER_ELEMENT
    );
    expect(result.telemetryBuffer.byteLength).toBe(
      fixture.telemetry.sampleCount *
        fixture.telemetry.strideFloat32 *
        Float32Array.BYTES_PER_ELEMENT
    );

    result.manifest.landing.reasons.push("mutated");
    result.manifest.phases[0]!.endFrame = 0;
    expect(fixture.landing.reasons).toEqual([]);
    expect(repeatedResult.manifest.phases[0]?.endFrame).toBe(fixture.phases[0]?.endFrame);
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
    expect(cancelled).toHaveLength(1);
    expect(workerEventSchema.parse(cancelled[0])).toMatchObject({
      type: "cancelled",
      runId: "22222222-2222-4222-8222-222222222222"
    });

    const failed = createFixtureWorkerRuntime(fixture, { failSolve: true }).handleCommand(
      solveCommand()
    );
    expect(failed).toHaveLength(1);
    expect(workerEventSchema.parse(failed[0])).toMatchObject({
      type: "error",
      runId: "22222222-2222-4222-8222-222222222222",
      code: "internal-error",
      recoverable: true
    });
  });
});
