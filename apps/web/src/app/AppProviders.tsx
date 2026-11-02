import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import {
  createUnsupportedServiceError,
  type AppServices,
  type BaselineComparator,
  type FrameExporter,
  type RunArtifactRepository,
  type ScenarioCatalog,
  type ScenarioStore,
  type SolverGateway,
  type ValidationRunner
} from "./services";
import type { ValidationSuiteSnapshot } from "../features/validation/validation-runner";

const emptyScenarioCatalog: ScenarioCatalog = {
  list: async () => [],
  search: async () => [],
  count: async () => ({ jump: 0, rider: 0, bike: 0, movement: 0 }),
  getById: async () => null,
  create: async () => {
    throw createUnsupportedServiceError("ScenarioCatalog.create");
  },
  load: async () => {
    throw createUnsupportedServiceError("ScenarioCatalog.load");
  },
  duplicate: async () => {
    throw createUnsupportedServiceError("ScenarioCatalog.duplicate");
  }
};

const emptySolverGateway: SolverGateway = {
  initialize: async () => {
    throw createUnsupportedServiceError("SolverGateway.initialize");
  },
  solve: async () => {
    throw createUnsupportedServiceError("SolverGateway.solve");
  },
  cancel: async () => undefined,
  inspectBikeGeometry: async () => {
    throw createUnsupportedServiceError("SolverGateway.inspectBikeGeometry");
  },
  resolvePoseEdit: async () => {
    throw createUnsupportedServiceError("SolverGateway.resolvePoseEdit");
  },
  validateDesign: async () => {
    throw createUnsupportedServiceError("SolverGateway.validateDesign");
  },
  samplePose: async () => {
    throw createUnsupportedServiceError("SolverGateway.samplePose");
  },
  analyzeSpeedWindow: async () => ({
    minimum: 0,
    maximum: 0,
    status: "unavailable",
    reason: "Awaiting core"
  }),
  terrain: async () => {
    throw createUnsupportedServiceError("SolverGateway.terrain");
  },
  dispose: async () => undefined
};

const emptyRunRepository: RunArtifactRepository = {
  save: async (artifact) => artifact,
  replaceSolution: async (_runId, derivedSolution) => {
    throw createUnsupportedServiceError(
      `RunArtifactRepository.replaceSolution(${derivedSolution.manifest.runId})`
    );
  },
  get: async () => null,
  getStored: async () => null,
  list: async () => [],
  remove: async () => undefined
};

const emptyScenarioStore: ScenarioStore = {
  loadWorking: async () => null,
  saveWorking: async () => undefined
};

const baselineComparator: BaselineComparator = {
  compare: (current, baseline) => {
    if (!baseline) {
      return { runId: null, compatibility: "none", reasons: [] };
    }
    if (!current) {
      return { runId: baseline.runId, compatibility: "unavailable", reasons: ["No current run"] };
    }

    const sameSchema = current.model.scenarioSchemaVersion === baseline.model.scenarioSchemaVersion;
    const sameAssumptions = current.model.assumptionsId === baseline.model.assumptionsId;
    const sameUnits = current.model.unitSystemId === baseline.model.unitSystemId;
    const sameMetricVersion =
      current.model.metricDefinitionVersion === baseline.model.metricDefinitionVersion;

    if (!sameSchema || !sameAssumptions || !sameUnits || !sameMetricVersion) {
      return {
        runId: baseline.runId,
        compatibility: "incompatible",
        reasons: ["Metadata mismatch"]
      };
    }

    if (current.model.solverVersion !== baseline.model.solverVersion) {
      return {
        runId: baseline.runId,
        compatibility: "version-warning",
        reasons: ["Solver versions differ"]
      };
    }

    return { runId: baseline.runId, compatibility: "compatible", reasons: [] };
  }
};

const emptyValidationRunner: ValidationRunner = {
  run: async (dt): Promise<ValidationSuiteSnapshot> => ({
    status: "completed",
    dt,
    profileLabel: "unavailable",
    source: "representative-fixture",
    disclosure: "Validation runner is unavailable.",
    details: {},
    rows: [],
    convergence: {
      title: "Unavailable",
      axisLabel: "log-log",
      rows: []
    },
    determinism: {
      hashLines: []
    },
    summary: {
      checks: 0,
      passing: 0,
      failing: 0,
      awaitingCore: 0,
      running: 0,
      budgetExceeded: 0,
      wallTimeMs: 0
    },
    error: null
  })
};

const emptyFrameExporter: FrameExporter = {
  exportCsv: (artifact) => `runId,source\n${artifact.runId},${artifact.source}\n`
};

const defaultServices: AppServices = {
  scenarioCatalog: emptyScenarioCatalog,
  solverGateway: emptySolverGateway,
  runArtifactRepository: emptyRunRepository,
  scenarioStore: emptyScenarioStore,
  baselineComparator,
  validationRunner: emptyValidationRunner,
  frameExporter: emptyFrameExporter
};

const ServicesContext = createContext<AppServices>(defaultServices);

export const AppProviders = ({
  children,
  services
}: {
  children: ReactNode;
  services?: Partial<AppServices>;
}) => {
  const merged = useMemo(
    () => ({
      ...defaultServices,
      ...services
    }),
    [services]
  );

  useEffect(() => {
    if (import.meta.env.VITE_TEST_HOOKS !== "1") {
      return;
    }
    (window as Window & { __BIKE_JUMPER_SERVICES__?: AppServices }).__BIKE_JUMPER_SERVICES__ =
      merged;
  }, [merged]);

  return <ServicesContext.Provider value={merged}>{children}</ServicesContext.Provider>;
};

export const useAppServices = (): AppServices => useContext(ServicesContext);
