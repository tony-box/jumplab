import {
  hashScenario,
  resolveMigrationPath,
  runArtifactSchema,
  scenarioSchema,
  type RunArtifact,
  type Scenario
} from "../../../../../packages/schema/src/index";

import type { RunArtifactRepository } from "../../app/services";
import { versionManifest } from "../../app/version-manifest";
import { createFrameBufferView } from "../../solver/frame-buffer";

export type RunRegenerationState = "current" | "regenerated" | "unavailable" | "failed";

export type RunRegenerationOutcome = {
  state: RunRegenerationState;
  artifact: RunArtifact | null;
  reason: string | null;
};

const unavailable = (reason: string): RunRegenerationOutcome => ({
  state: "unavailable",
  artifact: null,
  reason
});

const validFrameBuffer = (artifact: RunArtifact): boolean => {
  try {
    const view = createFrameBufferView(artifact.manifest.frameLayout, artifact.frameBuffer);
    return (
      view.frameCount === artifact.manifest.frameCount &&
      Array.from(view.data).every(Number.isFinite)
    );
  } catch {
    return false;
  }
};

const migrateScenarioSnapshot = (artifact: RunArtifact): Scenario => {
  const path = resolveMigrationPath("scenario", artifact.model.scenarioSchemaVersion);
  const targetVersion = path.at(-1);
  if (targetVersion !== versionManifest.schema) {
    throw new Error(
      `Scenario schema ${artifact.model.scenarioSchemaVersion} cannot migrate to ${versionManifest.schema}`
    );
  }
  return scenarioSchema.parse(artifact.scenarioSnapshot);
};

export const ensureCurrentRunArtifact = async ({
  artifact,
  activeSolverVersion,
  activeModelVersion = versionManifest.model,
  activeSchemaVersion = versionManifest.schema,
  repository,
  solve,
  onRegenerating
}: {
  artifact: RunArtifact;
  activeSolverVersion: string;
  activeModelVersion?: string;
  activeSchemaVersion?: number;
  repository: RunArtifactRepository;
  solve: (runId: string, scenario: Scenario) => Promise<RunArtifact>;
  onRegenerating?: () => void;
}): Promise<RunRegenerationOutcome> => {
  const originalHash = await hashScenario(artifact.scenarioSnapshot);
  if (originalHash !== artifact.scenarioHash) {
    return unavailable("Stored scenario snapshot hash does not match this run");
  }

  let scenario: Scenario;
  try {
    scenario = migrateScenarioSnapshot(artifact);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "Scenario snapshot is invalid");
  }

  const requiresRegeneration =
    artifact.model.scenarioSchemaVersion !== activeSchemaVersion ||
    artifact.model.modelVersion !== activeModelVersion ||
    artifact.model.solverVersion !== activeSolverVersion ||
    !validFrameBuffer(artifact);
  if (!requiresRegeneration) {
    return { state: "current", artifact, reason: null };
  }

  onRegenerating?.();
  try {
    const solved = await solve(artifact.runId, scenario);
    const currentHash = await hashScenario(scenario);
    if (solved.runId !== artifact.runId) {
      throw new Error("Regenerated solution changed the run identity");
    }
    if (solved.scenarioHash !== currentHash || solved.manifest.scenarioHash !== currentHash) {
      throw new Error("Regenerated solution scenario hash does not match the saved snapshot");
    }
    if (
      solved.model.scenarioSchemaVersion !== activeSchemaVersion ||
      solved.model.modelVersion !== activeModelVersion ||
      solved.model.solverVersion !== activeSolverVersion ||
      !validFrameBuffer(solved)
    ) {
      throw new Error(
        "Regenerated solution does not use the active schema, model, frame, and solver versions"
      );
    }

    const finalArtifact = runArtifactSchema.parse({
      ...solved,
      runId: artifact.runId,
      createdAt: artifact.createdAt,
      scenarioSnapshot: artifact.scenarioSnapshot,
      scenarioHash: artifact.scenarioHash,
      manifest: { ...solved.manifest, runId: artifact.runId, scenarioHash: artifact.scenarioHash }
    });
    const stored = await repository.replaceSolution(artifact.runId, {
      manifest: finalArtifact.manifest,
      model: finalArtifact.model,
      frameBuffer: finalArtifact.frameBuffer,
      telemetryBuffer: finalArtifact.telemetryBuffer,
      source: finalArtifact.source
    });
    return { state: "regenerated", artifact: stored, reason: null };
  } catch (error) {
    return {
      state: "failed",
      artifact: null,
      reason: error instanceof Error ? error.message : "Run regeneration failed"
    };
  }
};
