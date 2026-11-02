import "fake-indexeddb/auto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dexie from "dexie";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  SCENARIO_FILE_FORMAT,
  hashScenario,
  runArtifactSchema,
  runResultSchema,
  scenarioSchema
} from "../../../../packages/schema/src/index";
import { createDatabase, type BikeJumperDatabase } from "../../src/storage/database";
import { createRepositories } from "../../src/storage/repositories";
import { exportScenarioBlob, importScenarioBlob } from "../../src/storage/scenario-files";

const scenario = scenarioSchema.parse(
  JSON.parse(readFileSync(resolve("tests/fixtures/scenarios/standard-v1.json"), "utf8"))
);
const result = runResultSchema.parse(
  JSON.parse(readFileSync(resolve("tests/fixtures/run-results/standard-v2.json"), "utf8"))
);

let database: BikeJumperDatabase;

describe("offline persistence", () => {
  beforeEach(() => {
    database = createDatabase(`bike-jumper-test-${crypto.randomUUID()}`);
  });

  afterEach(async () => {
    const name = database.name;
    database.close();
    await Dexie.delete(name);
  });

  it("prunes all but the newest runs without reading their buffers", async () => {
    const repositories = createRepositories(database);
    const ids = Array.from(
      { length: 4 },
      (_, index) => `00000000-0000-4000-8000-00000000000${index}`
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    for (const [index, runId] of ids.entries()) {
      vi.setSystemTime(new Date(`2026-01-0${index + 1}T00:00:00.000Z`));
      await repositories.runs.save(
        scenario.id,
        { ...result, runId },
        new Float32Array([index]).buffer,
        new Float32Array([index]).buffer
      );
    }
    vi.useRealTimers();

    expect(await repositories.runs.prune(2)).toBe(2);
    expect((await repositories.runs.list()).map((run) => run.runId)).toEqual([ids[3], ids[2]]);
  });

  it("saves scenarios and immutable run buffers in versioned Dexie stores", async () => {
    const repositories = createRepositories(database);
    const contentHash = await hashScenario(scenario);
    const frameBuffer = new Float32Array([1, 2, 3]).buffer;
    const telemetryBuffer = new Float32Array([4, 5]).buffer;

    await repositories.scenarios.save(scenario);
    await repositories.runs.save(scenario.id, result, frameBuffer, telemetryBuffer);

    const storedScenario = await repositories.scenarios.get(scenario.id);
    const storedRun = await repositories.runs.get(result.runId);
    expect(storedScenario?.contentHash).toBe(contentHash);
    expect(Array.from(new Float32Array(storedRun?.frameBuffer))).toEqual([1, 2, 3]);
    expect(storedRun?.frameBuffer).not.toBe(frameBuffer);
  });

  it("saves, duplicates, and reopens complete v3 bicycle geometry with canonical hashes", async () => {
    const repositories = createRepositories(database);
    const saved = await repositories.scenarios.save(scenario);
    const duplicate = await repositories.scenarios.duplicate(
      scenario.id,
      "10000000-0000-4000-8000-000000000001"
    );
    const reopened = await repositories.scenarios.get(duplicate.id);

    expect(saved.contentHash).toBe(await hashScenario(scenario));
    expect(duplicate.id).not.toBe(scenario.id);
    expect(duplicate.name).toBe(`${scenario.name} Copy`);
    expect(reopened?.scenario.bike).toEqual(scenario.bike);
    expect(reopened?.scenario.poseClip.keys).toEqual(scenario.poseClip.keys);
    expect(reopened?.contentHash).toBe(await hashScenario(reopened?.scenario));
  });

  it("includes geometry in canonical hashes and refuses derived conflict persistence", async () => {
    const repositories = createRepositories(database);
    const changed = structuredClone(scenario);
    changed.bike.geometry.seatTubeLength += 0.01;

    expect(await hashScenario(changed)).not.toBe(await hashScenario(scenario));
    await expect(
      repositories.scenarios.save({
        ...scenario,
        designConflicts: [{ code: "derived-only" }]
      } as typeof scenario)
    ).rejects.toThrow();
    expect(await repositories.scenarios.get(scenario.id)).toBeUndefined();
  });

  it("round-trips the whole current scenario and migrates legacy v2 files without changing poses", async () => {
    const exported = await exportScenarioBlob(
      scenario,
      { appVersion: "0.1.0", solverVersion: scenario.solver.solverVersion },
      "2026-01-01T00:00:00.000Z"
    );
    const roundTrip = await importScenarioBlob(exported);
    expect(roundTrip.schemaVersion).toBe(4);
    expect(roundTrip.scenario).toEqual(scenario);
    expect(roundTrip.contentHash).toBe(await hashScenario(scenario));

    const legacyScenario = JSON.parse(
      readFileSync(resolve("tests/fixtures/scenarios/geometry-v2/standard-v2.input.json"), "utf8")
    );
    const legacyBlob = new Blob([
      JSON.stringify({
        format: SCENARIO_FILE_FORMAT,
        schemaVersion: 2,
        exportedBy: {
          appVersion: "0.1.0",
          solverVersion: legacyScenario.solver.solverVersion,
          exportedAt: "2026-01-01T00:00:00.000Z"
        },
        scenario: legacyScenario,
        contentHash: await hashScenario(legacyScenario)
      })
    ]);
    const migrated = await importScenarioBlob(legacyBlob);

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.scenario.schemaVersion).toBe(4);
    expect(migrated.scenario.bike.geometry.modelVersion).toBe(1);
    expect(migrated.scenario.poseClip.keys).toEqual(legacyScenario.poseClip.keys);
    expect(migrated.contentHash).toBe(await hashScenario(migrated.scenario));
  });

  it("saves snapshot-aware run artifacts and keeps immutable read copies", async () => {
    const repositories = createRepositories(database);
    const artifact = runArtifactSchema.parse({
      runId: result.runId,
      createdAt: "2026-01-01T00:00:00.000Z",
      scenarioSnapshot: scenario,
      scenarioHash: result.scenarioHash,
      manifest: result,
      model: {
        scenarioSchemaVersion: 1,
        solverVersion: result.solverVersion,
        modelVersion: "model-v1",
        assumptionsId: "assumptions-v1",
        unitSystemId: "si-v1",
        metricDefinitionVersion: "metrics-v1"
      },
      frameBuffer: new Float32Array([1, 2, 3, 4]).buffer,
      telemetryBuffer: new Float32Array([5, 6]).buffer,
      source: "solver"
    });

    await repositories.runs.saveArtifact(artifact);
    const firstRead = await repositories.runs.get(result.runId);
    const secondRead = await repositories.runs.get(result.runId);

    expect(firstRead?.scenarioSnapshot?.id).toBe(scenario.id);
    expect(firstRead?.legacySnapshotMissing).toBeUndefined();

    if (firstRead && secondRead) {
      new Float32Array(firstRead.frameBuffer)[0] = 999;
      expect(new Float32Array(secondRead.frameBuffer)[0]).toBe(1);
    }
  });

  it("replaces derived solution fields while preserving saved inputs and identity", async () => {
    const repositories = createRepositories(database);
    const scenarioHash = await hashScenario(scenario);
    const artifact = runArtifactSchema.parse({
      runId: result.runId,
      createdAt: "2026-01-01T00:00:00.000Z",
      scenarioSnapshot: scenario,
      scenarioHash,
      manifest: { ...result, scenarioHash },
      model: {
        scenarioSchemaVersion: 1,
        solverVersion: result.solverVersion,
        modelVersion: "model-v1",
        assumptionsId: "assumptions-v1",
        unitSystemId: "si-v1",
        metricDefinitionVersion: "metrics-v1",
        terrainSampleStep: 0.1
      },
      frameBuffer: new Float32Array(36).buffer,
      telemetryBuffer: new Float32Array([5, 6]).buffer,
      source: "solver"
    });
    await repositories.runs.saveArtifact(artifact);

    const replacementFrameBuffer = new Float32Array(72).fill(7).buffer;
    const replaced = await repositories.runs.replaceSolution(result.runId, {
      scenarioSnapshot: artifact.scenarioSnapshot,
      scenarioHash: artifact.scenarioHash,
      manifest: { ...artifact.manifest },
      model: { ...artifact.model, modelVersion: "model-v2" },
      frameBuffer: replacementFrameBuffer,
      telemetryBuffer: new Float32Array([8, 9]).buffer,
      source: "solver"
    });

    expect(replaced.runId).toBe(artifact.runId);
    expect(replaced.createdAt).toBe(artifact.createdAt);
    expect(replaced.scenarioSnapshot).toEqual(artifact.scenarioSnapshot);
    expect(replaced.scenarioHash).toBe(artifact.scenarioHash);
    expect(replaced.model.modelVersion).toBe("model-v2");
    expect(replaced.frameBuffer).not.toBe(replacementFrameBuffer);
    expect(new Float32Array(replaced.frameBuffer)).toHaveLength(72);
  });

  it("rolls back a derived solution replacement when final validation fails", async () => {
    const repositories = createRepositories(database);
    const scenarioHash = await hashScenario(scenario);
    const artifact = runArtifactSchema.parse({
      runId: result.runId,
      createdAt: "2026-01-01T00:00:00.000Z",
      scenarioSnapshot: scenario,
      scenarioHash,
      manifest: { ...result, scenarioHash },
      model: {
        scenarioSchemaVersion: 1,
        solverVersion: result.solverVersion,
        modelVersion: "model-v1",
        assumptionsId: "assumptions-v1",
        unitSystemId: "si-v1",
        metricDefinitionVersion: "metrics-v1",
        terrainSampleStep: 0.1
      },
      frameBuffer: new Float32Array(36).buffer,
      telemetryBuffer: new Float32Array([5, 6]).buffer,
      source: "solver"
    });
    await repositories.runs.saveArtifact(artifact);

    await expect(
      repositories.runs.replaceSolution(result.runId, {
        scenarioSnapshot: artifact.scenarioSnapshot,
        scenarioHash: artifact.scenarioHash,
        manifest: { ...artifact.manifest, solverVersion: "mismatched-solver" },
        model: artifact.model,
        frameBuffer: new Float32Array(72).buffer,
        telemetryBuffer: new Float32Array([8, 9]).buffer,
        source: "solver"
      })
    ).rejects.toThrow("model.solverVersion must match manifest.solverVersion");

    const stored = await repositories.runs.get(result.runId);
    expect(stored?.model.modelVersion).toBe("model-v1");
    expect(new Float32Array(stored?.frameBuffer)).toHaveLength(36);
  });

  it("preserves the original record when the replacement transaction aborts after put", async () => {
    const repositories = createRepositories(database);
    const scenarioHash = await hashScenario(scenario);
    const artifact = runArtifactSchema.parse({
      runId: result.runId,
      createdAt: "2026-01-01T00:00:00.000Z",
      scenarioSnapshot: scenario,
      scenarioHash,
      manifest: { ...result, scenarioHash },
      model: {
        scenarioSchemaVersion: 1,
        solverVersion: result.solverVersion,
        modelVersion: "model-v1",
        assumptionsId: "assumptions-v1",
        unitSystemId: "si-v1",
        metricDefinitionVersion: "metrics-v1",
        terrainSampleStep: 0.1
      },
      frameBuffer: new Float32Array(36).buffer,
      telemetryBuffer: new Float32Array([5, 6]).buffer,
      source: "solver"
    });
    await repositories.runs.saveArtifact(artifact);

    const originalPut = database.runs.put.bind(database.runs);
    vi.spyOn(database.runs, "put").mockImplementationOnce(async (record) => {
      await originalPut(record);
      throw new Error("forced transaction abort");
    });

    await expect(
      repositories.runs.replaceSolution(result.runId, {
        scenarioSnapshot: artifact.scenarioSnapshot,
        scenarioHash: artifact.scenarioHash,
        manifest: artifact.manifest,
        model: { ...artifact.model, modelVersion: "model-v2" },
        frameBuffer: new Float32Array(72).buffer,
        telemetryBuffer: new Float32Array([8, 9]).buffer,
        source: "solver"
      })
    ).rejects.toThrow("forced transaction abort");

    const stored = await repositories.runs.get(result.runId);
    expect(stored?.model.modelVersion).toBe("model-v1");
    expect(new Float32Array(stored?.frameBuffer)).toHaveLength(36);
  });

  it("preserves legacy records with explicit missing snapshot metadata", async () => {
    const repositories = createRepositories(database);

    await repositories.runs.save(
      scenario.id,
      { ...result, runId: crypto.randomUUID() },
      new Float32Array([1, 2, 3]).buffer,
      new Float32Array([4, 5]).buffer
    );

    const records = await repositories.runs.list();
    expect(records.length).toBe(1);
    expect(records[0]?.legacySnapshotMissing).toBe(true);
    expect(records[0]?.scenarioSnapshot).toBeNull();
  });

  it("upgrades Dexie v2 records with logical persistence metadata without restoring snapshots", async () => {
    const name = database.name;
    database.close();
    const versionTwo = new Dexie(name);
    versionTwo.version(1).stores({
      scenarios: "id, name, updatedAt",
      runs: "runId, scenarioId, createdAt"
    });
    versionTwo.version(2).stores({
      scenarios: "id, name, updatedAt",
      runs: "runId, scenarioId, createdAt, source"
    });
    await versionTwo.open();
    await versionTwo.table("runs").put({
      runId: result.runId,
      scenarioId: scenario.id,
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "solver",
      scenarioSnapshot: null,
      scenarioHash: result.scenarioHash,
      model: {
        scenarioSchemaVersion: 1,
        solverVersion: result.solverVersion,
        modelVersion: "legacy-v1",
        assumptionsId: "legacy",
        unitSystemId: "legacy",
        metricDefinitionVersion: "legacy"
      },
      legacySnapshotMissing: true,
      result,
      frameBuffer: new Float32Array(31).buffer,
      telemetryBuffer: new ArrayBuffer(0)
    });
    versionTwo.close();

    database = createDatabase(name);
    const upgraded = await database.runs.get(result.runId);

    expect(upgraded?.persistenceVersion).toBe(2);
    expect(upgraded?.model.terrainSampleStep).toBe(0.1);
    expect(upgraded?.legacySnapshotMissing).toBe(true);
    expect(upgraded?.scenarioSnapshot).toBeNull();
  });

  it("throws storage quota errors with actionable messaging", async () => {
    const repositories = createRepositories(database);
    const put = vi
      .spyOn(database.runs, "put")
      .mockRejectedValue(new DOMException("quota", "QuotaExceededError"));

    await expect(
      repositories.runs.save(
        scenario.id,
        result,
        new Float32Array([1, 2, 3]).buffer,
        new Float32Array([4, 5]).buffer
      )
    ).rejects.toThrow("Local storage quota was exceeded");

    put.mockRestore();
  });

  it("round-trips canonical exports and rejects tampering before commit", async () => {
    const blob = await exportScenarioBlob(
      scenario,
      { appVersion: "0.1.0", solverVersion: scenario.solver.solverVersion },
      "2026-01-01T00:00:00.000Z"
    );
    const commit = vi.fn();
    const imported = await importScenarioBlob(blob, commit);
    expect(imported.scenario).toEqual(scenario);
    expect(commit).toHaveBeenCalledOnce();

    const tampered = JSON.parse(await blob.text());
    tampered.scenario.entry.speed = 29;
    const rejectedCommit = vi.fn();
    await expect(
      importScenarioBlob(
        new Blob([JSON.stringify(tampered)], { type: "application/json" }),
        rejectedCommit
      )
    ).rejects.toThrow("content hash mismatch");
    expect(rejectedCommit).not.toHaveBeenCalled();
  });
});
