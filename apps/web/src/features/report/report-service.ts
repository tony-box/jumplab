import type {
  BaselineSelection,
  RunArtifact,
  Scenario,
  SessionReference
} from "../../../../../packages/schema/src/index";

import type { RunArtifactRepository } from "../../app/services";
import { exportArtifactFramesCsv } from "./frame-exporter";

export type RouteArtifactLoadResult = {
  state: "ready" | "missing" | "legacy";
  artifact: RunArtifact | null;
  staleReference: SessionReference | null;
};

const createRunReference = (id: string, reason: string): SessionReference => ({
  kind: "run",
  id,
  label: `Run ${id.slice(0, 8)}`,
  reason,
  stale: true
});

export const compareArtifactsConservative = (
  current: RunArtifact | null,
  baseline: RunArtifact | null
): BaselineSelection => {
  if (!baseline) {
    return { runId: null, compatibility: "none", reasons: [] };
  }
  if (!current) {
    return {
      runId: baseline.runId,
      compatibility: "unavailable",
      reasons: ["Current run is unavailable"]
    };
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
      reasons: ["Model metadata mismatch"]
    };
  }

  if (current.model.solverVersion !== baseline.model.solverVersion) {
    return {
      runId: baseline.runId,
      compatibility: "version-warning",
      reasons: ["Solver version differs between run and baseline"]
    };
  }

  return { runId: baseline.runId, compatibility: "compatible", reasons: [] };
};

export const resolveStaleRunReference = (
  references: SessionReference[],
  runId: string
): SessionReference | null => {
  return references.find((reference) => reference.kind === "run" && reference.id === runId) ?? null;
};

export const loadRouteArtifact = async ({
  routeRunId,
  repository
}: {
  routeRunId: string;
  repository: RunArtifactRepository;
}): Promise<RouteArtifactLoadResult> => {
  const artifact = await repository.get(routeRunId);
  if (artifact) {
    return {
      state: "ready",
      artifact,
      staleReference: null
    };
  }

  const listed = await repository.list();
  const entry = listed.find((candidate) => candidate.runId === routeRunId);
  if (entry?.legacySnapshotMissing) {
    return {
      state: "legacy",
      artifact: null,
      staleReference: createRunReference(
        routeRunId,
        "Legacy run did not capture a scenario snapshot"
      )
    };
  }

  return {
    state: "missing",
    artifact: null,
    staleReference: createRunReference(routeRunId, "Run is no longer available in this session")
  };
};

export const cloneScenarioSnapshotForWorkbench = (
  artifact: RunArtifact
): { scenario: Scenario; provenance: { originRunId: string; source: RunArtifact["source"] } } => {
  const scenario = structuredClone(artifact.scenarioSnapshot);
  scenario.id = crypto.randomUUID();
  scenario.name = `${artifact.scenarioSnapshot.name} (snapshot copy)`;
  return {
    scenario,
    provenance: {
      originRunId: artifact.runId,
      source: artifact.source
    }
  };
};

export { exportArtifactFramesCsv };
