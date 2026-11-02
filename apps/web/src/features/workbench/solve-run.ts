import {
  hashScenario,
  runArtifactSchema,
  type ProviderSource,
  type RunArtifact,
  type RunResult,
  type Scenario
} from "../../../../../packages/schema/src/index";

import { versionManifest } from "../../app/version-manifest";

const cloneBuffer = (buffer: ArrayBuffer): ArrayBuffer => buffer.slice(0);

export const assembleRunArtifact = async ({
  runId,
  scenario,
  manifest,
  source,
  frameBuffer,
  telemetryBuffer
}: {
  runId: string;
  scenario: Scenario;
  manifest: RunResult;
  source: ProviderSource;
  frameBuffer: ArrayBuffer;
  telemetryBuffer: ArrayBuffer;
}): Promise<RunArtifact> => {
  const scenarioSnapshot = structuredClone(scenario);
  const scenarioHash = await hashScenario(scenarioSnapshot);

  const artifact: RunArtifact = {
    runId,
    createdAt: new Date().toISOString(),
    scenarioSnapshot,
    scenarioHash,
    manifest: {
      ...structuredClone(manifest),
      runId,
      scenarioHash
    },
    model: {
      scenarioSchemaVersion: versionManifest.schema,
      solverVersion: manifest.solverVersion,
      modelVersion: versionManifest.model,
      assumptionsId: "default-assumptions-v1",
      unitSystemId: "si-v1",
      metricDefinitionVersion: "core-metrics-v1",
      terrainSampleStep: 0.05
    },
    frameBuffer: cloneBuffer(frameBuffer),
    telemetryBuffer: cloneBuffer(telemetryBuffer),
    source
  };

  return runArtifactSchema.parse(artifact);
};
