import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { runResultSchema, scenarioSchema } from "../../../../packages/schema/src/index";
import { useAppStore } from "./store";

const scenario = scenarioSchema.parse(
  JSON.parse(readFileSync(resolve("tests/fixtures/scenarios/standard-v1.json"), "utf8"))
);
const result = runResultSchema.parse(
  JSON.parse(readFileSync(resolve("tests/fixtures/run-results/standard-v1.json"), "utf8"))
);

describe("application store", () => {
  beforeEach(() => useAppStore.getState().actions.clearScenario());

  it("tracks scenario working copy, stale transitions, and accepted results", () => {
    const actions = useAppStore.getState().actions;
    actions.setScenario(scenario, result.scenarioHash);

    const firstState = useAppStore.getState();
    expect(firstState.scenario.workingId).toBeTruthy();
    expect(firstState.scenario.resultState).toBe("none");

    actions.beginSolve(result.runId);
    actions.commitRunResult(result);
    expect(useAppStore.getState().scenario.resultState).toBe("current");

    actions.updateScenario((current) => ({
      ...current,
      entry: { ...current.entry, speed: 8.5 }
    }));

    expect(useAppStore.getState().scenario.resultState).toBe("stale");

    actions.beginSolve(result.runId);
    actions.reportProgress(result.runId, 0.5, "Halfway");
    actions.reportProgress(result.runId, 0.25, "Late stale progress");
    actions.commitRunResult(result);

    const state = useAppStore.getState();
    expect(state.scenario.dirty).toBe(false);
    expect(state.scenario.scenario?.entry.speed).toBe(8.5);
    expect(state.solver.progressFraction).toBe(1);
    expect(state.solver.lifecycle).toBe("ready");
    expect(state.scenario.displayedRunId).toBe(result.runId);
    expect(state.run.active?.resultHash).toBe(result.resultHash);
  });

  it("rejects stale progress and stale results, then cancels the active run", () => {
    const actions = useAppStore.getState().actions;
    actions.setScenario(scenario, result.scenarioHash);
    actions.beginSolve("22222222-2222-4222-8222-222222222222");
    actions.reportProgress(result.runId, 0.75, "Wrong run");
    actions.commitRunResult(result);

    expect(useAppStore.getState().solver.progressFraction).toBe(0);
    expect(useAppStore.getState().run.active).toBeNull();

    actions.cancelSolve();
    expect(useAppStore.getState().solver.lifecycle).toBe("cancelled");
    expect(useAppStore.getState().solver.activeRunId).toBeNull();
  });

  it("keeps stale references explicit until clear or replace", () => {
    const actions = useAppStore.getState().actions;

    actions.markStaleReference({
      kind: "run",
      id: "missing-run",
      label: "Missing Run",
      reason: "Deleted from storage",
      stale: true
    });

    expect(Object.keys(useAppStore.getState().session.staleReferences)).toHaveLength(1);

    actions.replaceStaleReference("run", "missing-run", {
      kind: "run",
      id: "replacement-run",
      label: "Replacement Run",
      reason: "User selected replacement",
      stale: true
    });

    expect(useAppStore.getState().session.staleReferences["run:replacement-run"]).toBeTruthy();

    actions.clearStaleReference("run", "replacement-run");
    expect(Object.keys(useAppStore.getState().session.staleReferences)).toHaveLength(0);
  });

  it("preserves zoom while resetting mode and pan for new identities", () => {
    const actions = useAppStore.getState().actions;
    actions.setScenario(scenario, result.scenarioHash);
    actions.setCamera("pan-zoom", { centerX: 3, centerY: 2, zoomFactor: 1.6 }, 1.6);
    actions.reportProgress("not-active", 0.5, "ignored");
    expect(useAppStore.getState().session.view.cameraMode).toBe("pan-zoom");

    actions.setScenario({ ...scenario, id: crypto.randomUUID() }, result.scenarioHash);
    expect(useAppStore.getState().session.view.cameraMode).toBe("follow");
    expect(useAppStore.getState().session.view.manualCamera).toBeNull();
    expect(useAppStore.getState().session.view.cameraZoomFactor).toBe(1.6);

    actions.setCamera("pan-zoom", { centerX: 3, centerY: 2, zoomFactor: 1.6 }, 1.6);
    actions.beginSolve(result.runId);
    actions.commitRunResult(result);
    expect(useAppStore.getState().session.view.cameraMode).toBe("follow");
    expect(useAppStore.getState().session.view.manualCamera).toBeNull();
    expect(useAppStore.getState().session.view.cameraZoomFactor).toBe(1.6);

    actions.setCamera("follow", null, 1);
    expect(useAppStore.getState().session.view.cameraZoomFactor).toBe(1);
  });
});
