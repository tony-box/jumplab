import {
  hashScenario,
  runArtifactSchema,
  scenarioSchema,
  type ModelMetadata,
  type ProviderSource,
  type RunArtifact,
  type RunResult,
  type Scenario
} from "../../../../packages/schema/src/index";

import type { BikeJumperDatabase, RunRecord, ScenarioRecord } from "./database";

export type DerivedRunSolution = Pick<
  RunArtifact,
  | "scenarioSnapshot"
  | "scenarioHash"
  | "manifest"
  | "model"
  | "frameBuffer"
  | "telemetryBuffer"
  | "source"
>;

export class StorageQuotaError extends Error {
  constructor() {
    super("Local storage quota was exceeded. Export or remove saved runs and try again.");
    this.name = "StorageQuotaError";
  }
}

const translateStorageError = (error: unknown): never => {
  if (
    error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")
  ) {
    throw new StorageQuotaError();
  }
  throw error;
};

const defaultModelMetadata = (solverVersion: string): ModelMetadata => ({
  scenarioSchemaVersion: 1,
  solverVersion,
  modelVersion: "legacy-v1",
  assumptionsId: "legacy",
  unitSystemId: "legacy",
  metricDefinitionVersion: "legacy",
  terrainSampleStep: 0.1
});

const cloneScenario = (scenario: Scenario): Scenario => structuredClone(scenario);
const cloneRunResult = (result: RunResult): RunResult => structuredClone(result);

const cloneRunRecord = (record: RunRecord): RunRecord => ({
  ...record,
  scenarioSnapshot: record.scenarioSnapshot ? cloneScenario(record.scenarioSnapshot) : null,
  result: cloneRunResult(record.result),
  model: { ...record.model },
  frameBuffer: record.frameBuffer.slice(0),
  telemetryBuffer: record.telemetryBuffer.slice(0)
});

export const createRepositories = (database: BikeJumperDatabase) => ({
  scenarios: {
    async save(scenario: Scenario): Promise<ScenarioRecord> {
      const validated = scenarioSchema.parse(scenario);
      const record: ScenarioRecord = {
        id: validated.id,
        name: validated.name,
        contentHash: await hashScenario(validated),
        updatedAt: new Date().toISOString(),
        scenario: cloneScenario(validated)
      };
      try {
        await database.scenarios.put(record);
        return { ...record, scenario: cloneScenario(record.scenario) };
      } catch (error) {
        return translateStorageError(error);
      }
    },
    get: (id: string) =>
      database.scenarios
        .get(id)
        .then((record) =>
          record ? { ...record, scenario: cloneScenario(record.scenario) } : undefined
        ),
    list: () =>
      database.scenarios
        .orderBy("updatedAt")
        .reverse()
        .toArray()
        .then((records) =>
          records.map((record) => ({ ...record, scenario: cloneScenario(record.scenario) }))
        )
  },
  runs: {
    async save(
      scenarioId: string,
      result: RunResult,
      frameBuffer: ArrayBuffer,
      telemetryBuffer: ArrayBuffer
    ): Promise<RunRecord> {
      const record: RunRecord = {
        runId: result.runId,
        scenarioId,
        createdAt: new Date().toISOString(),
        source: "solver",
        scenarioSnapshot: null,
        scenarioHash: result.scenarioHash,
        model: defaultModelMetadata(result.solverVersion),
        persistenceVersion: 2,
        legacySnapshotMissing: true,
        result,
        frameBuffer: frameBuffer.slice(0),
        telemetryBuffer: telemetryBuffer.slice(0)
      };
      try {
        await database.runs.put(record);
        return cloneRunRecord(record);
      } catch (error) {
        return translateStorageError(error);
      }
    },
    async saveArtifact(artifact: RunArtifact): Promise<RunRecord> {
      const validated = runArtifactSchema.parse(artifact);
      const record: RunRecord = {
        runId: validated.runId,
        scenarioId: validated.scenarioSnapshot.id,
        createdAt: validated.createdAt,
        source: validated.source as ProviderSource,
        scenarioSnapshot: cloneScenario(validated.scenarioSnapshot),
        scenarioHash: validated.scenarioHash,
        model: { ...validated.model },
        persistenceVersion: 2,
        result: cloneRunResult(validated.manifest),
        frameBuffer: validated.frameBuffer.slice(0),
        telemetryBuffer: validated.telemetryBuffer.slice(0)
      };
      try {
        await database.runs.put(record);
        return cloneRunRecord(record);
      } catch (error) {
        return translateStorageError(error);
      }
    },
    async replaceSolution(runId: string, derivedSolution: DerivedRunSolution): Promise<RunRecord> {
      try {
        return await database.transaction("rw", database.runs, async () => {
          const existing = await database.runs.get(runId);
          if (!existing) {
            throw new Error(`Run ${runId} does not exist`);
          }
          if (!existing.scenarioSnapshot || existing.legacySnapshotMissing) {
            throw new Error("Legacy run did not capture a scenario snapshot");
          }

          const validated = runArtifactSchema.parse({
            runId: existing.runId,
            createdAt: existing.createdAt,
            scenarioSnapshot: derivedSolution.scenarioSnapshot,
            scenarioHash: derivedSolution.scenarioHash,
            manifest: derivedSolution.manifest,
            model: derivedSolution.model,
            frameBuffer: derivedSolution.frameBuffer,
            telemetryBuffer: derivedSolution.telemetryBuffer,
            source: derivedSolution.source
          });
          const replacement: RunRecord = {
            ...existing,
            scenarioSnapshot: cloneScenario(validated.scenarioSnapshot),
            scenarioHash: validated.scenarioHash,
            source: validated.source,
            model: { ...validated.model },
            persistenceVersion: 2,
            result: cloneRunResult(validated.manifest),
            frameBuffer: validated.frameBuffer.slice(0),
            telemetryBuffer: validated.telemetryBuffer.slice(0)
          };

          await database.runs.put(replacement);
          return cloneRunRecord(replacement);
        });
      } catch (error) {
        return translateStorageError(error);
      }
    },
    async get(runId: string): Promise<RunRecord | undefined> {
      const record = await database.runs.get(runId);
      return record ? cloneRunRecord(record) : undefined;
    },
    list: () =>
      database.runs
        .orderBy("createdAt")
        .reverse()
        .toArray()
        .then((records) => records.map(cloneRunRecord)),
    remove: (runId: string) => database.runs.delete(runId),
    /** Deletes all but the newest `keep` runs, reading keys only. */
    prune: async (keep: number): Promise<number> => {
      const expired = await database.runs.orderBy("createdAt").reverse().offset(keep).primaryKeys();
      await database.runs.bulkDelete(expired);
      return expired.length;
    }
  }
});
