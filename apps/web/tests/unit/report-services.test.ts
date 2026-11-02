import { describe, expect, it } from "vitest";

import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32,
  type RunArtifact,
  type SessionReference
} from "../../../../packages/schema/src/index";
import { createDemoFixtures } from "../../../../tests/fixtures/ui/demo-fixtures";
import {
  cloneScenarioSnapshotForWorkbench,
  compareArtifactsConservative,
  exportArtifactFramesCsv,
  loadRouteArtifact,
  resolveStaleRunReference
} from "../../src/features/report/report-service";

const fixtures = createDemoFixtures();

const createArtifact = (overrides: Partial<RunArtifact> = {}): RunArtifact => {
  const scenario = fixtures.createScenario();
  const manifest = fixtures.createRunResult({
    runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    frameLayout: {
      version: FRAME_LAYOUT_VERSION,
      strideFloat32: FRAME_STRIDE_FLOAT32,
      fields: FRAME_LAYOUT_FIELDS
    },
    frameCount: 3,
    metrics: {
      airtime: { value: 0.83, unit: "s", source: "measured", reason: null },
      maxHeight: { value: 2.1, unit: "m", source: "measured", reason: null }
    },
    telemetry: {
      layoutVersion: 2,
      strideFloat32: 1,
      sampleCount: 3,
      channels: [{ name: "speed", unit: "m/s", offset: 0 }]
    }
  });

  const frameData = new Float32Array(3 * FRAME_STRIDE_FLOAT32);
  frameData.set([0, 10, 1, 0.1], 0);
  frameData.set([1, 11, 2, 0.2], FRAME_STRIDE_FLOAT32);
  frameData.set([2, 12, 3, 0.3], FRAME_STRIDE_FLOAT32 * 2);

  return {
    runId: manifest.runId,
    createdAt: "2026-01-01T00:00:00.000Z",
    scenarioSnapshot: scenario,
    scenarioHash: manifest.scenarioHash,
    manifest,
    model: {
      scenarioSchemaVersion: 1,
      solverVersion: manifest.solverVersion,
      modelVersion: "physics-spike-v1",
      assumptionsId: "default-assumptions-v1",
      unitSystemId: "si-v1",
      metricDefinitionVersion: "core-metrics-v1",
      terrainSampleStep: 0.1
    },
    frameBuffer: frameData.buffer,
    telemetryBuffer: new Float32Array([8, 8.1, 8.2]).buffer,
    source: "solver",
    ...overrides
  };
};

describe("report services", () => {
  it("uses route run ID as the authoritative artifact lookup key", async () => {
    const expected = createArtifact();
    const loaded = await loadRouteArtifact({
      routeRunId: expected.runId,
      repository: {
        get: async (runId: string) => (runId === expected.runId ? expected : null),
        list: async () => [],
        save: async (artifact: RunArtifact) => artifact,
        replaceSolution: async (_runId, solution) => solution as RunArtifact,
        remove: async () => undefined
      }
    });

    expect(loaded.state).toBe("ready");
    expect(loaded.artifact?.runId).toBe(expected.runId);
  });

  it("marks missing artifacts and legacy no-snapshot artifacts as stale references", async () => {
    const missing = await loadRouteArtifact({
      routeRunId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      repository: {
        get: async () => null,
        list: async () => [],
        save: async (artifact: RunArtifact) => artifact,
        replaceSolution: async (_runId, solution) => solution as RunArtifact,
        remove: async () => undefined
      }
    });

    expect(missing.state).toBe("missing");
    expect(missing.staleReference?.kind).toBe("run");

    const legacy = await loadRouteArtifact({
      routeRunId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      repository: {
        get: async () => null,
        list: async () => [
          {
            runId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
            createdAt: "2026-01-01T00:00:00.000Z",
            source: "solver",
            legacySnapshotMissing: true
          }
        ],
        save: async (artifact: RunArtifact) => artifact,
        replaceSolution: async (_runId, solution) => solution as RunArtifact,
        remove: async () => undefined
      }
    });

    expect(legacy.state).toBe("legacy");
    expect(legacy.staleReference?.reason).toMatch(/snapshot/i);
  });

  it("creates an exact scenario snapshot clone with a distinct ID and provenance", () => {
    const artifact = createArtifact();
    const cloned = cloneScenarioSnapshotForWorkbench(artifact);

    expect(cloned.scenario.id).not.toBe(artifact.scenarioSnapshot.id);
    expect(cloned.scenario.jump).toEqual(artifact.scenarioSnapshot.jump);
    expect(cloned.provenance.originRunId).toBe(artifact.runId);
  });

  it("applies conservative compatibility and cross-version warning behavior", () => {
    const current = createArtifact();
    const baselineSameModelDifferentSolver = createArtifact({
      runId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      model: {
        ...current.model,
        solverVersion: "rapier-0.36.0"
      }
    });

    const versionWarning = compareArtifactsConservative(current, baselineSameModelDifferentSolver);
    expect(versionWarning.compatibility).toBe("version-warning");

    const incompatible = compareArtifactsConservative(current, {
      ...baselineSameModelDifferentSolver,
      model: {
        ...baselineSameModelDifferentSolver.model,
        assumptionsId: "different-assumptions"
      }
    });
    expect(incompatible.compatibility).toBe("incompatible");
  });

  it("exports ordered LF-delimited UTF-8 CSV with canonical unit headers", () => {
    const artifact = createArtifact();
    const csv = exportArtifactFramesCsv(artifact);
    const lines = csv.split("\n");

    expect(lines[0]).toContain("frame_index");
    expect(lines[0]).toContain("time_s");
    expect(lines[1]).toContain(",0,");
    expect(lines[2]).toContain(",1,");
    expect(lines[3]).toContain(",2,");
    expect(csv).not.toContain("\r\n");
  });

  it("throws actionable CSV errors for missing frame data", () => {
    const artifact = createArtifact({ frameBuffer: new ArrayBuffer(0) });
    expect(() => exportArtifactFramesCsv(artifact)).toThrow(/frame data unavailable/i);
  });

  it("resolves stale references by run id for explicit clear/replace flows", () => {
    const staleReferences: SessionReference[] = [
      { kind: "run", id: "run-a", label: "Run A", reason: "missing", stale: true },
      { kind: "baseline", id: "run-b", label: "Run B", reason: "missing", stale: true }
    ];

    const stale = resolveStaleRunReference(staleReferences, "run-a");
    expect(stale?.id).toBe("run-a");
    expect(resolveStaleRunReference(staleReferences, "run-z")).toBeNull();
  });
});
