export type ControllerLifecycle =
  | "idle"
  | "initializing"
  | "ready"
  | "solving"
  | "cancelling"
  | "cancelled"
  | "failed";

export type ControllerState = {
  lifecycle: ControllerLifecycle;
  activeRunId: string | null;
  highestProgress: number;
  disposed: boolean;
};

export type PhysicsController = {
  state: ControllerState;
  beginRun: (runId: string) => void;
  acceptProgressForRun: (runId: string, fraction: number) => number | null;
  cancelRun: (runId: string) => void;
  acceptResultForRun: (runId: string) => boolean;
  markReady: () => void;
  markFailed: () => void;
  dispose: () => void;
};

export const createPhysicsController = (): PhysicsController => {
  const state: ControllerState = {
    lifecycle: "idle",
    activeRunId: null,
    highestProgress: 0,
    disposed: false
  };

  const beginRun = (runId: string): void => {
    state.activeRunId = runId;
    state.highestProgress = 0;
    state.lifecycle = "solving";
  };

  const acceptProgressForRun = (runId: string, fraction: number): number | null => {
    if (state.activeRunId !== runId || state.lifecycle !== "solving") {
      return null;
    }
    state.highestProgress = Math.max(state.highestProgress, Math.min(1, Math.max(0, fraction)));
    return state.highestProgress;
  };

  const cancelRun = (runId: string): void => {
    if (state.activeRunId !== runId) {
      return;
    }
    state.lifecycle = "cancelling";
    state.activeRunId = null;
  };

  const acceptResultForRun = (runId: string): boolean => {
    if (state.activeRunId !== runId) {
      return false;
    }
    state.lifecycle = "ready";
    state.activeRunId = null;
    state.highestProgress = 1;
    return true;
  };

  const markReady = (): void => {
    state.lifecycle = "ready";
    state.highestProgress = 0;
  };

  const markFailed = (): void => {
    state.lifecycle = "failed";
    state.activeRunId = null;
  };

  const dispose = (): void => {
    state.disposed = true;
    state.activeRunId = null;
    state.highestProgress = 0;
    state.lifecycle = "idle";
  };

  return {
    state,
    beginRun,
    acceptProgressForRun,
    cancelRun,
    acceptResultForRun,
    markReady,
    markFailed,
    dispose
  };
};
