import "fake-indexeddb/auto";

import { describe, expect, it } from "vitest";

import {
  canonicalSessionRoute,
  clearSessionContinuity,
  clearSessionReference,
  replaceSessionReference,
  restoreSessionContinuity,
  saveSessionContinuity
} from "../../src/state/session-continuity";
import { useAppStore } from "../../src/state/store";

describe("session continuity", () => {
  it("canonicalizes old Designer bookmarks without changing scenario or movement state", () => {
    useAppStore.getState().actions.setRoute("/pose");
    const before = useAppStore.getState().scenario;

    expect(canonicalSessionRoute("/pose")).toBe("/designer");
    expect(useAppStore.getState().scenario).toBe(before);
  });

  it("restores and isolates corrupt fields", () => {
    sessionStorage.setItem(
      "bike-jumper/session-v1",
      JSON.stringify({
        activeRoute: "/workbench",
        view: {
          playbackRate: "bad"
        },
        staleReferences: [{ kind: "run", id: "r1", label: "Run", reason: "missing", stale: true }]
      })
    );

    const restored = restoreSessionContinuity();
    expect(restored.activeRoute).toBe("/workbench");
    expect(restored.view).toBeUndefined();
    expect(restored.staleReferences?.[0]?.id).toBe("r1");
  });

  it("persists view continuity without storing artifacts or buffers", () => {
    useAppStore.getState().actions.clearScenario();
    useAppStore.getState().actions.setRoute("/library");
    useAppStore.getState().actions.setViewPreference("libraryCategory", "bike");
    useAppStore.getState().actions.markStaleReference({
      kind: "run",
      id: "run-a",
      label: "Run A",
      reason: "missing",
      stale: true
    });

    saveSessionContinuity(useAppStore.getState());
    const restored = restoreSessionContinuity();

    expect(restored.activeRoute).toBe("/library");
    expect(restored.view?.libraryCategory).toBe("bike");
    const persisted = JSON.stringify(restored);
    expect(persisted).not.toContain("frameBuffer");
    expect(persisted).not.toContain("telemetryBuffer");
  });

  it("keeps stale references explicit until clear or replace", () => {
    sessionStorage.setItem(
      "bike-jumper/session-v1",
      JSON.stringify({
        staleReferences: [
          { kind: "run", id: "run-a", label: "Run A", reason: "missing", stale: true }
        ]
      })
    );

    replaceSessionReference("run", "run-a", {
      id: "run-b",
      label: "Run B",
      reason: "replacement selected"
    });

    expect(restoreSessionContinuity().staleReferences?.[0]?.id).toBe("run-b");

    clearSessionReference("run", "run-b");
    expect(restoreSessionContinuity().staleReferences).toEqual([]);

    clearSessionContinuity();
    expect(restoreSessionContinuity()).toEqual({});
  });
});
