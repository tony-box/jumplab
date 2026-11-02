import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  FRAME_STRIDE_FLOAT32,
  hashScenario,
  runArtifactSchema,
  runResultSchema,
  scenarioSchema,
  type RunArtifact
} from "../../../../packages/schema/src/index";
import { versionManifest } from "../../src/app/version-manifest";
import type { RunArtifactRepository } from "../../src/app/services";
import { ensureCurrentRunArtifact } from "../../src/features/workbench/legacy-regeneration";

const scenario = scenarioSchema.parse(
  JSON.parse(readFileSync(resolve("tests/fixtures/scenarios/standard-v1.json"), "utf8"))
);
const result = runResultSchema.parse(
  JSON.parse(readFileSync(resolve("tests/fixtures/run-results/standard-v2.json"), "utf8"))
);
const legacySolverVersion = "rapier-0.35.2-two-wheel-contact-v4-geometry-v1";

const createArtifact = async (
  solverVersion = result.solverVersion,
  modelVersion = versionManifest.model
): Promise<RunArtifact> => {
  const scenarioHash = await hashScenario(scenario);
  return runArtifactSchema.parse({
    runId: result.runId,
    createdAt: "2026-01-01T00:00:00.000Z",
    scenarioSnapshot: scenario,
    scenarioHash,
    manifest: { ...result, solverVersion, scenarioHash },
    model: {
      scenarioSchemaVersion: versionManifest.schema,
      solverVersion,
      modelVersion,
      assumptionsId: "assumptions-v1",
      unitSystemId: "si-v1",
      metricDefinitionVersion: "metrics-v1",
      terrainSampleStep: 0.1
    },
    frameBuffer: new Float32Array(result.frameCount * FRAME_STRIDE_FLOAT32).buffer,
    telemetryBuffer: new Float32Array([1]).buffer,
    source: "solver"
  });
};

const createRepository = () =>
  ({
    save: vi.fn(async (artifact: RunArtifact) => artifact),
    replaceSolution: vi.fn(async (_runId: string, artifact: RunArtifact) => artifact),
    get: vi.fn(async () => null),
    getStored: vi.fn(async () => null),
    list: vi.fn(async () => []),
    remove: vi.fn(async () => undefined)
  }) satisfies RunArtifactRepository;

describe("legacy run regeneration", () => {
  it("returns a current valid run without solving", async () => {
    const artifact = await createArtifact(versionManifest.solver);
    const repository = createRepository();
    const solve = vi.fn();

    const outcome = await ensureCurrentRunArtifact({
      artifact,
      activeSolverVersion: versionManifest.solver,
      repository,
      solve
    });

    expect(outcome).toMatchObject({ state: "current", artifact, reason: null });
    expect(solve).not.toHaveBeenCalled();
    expect(repository.replaceSolution).not.toHaveBeenCalled();
  });

  it("regenerates an old valid run once and then treats it as current", async () => {
    const legacy = await createArtifact(legacySolverVersion);
    const regenerated = await createArtifact(versionManifest.solver);
    const repository = createRepository();
    repository.replaceSolution.mockResolvedValue(regenerated);
    const solve = vi.fn(async () => regenerated);

    const first = await ensureCurrentRunArtifact({
      artifact: legacy,
      activeSolverVersion: versionManifest.solver,
      repository,
      solve
    });
    const second = await ensureCurrentRunArtifact({
      artifact: first.artifact!,
      activeSolverVersion: versionManifest.solver,
      repository,
      solve
    });

    expect(first.state).toBe("regenerated");
    expect(second.state).toBe("current");
    expect(solve).toHaveBeenCalledOnce();
    expect(solve).toHaveBeenCalledWith(legacy.runId, legacy.scenarioSnapshot);
    expect(repository.replaceSolution).toHaveBeenCalledOnce();
  });

  it("blocks a snapshot hash mismatch without solving or replaying", async () => {
    const artifact = await createArtifact();
    artifact.scenarioHash = "0".repeat(64);
    artifact.manifest.scenarioHash = artifact.scenarioHash;
    const repository = createRepository();
    const solve = vi.fn();

    const outcome = await ensureCurrentRunArtifact({
      artifact,
      activeSolverVersion: versionManifest.solver,
      repository,
      solve
    });

    expect(outcome.state).toBe("unavailable");
    expect(outcome.artifact).toBeNull();
    expect(outcome.reason).toContain("hash");
    expect(solve).not.toHaveBeenCalled();
  });

  it("does not persist or replay when solving throws", async () => {
    const artifact = await createArtifact(legacySolverVersion);
    const repository = createRepository();
    const solve = vi.fn(async () => {
      throw new Error("solver diagnostic");
    });

    const outcome = await ensureCurrentRunArtifact({
      artifact,
      activeSolverVersion: versionManifest.solver,
      repository,
      solve
    });

    expect(outcome).toEqual({ state: "failed", artifact: null, reason: "solver diagnostic" });
    expect(repository.replaceSolution).not.toHaveBeenCalled();
  });

  it("regenerates current-version runs whose frame buffer has an invalid stride", async () => {
    const corrupt = await createArtifact(versionManifest.solver);
    corrupt.frameBuffer = new Float32Array(31).buffer;
    const regenerated = await createArtifact(versionManifest.solver);
    const repository = createRepository();
    const solve = vi.fn(async () => regenerated);

    const outcome = await ensureCurrentRunArtifact({
      artifact: corrupt,
      activeSolverVersion: versionManifest.solver,
      repository,
      solve
    });

    expect(outcome.state).toBe("regenerated");
    expect(solve).toHaveBeenCalledOnce();
  });

  it("regenerates runs whose model identity or scenario schema metadata is stale", async () => {
    const staleModel = await createArtifact(versionManifest.solver, "mass-distribution-v0");
    const staleSchema = await createArtifact(versionManifest.solver);
    staleSchema.model.scenarioSchemaVersion = 2;
    const regenerated = await createArtifact(versionManifest.solver);
    const repository = createRepository();
    repository.replaceSolution.mockResolvedValue(regenerated);
    const solve = vi.fn(async () => regenerated);

    const modelOutcome = await ensureCurrentRunArtifact({
      artifact: staleModel,
      activeSolverVersion: versionManifest.solver,
      repository,
      solve
    });
    const schemaOutcome = await ensureCurrentRunArtifact({
      artifact: staleSchema,
      activeSolverVersion: versionManifest.solver,
      repository,
      solve
    });

    expect(modelOutcome.state).toBe("regenerated");
    expect(schemaOutcome.state).toBe("regenerated");
    expect(solve).toHaveBeenCalledTimes(2);
  });

  it("blocks an unsupported scenario schema after verifying the original snapshot hash", async () => {
    const artifact = await createArtifact();
    artifact.model.scenarioSchemaVersion = 99;
    const repository = createRepository();
    const solve = vi.fn();

    const outcome = await ensureCurrentRunArtifact({
      artifact,
      activeSolverVersion: versionManifest.solver,
      repository,
      solve
    });

    expect(outcome.state).toBe("unavailable");
    expect(outcome.reason).toContain("Unsupported scenario version: 99");
    expect(solve).not.toHaveBeenCalled();
  });
});
