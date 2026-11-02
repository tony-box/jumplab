import Dexie, { type EntityTable } from "dexie";

import type {
  ModelMetadata,
  ProviderSource,
  RunResult,
  Scenario
} from "../../../../packages/schema/src/index";

export type ScenarioRecord = {
  id: string;
  name: string;
  contentHash: string;
  updatedAt: string;
  scenario: Scenario;
};

export type RunRecord = {
  runId: string;
  scenarioId: string | null;
  createdAt: string;
  source: ProviderSource;
  scenarioSnapshot: Scenario | null;
  scenarioHash: string;
  model: ModelMetadata;
  persistenceVersion?: 2;
  legacySnapshotMissing?: true;
  result: RunResult;
  frameBuffer: ArrayBuffer;
  telemetryBuffer: ArrayBuffer;
};

type LegacyRunRecord = {
  runId: string;
  scenarioId: string;
  createdAt: string;
  result: RunResult;
  frameBuffer: ArrayBuffer;
  telemetryBuffer: ArrayBuffer;
};

export class BikeJumperDatabase extends Dexie {
  scenarios!: EntityTable<ScenarioRecord, "id">;
  runs!: EntityTable<RunRecord, "runId">;

  constructor(name = "bike-jumper") {
    super(name);
    this.version(1).stores({
      scenarios: "id, name, updatedAt",
      runs: "runId, scenarioId, createdAt"
    });
    this.version(2)
      .stores({
        scenarios: "id, name, updatedAt",
        runs: "runId, scenarioId, createdAt, source"
      })
      .upgrade(async (transaction) => {
        const table = transaction.table("runs");
        await table.toCollection().modify((record: LegacyRunRecord) => {
          (record as unknown as RunRecord).scenarioId = record.scenarioId ?? null;
          (record as unknown as RunRecord).source = "solver";
          (record as unknown as RunRecord).scenarioSnapshot = null;
          (record as unknown as RunRecord).scenarioHash = record.result.scenarioHash;
          (record as unknown as RunRecord).model = {
            scenarioSchemaVersion: 1,
            solverVersion: record.result.solverVersion,
            modelVersion: "legacy-v1",
            assumptionsId: "legacy",
            unitSystemId: "legacy",
            metricDefinitionVersion: "legacy",
            terrainSampleStep: 0.1
          };
          (record as unknown as RunRecord).legacySnapshotMissing = true;
        });
      });
    this.version(3)
      .stores({
        scenarios: "id, name, updatedAt",
        runs: "runId, scenarioId, createdAt, source"
      })
      .upgrade(async (transaction) => {
        await transaction
          .table("runs")
          .toCollection()
          .modify((record: RunRecord) => {
            record.persistenceVersion = 2;
            record.model.terrainSampleStep ??= 0.1;
          });
      });
  }
}

export const createDatabase = (name?: string): BikeJumperDatabase => new BikeJumperDatabase(name);
