import {
  migrateScenarioValue,
  runArtifactSchema,
  runResultSchema,
  scenarioSchema,
  type RunArtifact
} from "../../../../packages/schema/src/index";
import fixtureRunJson from "../../../../tests/fixtures/run-results/standard-v2.json";
import standardScenarioJson from "../../../../tests/fixtures/scenarios/standard-v1.json";
import validationSuiteJson from "../../../../tests/fixtures/validation/suite-v1.json";

import type { AppServices } from "./services";
import { createScenarioCatalog } from "../features/library/scenario-catalog";
import {
  compareArtifactsConservative,
  exportArtifactFramesCsv
} from "../features/report/report-service";
import {
  createValidationRunnerFromSuiteFixture,
  type ValidationSuiteFixture
} from "../features/validation/validation-runner";
import { createSolverGateway } from "../solver/gateway";
import { createFixtureWorkerRuntime } from "../solver/fixture.worker";
import { createDatabase } from "../storage/database";
import { createRepositories } from "../storage/repositories";

const fixtureRun = runResultSchema.parse(fixtureRunJson);
const validationRunner = createValidationRunnerFromSuiteFixture(
  validationSuiteJson as ValidationSuiteFixture
);

const workerSource = import.meta.env.VITE_WORKER_SOURCE === "fixture" ? "fixture" : "solver";

/** Runs carry full frame buffers, so only the newest ones are kept. */
export const MAX_STORED_RUNS = 30;

const createScenarioStore = (
  repositories: ReturnType<typeof createRepositories>
): AppServices["scenarioStore"] => ({
  loadWorking: async () => {
    const [latest] = await repositories.scenarios.list();
    if (!latest) return null;
    try {
      return scenarioSchema.parse(migrateScenarioValue(latest.scenario));
    } catch {
      // A saved scenario that no longer validates is skipped rather than blocking startup.
      return null;
    }
  },
  saveWorking: async (scenario) => {
    await repositories.scenarios.save(scenario);
  }
});

const createRunArtifactRepository = (
  repositories: ReturnType<typeof createRepositories>
): AppServices["runArtifactRepository"] => {
  const toArtifact = (
    record: Awaited<ReturnType<typeof repositories.runs.get>>
  ): RunArtifact | null => {
    if (!record || !record.scenarioSnapshot) {
      return null;
    }

    return runArtifactSchema.parse({
      runId: record.runId,
      createdAt: record.createdAt,
      scenarioSnapshot: record.scenarioSnapshot,
      scenarioHash: record.scenarioHash,
      manifest: record.result,
      model: record.model,
      frameBuffer: record.frameBuffer,
      telemetryBuffer: record.telemetryBuffer,
      source: record.source
    });
  };

  return {
    save: async (artifact) => {
      await repositories.runs.saveArtifact(artifact);
      await repositories.runs.prune(MAX_STORED_RUNS);
      return structuredClone(artifact);
    },
    replaceSolution: async (runId, derivedSolution) => {
      const record = await repositories.runs.replaceSolution(runId, derivedSolution);
      const artifact = toArtifact(record);
      if (!artifact) {
        throw new Error(`Run ${runId} cannot be regenerated without a scenario snapshot`);
      }
      return artifact;
    },
    get: async (runId) => {
      const record = await repositories.runs.get(runId);
      return toArtifact(record);
    },
    getStored: async (runId) => {
      const record = await repositories.runs.get(runId);
      if (!record?.scenarioSnapshot) return null;
      return {
        runId: record.runId,
        createdAt: record.createdAt,
        scenarioSnapshot: record.scenarioSnapshot as unknown,
        scenarioHash: record.scenarioHash,
        model: record.model,
        manifest: record.result as unknown,
        frameBuffer: record.frameBuffer,
        telemetryBuffer: record.telemetryBuffer,
        source: record.source
      };
    },
    list: async () => {
      const records = await repositories.runs.list();
      return records.map((record) => ({
        runId: record.runId,
        createdAt: record.createdAt,
        source: record.source,
        legacySnapshotMissing: record.legacySnapshotMissing
      }));
    },
    remove: async (runId) => {
      await repositories.runs.remove(runId);
    }
  };
};

export const createDefaultAppServices = (): Partial<AppServices> => {
  const runtimeFactory =
    workerSource === "fixture" ? async () => createFixtureWorkerRuntime(fixtureRun) : undefined;
  const solverGateway = createSolverGateway(runtimeFactory);
  const baseScenario = scenarioSchema.parse(standardScenarioJson);
  const repositories = createRepositories(createDatabase());

  return {
    solverGateway,
    scenarioCatalog: createScenarioCatalog({
      baseScenario,
      solverGateway
    }),
    runArtifactRepository: createRunArtifactRepository(repositories),
    scenarioStore: createScenarioStore(repositories),
    baselineComparator: {
      compare: compareArtifactsConservative
    },
    validationRunner,
    frameExporter: {
      exportCsv: exportArtifactFramesCsv
    }
  };
};
