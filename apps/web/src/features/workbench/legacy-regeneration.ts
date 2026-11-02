import {
  assertCompatibleVersion,
  hashScenario,
  runArtifactSchema,
  scenarioSchema,
  type ProviderSource,
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

/**
 * A run as stored. The snapshot and manifest stay unparsed so an older schema or frame layout can
 * still be verified against its original hash and then regenerated.
 */
export type StoredRun = {
  runId: string;
  createdAt: string;
  scenarioSnapshot: unknown;
  scenarioHash: string;
  model: { scenarioSchemaVersion: number; solverVersion: string; modelVersion: string };
  manifest: unknown;
  frameBuffer: ArrayBuffer;
  telemetryBuffer: ArrayBuffer;
  source: ProviderSource;
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

/** Parses a stored run as current, or returns null when its manifest or layout is out of date. */
const parseCurrent = (stored: StoredRun, scenario: Scenario): RunArtifact | null => {
  const parsed = runArtifactSchema.safeParse({
    runId: stored.runId,
    createdAt: stored.createdAt,
    scenarioSnapshot: scenario,
    scenarioHash: stored.scenarioHash,
    manifest: stored.manifest,
    model: stored.model,
    frameBuffer: stored.frameBuffer,
    telemetryBuffer: stored.telemetryBuffer,
    source: stored.source
  });
  return parsed.success ? parsed.data : null;
};

export const ensureCurrentRunArtifact = async ({
  artifact: stored,
  activeSolverVersion,
  activeModelVersion = versionManifest.model,
  activeSchemaVersion = versionManifest.schema,
  repository,
  solve,
  onRegenerating
}: {
  artifact: StoredRun;
  activeSolverVersion: string;
  activeModelVersion?: string;
  activeSchemaVersion?: number;
  repository: RunArtifactRepository;
  solve: (runId: string, scenario: Scenario) => Promise<RunArtifact>;
  onRegenerating?: () => void;
}): Promise<RunRegenerationOutcome> => {
  // The hash covers the snapshot exactly as saved, before any migration touches it.
  if ((await hashScenario(stored.scenarioSnapshot)) !== stored.scenarioHash) {
    return unavailable("Stored scenario snapshot hash does not match this run");
  }

  let scenario: Scenario;
  try {
    assertCompatibleVersion("scenario", stored.model.scenarioSchemaVersion);
    scenario = scenarioSchema.parse(stored.scenarioSnapshot);
  } catch (error) {
    return unavailable(error instanceof Error ? error.message : "Scenario snapshot is invalid");
  }

  const current = parseCurrent(stored, scenario);
  if (
    current &&
    stored.model.scenarioSchemaVersion === activeSchemaVersion &&
    stored.model.modelVersion === activeModelVersion &&
    stored.model.solverVersion === activeSolverVersion &&
    validFrameBuffer(current)
  ) {
    return { state: "current", artifact: current, reason: null };
  }

  onRegenerating?.();
  try {
    const solved = await solve(stored.runId, scenario);
    const scenarioHash = await hashScenario(scenario);
    if (solved.runId !== stored.runId) {
      throw new Error("Regenerated solution changed the run identity");
    }
    if (solved.scenarioHash !== scenarioHash || solved.manifest.scenarioHash !== scenarioHash) {
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

    // The regenerated run belongs to the migrated scenario, so it is stored with that snapshot
    // and its hash; nothing from the old layout is carried over.
    const replacement = await repository.replaceSolution(stored.runId, {
      scenarioSnapshot: scenario,
      scenarioHash,
      manifest: { ...solved.manifest, runId: stored.runId, scenarioHash },
      model: solved.model,
      frameBuffer: solved.frameBuffer,
      telemetryBuffer: solved.telemetryBuffer,
      source: solved.source
    });
    return { state: "regenerated", artifact: replacement, reason: null };
  } catch (error) {
    return {
      state: "failed",
      artifact: null,
      reason: error instanceof Error ? error.message : "Run regeneration failed"
    };
  }
};
