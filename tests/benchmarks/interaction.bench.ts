import { describe, expect, it } from "vitest";

import {
  summarizeDesignerUpdates,
  summarizeInteractionSamples
} from "../../scripts/run-interaction-benchmark.mjs";

describe("interaction evidence thresholds", () => {
  it("reports responsive input, 60 FPS pacing, and dropped frames", () => {
    const summary = summarizeInteractionSamples({
      frameIntervalsMs: [16.4, 16.7, 16.8, 16.6],
      inputToPaintMs: [8, 12, 16, 20],
      droppedFrames: 0
    });
    expect(summary.inputP95Ms).toBeLessThanOrEqual(100);
    expect(summary.fps).toBeGreaterThanOrEqual(55);
    expect(summary.droppedFrames).toBe(0);
    expect(summary.status).toBe("pass");
  });

  it("requires presentation actions to dispatch zero solves", () => {
    const summary = summarizeInteractionSamples({
      frameIntervalsMs: [16.6, 16.7],
      inputToPaintMs: [12, 18],
      droppedFrames: 0,
      presentationSolveDispatches: 0
    });
    expect(summary.presentationSolveDispatches).toBe(0);
    expect(summary.status).toBe("pass");
  });

  it("fails when the measured interaction window drops a frame", () => {
    const summary = summarizeInteractionSamples({
      frameIntervalsMs: [16.6, 33.4, 16.7],
      inputToPaintMs: [12, 18],
      droppedFrames: 1,
      presentationSolveDispatches: 0
    });
    expect(summary.status).toBe("fail");
  });

  it("keeps repeated camera interactions within the presentation budget", () => {
    const summary = summarizeInteractionSamples({
      frameIntervalsMs: [16.2, 16.9, 17.1, 16.5, 16.7],
      inputToPaintMs: [14, 19, 24, 31, 42],
      droppedFrames: 0,
      presentationSolveDispatches: 0
    });
    expect(summary.inputP95Ms).toBeLessThanOrEqual(100);
    expect(summary.fps).toBeGreaterThanOrEqual(55);
    expect(summary.droppedFrames).toBe(0);
    expect(summary.presentationSolveDispatches).toBe(0);
    expect(summary.status).toBe("pass");
  });

  it("requires at least 95 percent of Designer updates under 100 ms", () => {
    const summary = summarizeDesignerUpdates([...Array(19).fill(84), 101]);
    expect(summary.updateCount).toBe(20);
    expect(summary.withinBudget).toBe(19);
    expect(summary.withinBudgetRate).toBe(0.95);
    expect(summary.status).toBe("pass");
  });

  it("fails Designer evidence below the 95 percent update threshold", () => {
    const summary = summarizeDesignerUpdates([...Array(18).fill(84), 101, 120]);
    expect(summary.withinBudgetRate).toBe(0.9);
    expect(summary.status).toBe("fail");
  });
});
