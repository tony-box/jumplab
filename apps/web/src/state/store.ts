import { create } from "zustand";

import {
  scenarioSchema,
  type RunResult,
  type Scenario
} from "../../../../packages/schema/src/index";
import type { CameraMode, ManualCameraState } from "../rendering/canvas/camera";

type SolverLifecycle =
  | "idle"
  | "initializing"
  | "ready"
  | "solving"
  | "cancelling"
  | "cancelled"
  | "failed";

type ResultState = "none" | "current" | "stale";

export type ScenarioWorkingCopyState = {
  workingId: string | null;
  scenario: Scenario | null;
  currentHash: string | null;
  originRunId: string | null;
  displayedRunId: string | null;
  resultState: ResultState;
  dirty: boolean;
};

export type RunState = {
  active: RunResult | null;
  baselineRunId: string | null;
  runIds: string[];
};

export type SolverState = {
  lifecycle: SolverLifecycle;
  activeRunId: string | null;
  progressFraction: number;
  progressLabel: string;
  lastError: string | null;
};

export type SessionReferenceState = {
  kind: "scenario" | "run" | "baseline" | "preset" | "validation";
  id: string;
  label: string;
  reason: string;
  stale: true;
};

export type SessionState = {
  activeWorkingId: string | null;
  activeRoute: string;
  view: {
    workbenchTab: string;
    playbackRate: number;
    cameraMode: CameraMode;
    cameraZoomFactor: number;
    manualCamera: ManualCameraState | null;
    libraryCategory: string;
    libraryQuery: string;
    reportRunId: string;
    reportBaselineRunId: string;
    validationDt: number;
  };
  staleReferences: Record<string, SessionReferenceState>;
};

export type AppState = {
  scenario: ScenarioWorkingCopyState;
  run: RunState;
  solver: SolverState;
  session: SessionState;
  actions: {
    setScenario: (scenario: Scenario, hash: string) => void;
    setScenarioFromSnapshot: (scenario: Scenario, hash: string, originRunId: string) => void;
    updateScenario: (update: (scenario: Scenario) => Scenario) => void;
    markScenarioSaved: (hash: string) => void;
    clearScenario: () => void;
    beginSolve: (runId: string) => void;
    reportProgress: (runId: string, fraction: number, label: string) => void;
    commitRunResult: (result: RunResult) => void;
    setBaselineRun: (runId: string | null) => void;
    failSolve: (message: string) => void;
    cancelSolve: () => void;
    setRoute: (route: string) => void;
    setViewPreference: <K extends keyof SessionState["view"]>(
      key: K,
      value: SessionState["view"][K]
    ) => void;
    setCamera: (mode: CameraMode, manual: ManualCameraState | null, zoomFactor?: number) => void;
    markStaleReference: (reference: SessionReferenceState) => void;
    clearStaleReference: (kind: SessionReferenceState["kind"], id: string) => void;
    replaceStaleReference: (
      kind: SessionReferenceState["kind"],
      oldId: string,
      replacement: SessionReferenceState
    ) => void;
  };
};

const initialScenario: ScenarioWorkingCopyState = {
  workingId: null,
  scenario: null,
  currentHash: null,
  originRunId: null,
  displayedRunId: null,
  resultState: "none",
  dirty: false
};

const initialRun: RunState = {
  active: null,
  baselineRunId: null,
  runIds: []
};

const initialSolver: SolverState = {
  lifecycle: "idle",
  activeRunId: null,
  progressFraction: 0,
  progressLabel: "",
  lastError: null
};

const initialSession: SessionState = {
  activeWorkingId: null,
  activeRoute: "/workbench",
  view: {
    workbenchTab: "jump",
    playbackRate: 1,
    cameraMode: "follow",
    cameraZoomFactor: 1,
    manualCamera: null,
    libraryCategory: "jump",
    libraryQuery: "",
    reportRunId: "",
    reportBaselineRunId: "",
    validationDt: 1 / 240
  },
  staleReferences: {}
};

const staleReferenceKey = (kind: SessionReferenceState["kind"], id: string): string =>
  `${kind}:${id}`;

export const useAppStore = create<AppState>()((set) => ({
  scenario: { ...initialScenario },
  run: { ...initialRun },
  solver: { ...initialSolver },
  session: { ...initialSession },
  actions: {
    setScenario: (scenario, hash) =>
      set((state) => ({
        scenario: {
          workingId: crypto.randomUUID(),
          scenario,
          currentHash: hash,
          originRunId: null,
          displayedRunId: null,
          resultState: "none",
          dirty: false
        },
        run: { ...initialRun },
        solver: { ...initialSolver, lifecycle: "ready" },
        session: {
          ...state.session,
          activeWorkingId: scenario.id,
          view:
            state.session.activeWorkingId === scenario.id
              ? state.session.view
              : { ...state.session.view, cameraMode: "follow", manualCamera: null }
        }
      })),
    setScenarioFromSnapshot: (scenario, hash, originRunId) =>
      set((state) => ({
        scenario: {
          workingId: crypto.randomUUID(),
          scenario,
          currentHash: hash,
          originRunId,
          displayedRunId: originRunId,
          resultState: "none",
          dirty: false
        },
        run: { ...initialRun },
        solver: { ...initialSolver, lifecycle: "ready" },
        session: {
          ...state.session,
          activeWorkingId: scenario.id,
          view: { ...state.session.view, cameraMode: "follow", manualCamera: null }
        }
      })),
    updateScenario: (update) =>
      set((state) => {
        if (!state.scenario.scenario) {
          return state;
        }
        const nextScenario = scenarioSchema.parse(update(state.scenario.scenario));
        const nextResultState: ResultState =
          state.scenario.resultState === "current" || state.scenario.resultState === "stale"
            ? "stale"
            : state.scenario.resultState;

        return {
          scenario: {
            ...state.scenario,
            scenario: nextScenario,
            dirty: true,
            resultState: nextResultState
          }
        };
      }),
    markScenarioSaved: (hash) =>
      set((state) => ({
        scenario: {
          ...state.scenario,
          currentHash: hash,
          dirty: false
        }
      })),
    clearScenario: () =>
      set({
        scenario: { ...initialScenario },
        run: { ...initialRun },
        solver: { ...initialSolver },
        session: { ...initialSession }
      }),
    beginSolve: (runId) =>
      set({
        solver: {
          lifecycle: "solving",
          activeRunId: runId,
          progressFraction: 0,
          progressLabel: "Preparing solve",
          lastError: null
        }
      }),
    reportProgress: (runId, fraction, label) =>
      set((state) => {
        if (state.solver.activeRunId !== runId || state.solver.lifecycle !== "solving") {
          return state;
        }
        return {
          solver: {
            ...state.solver,
            progressFraction: Math.max(
              state.solver.progressFraction,
              Math.min(1, Math.max(0, fraction))
            ),
            progressLabel: label
          }
        };
      }),
    commitRunResult: (result) =>
      set((state) => {
        if (state.solver.activeRunId !== result.runId) {
          return state;
        }
        return {
          run: {
            ...state.run,
            active: result,
            runIds: state.run.runIds.includes(result.runId)
              ? state.run.runIds
              : [...state.run.runIds, result.runId]
          },
          scenario: {
            ...state.scenario,
            displayedRunId: result.runId,
            resultState: "current",
            dirty: false
          },
          solver: {
            lifecycle: "ready",
            activeRunId: null,
            progressFraction: 1,
            progressLabel: "Solve complete",
            lastError: null
          },
          session: {
            ...state.session,
            view:
              state.run.active?.runId === result.runId
                ? state.session.view
                : { ...state.session.view, cameraMode: "follow", manualCamera: null }
          }
        };
      }),
    setBaselineRun: (runId) => set((state) => ({ run: { ...state.run, baselineRunId: runId } })),
    failSolve: (message) =>
      set((state) => ({
        solver: {
          ...state.solver,
          lifecycle: "failed",
          activeRunId: null,
          lastError: message
        },
        scenario: {
          ...state.scenario,
          resultState: state.run.active ? "stale" : "none"
        }
      })),
    cancelSolve: () =>
      set((state) => ({
        solver: {
          ...state.solver,
          lifecycle: "cancelled",
          activeRunId: null,
          progressLabel: "Solve cancelled"
        },
        scenario: {
          ...state.scenario,
          resultState: state.run.active ? "stale" : "none"
        }
      })),
    setRoute: (route) =>
      set((state) => ({
        session: {
          ...state.session,
          activeRoute: route
        }
      })),
    setViewPreference: (key, value) =>
      set((state) => ({
        session: {
          ...state.session,
          view: {
            ...state.session.view,
            [key]: value
          }
        }
      })),
    setCamera: (mode, manual, zoomFactor) =>
      set((state) => ({
        session: {
          ...state.session,
          view: {
            ...state.session.view,
            cameraMode: mode,
            cameraZoomFactor: zoomFactor ?? state.session.view.cameraZoomFactor,
            manualCamera: mode === "follow" ? null : manual
          }
        }
      })),
    markStaleReference: (reference) =>
      set((state) => ({
        session: {
          ...state.session,
          staleReferences: {
            ...state.session.staleReferences,
            [staleReferenceKey(reference.kind, reference.id)]: reference
          }
        }
      })),
    clearStaleReference: (kind, id) =>
      set((state) => {
        const next = { ...state.session.staleReferences };
        delete next[staleReferenceKey(kind, id)];
        return {
          session: {
            ...state.session,
            staleReferences: next
          }
        };
      }),
    replaceStaleReference: (kind, oldId, replacement) =>
      set((state) => {
        const next = { ...state.session.staleReferences };
        delete next[staleReferenceKey(kind, oldId)];
        next[staleReferenceKey(replacement.kind, replacement.id)] = replacement;
        return {
          session: {
            ...state.session,
            staleReferences: next
          }
        };
      })
  }
}));

export const selectScenarioState = (state: AppState): ScenarioWorkingCopyState => state.scenario;
export const selectRunState = (state: AppState): RunState => state.run;
export const selectSolverState = (state: AppState): SolverState => state.solver;
export const selectSessionState = (state: AppState): SessionState => state.session;
export const selectStoreActions = (state: AppState): AppState["actions"] => state.actions;
