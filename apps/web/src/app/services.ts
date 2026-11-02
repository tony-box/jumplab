import type {
  BaselineSelection,
  BikeGeometryInspection,
  BikeSpec,
  DesignValidation,
  PoseEditResolution,
  PoseTargets,
  RunArtifact,
  Scenario,
  SolverCapabilityManifest,
  TerrainProfile
} from "../../../../packages/schema/src/index";
import type {
  EntrySpeedWindowInfo,
  PoseSample,
  Preset
} from "../../../../packages/schema/src/index";
import type { StoredRun } from "../features/workbench/legacy-regeneration";
import type { ValidationSuiteSnapshot } from "../features/validation/validation-runner";

export type AppError = {
  code: string;
  message: string;
  recoverable: boolean;
  recoveryActions: Array<"retry" | "clear" | "replace" | "return">;
  details?: Record<string, string | number | boolean | null>;
};

export type ScenarioCatalog = {
  list: (category: Preset["category"]) => Promise<Preset[]>;
  search: (category: Preset["category"], query: string) => Promise<Preset[]>;
  count: (query: string) => Promise<Record<Preset["category"], number>>;
  getById: (presetId: string) => Promise<Preset | null>;
  create: (category: Preset["category"]) => Promise<Scenario>;
  load: (presetId: string, base?: Scenario) => Promise<Scenario>;
  duplicate: (sourceId: string) => Promise<Scenario>;
};

export type SolverGateway = {
  initialize: (
    appVersion: string,
    expectedSolverVersion: string
  ) => Promise<SolverCapabilityManifest>;
  solve: (runId: string, scenario: Scenario) => Promise<RunArtifact>;
  cancel: (runId: string) => Promise<void>;
  inspectBikeGeometry: (bike: BikeSpec) => Promise<BikeGeometryInspection>;
  resolvePoseEdit: (
    scenario: Scenario,
    keyIndex: number,
    baselineTargets: PoseTargets,
    requestedTargets: PoseTargets
  ) => Promise<PoseEditResolution>;
  validateDesign: (scenario: Scenario) => Promise<DesignValidation>;
  samplePose: (scenario: Scenario, s: number) => Promise<PoseSample>;
  analyzeSpeedWindow: (scenario: Scenario) => Promise<EntrySpeedWindowInfo>;
  terrain: (scenario: Scenario, step: number) => Promise<TerrainProfile>;
  dispose: () => Promise<void>;
};

export type RunArtifactRepository = {
  save: (artifact: RunArtifact) => Promise<RunArtifact>;
  replaceSolution: (
    runId: string,
    derivedSolution: Pick<
      RunArtifact,
      | "scenarioSnapshot"
      | "scenarioHash"
      | "manifest"
      | "model"
      | "frameBuffer"
      | "telemetryBuffer"
      | "source"
    >
  ) => Promise<RunArtifact>;
  get: (runId: string) => Promise<RunArtifact | null>;
  /** The run as stored, unparsed, so older runs can be verified and regenerated. */
  getStored: (runId: string) => Promise<StoredRun | null>;
  list: () => Promise<
    Array<Pick<RunArtifact, "runId" | "createdAt" | "source"> & { legacySnapshotMissing?: boolean }>
  >;
  remove: (runId: string) => Promise<void>;
};

export type ScenarioStore = {
  /** The most recently saved working scenario, migrated to the current schema, if any. */
  loadWorking: () => Promise<Scenario | null>;
  saveWorking: (scenario: Scenario) => Promise<void>;
};

export type BaselineComparator = {
  compare: (current: RunArtifact | null, baseline: RunArtifact | null) => BaselineSelection;
};

export type ValidationRunner = {
  run: (
    dt: number,
    onUpdate?: (snapshot: ValidationSuiteSnapshot) => void
  ) => Promise<ValidationSuiteSnapshot>;
};

export type FrameExporter = {
  exportCsv: (artifact: RunArtifact) => string;
};

export type AppServices = {
  scenarioCatalog: ScenarioCatalog;
  solverGateway: SolverGateway;
  runArtifactRepository: RunArtifactRepository;
  scenarioStore: ScenarioStore;
  baselineComparator: BaselineComparator;
  validationRunner: ValidationRunner;
  frameExporter: FrameExporter;
};

export const toAppError = (
  code: string,
  message: string,
  recoverable = true,
  recoveryActions: AppError["recoveryActions"] = ["retry"]
): AppError => ({ code, message, recoverable, recoveryActions });

export const createUnsupportedServiceError = (name: string): AppError =>
  toAppError("service_unimplemented", `${name} is not implemented in this phase`, true, ["return"]);
