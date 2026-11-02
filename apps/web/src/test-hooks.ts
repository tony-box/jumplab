import { useAppStore } from "./state/store";
import {
  getPerformanceSnapshot,
  resetPerformanceSnapshot,
  type InteractionPerformanceSnapshot
} from "./observability/performance";
import type {
  AchievedPoseLandmarks,
  BikeGeometryInspection,
  ContactResult
} from "../../../packages/schema/src/index";
import type { CameraResolution, CameraMode } from "./rendering/canvas/camera";

export type GeometryCheckpoint = {
  targets: { knee: number; hip: number; spine: number } | null;
  derivedArm: { shoulder: number; elbow: number; constrained: boolean } | null;
  landmarks: AchievedPoseLandmarks | null;
};

export type WorkbenchCheckpoint = GeometryCheckpoint & {
  groundedRear: boolean | null;
  groundedFront: boolean | null;
  minClearance: number | null;
  nearestTerrainSegment: { segmentId: string; distance: number } | null;
  touchdownFrame: number | null;
  touchdownIndicatorVisible: boolean;
};

export type PoseCheckpoint = GeometryCheckpoint & {
  selectedKeyId: string | null;
  selectedIndex: number;
  saturated: boolean;
  reason: string | null;
  minimumSeparation: number | null;
  contacts: ContactResult[];
  inferredSaddleContact: boolean;
  acceptedTargets: GeometryCheckpoint["targets"];
  conflictCodes: string[];
  affectedKeyIndices: number[];
  canSolve: boolean | null;
};

export type DesignerCheckpoint = PoseCheckpoint & {
  activeRoute: string;
  mode: "bike" | "pose";
  geometryRequestId: number;
  geometryStatus: "idle" | "pending" | "valid" | "invalid" | "error";
  geometry: BikeGeometryInspection | null;
  draftValid: boolean;
  geometryIssueCodes: string[];
};

let seekFrame: ((frameIndex: number) => void) | null = null;
let solveDispatchCount = 0;
let workbenchGeometry: (() => WorkbenchCheckpoint) | null = null;
let cameraCheckpoint: (() => CameraResolution & { mode: CameraMode }) | null = null;
let poseControls: {
  selectKeyByIndex: (index: number) => void;
  dragJointHandle: (joint: "knee" | "hip" | "spine", value: number) => void;
  getCheckpoint: () => PoseCheckpoint;
} | null = null;
let poseHandlePositions: (() => Array<{ joint: string; x: number; y: number }>) | null = null;
let designerCheckpoint: (() => DesignerCheckpoint) | null = null;
let reportControls: {
  selectRun: (runId: string) => void;
  selectBaseline: (runId: string) => void;
  getCheckpoint: () => {
    runId: string;
    baselineRunId: string;
    chartCount: number;
  };
} | null = null;
let validationControls: {
  getCheckpoint: () => {
    status: "idle" | "running" | "completed" | "failed" | "budget-exceeded";
    checks: number;
    passing: number;
    failing: number;
    awaitingCore: number;
    running: number;
    rowCount: number;
    hashLineCount: number;
  };
} | null = null;

export const registerPlaybackTestControls = (seek: (frameIndex: number) => void): (() => void) => {
  seekFrame = seek;
  return () => {
    if (seekFrame === seek) seekFrame = null;
  };
};

export const registerPoseHandleTestControls = (
  positions: () => Array<{ joint: string; x: number; y: number }>
): (() => void) => {
  poseHandlePositions = positions;
  return () => {
    if (poseHandlePositions === positions) poseHandlePositions = null;
  };
};

export const registerPoseTestControls = (controls: {
  selectKeyByIndex: (index: number) => void;
  dragJointHandle: (joint: "knee" | "hip" | "spine", value: number) => void;
  getCheckpoint: () => PoseCheckpoint;
}): (() => void) => {
  poseControls = controls;
  return () => {
    if (poseControls === controls) poseControls = null;
  };
};

export const registerDesignerTestControls = (
  getCheckpoint: () => DesignerCheckpoint
): (() => void) => {
  designerCheckpoint = getCheckpoint;
  return () => {
    if (designerCheckpoint === getCheckpoint) designerCheckpoint = null;
  };
};

export const registerWorkbenchGeometryTestControls = (
  getCheckpoint: () => WorkbenchCheckpoint
): (() => void) => {
  workbenchGeometry = getCheckpoint;
  return () => {
    if (workbenchGeometry === getCheckpoint) workbenchGeometry = null;
  };
};

export const registerCameraTestControls = (
  getCheckpoint: () => CameraResolution & { mode: CameraMode }
): (() => void) => {
  cameraCheckpoint = getCheckpoint;
  return () => {
    if (cameraCheckpoint === getCheckpoint) cameraCheckpoint = null;
  };
};

export const registerReportTestControls = (controls: {
  selectRun: (runId: string) => void;
  selectBaseline: (runId: string) => void;
  getCheckpoint: () => {
    runId: string;
    baselineRunId: string;
    chartCount: number;
  };
}): (() => void) => {
  reportControls = controls;
  return () => {
    if (reportControls === controls) reportControls = null;
  };
};

export const registerValidationTestControls = (controls: {
  getCheckpoint: () => {
    status: "idle" | "running" | "completed" | "failed" | "budget-exceeded";
    checks: number;
    passing: number;
    failing: number;
    awaitingCore: number;
    running: number;
    rowCount: number;
    hashLineCount: number;
  };
}): (() => void) => {
  validationControls = controls;
  return () => {
    if (validationControls === controls) validationControls = null;
  };
};

export const incrementSolveDispatchCount = (): void => {
  solveDispatchCount += 1;
};

export type BikeJumperTestHooks = {
  workerSource: "solver" | "fixture";
  getState: typeof useAppStore.getState;
  resetStore: () => void;
  seekFrame: (frameIndex: number) => void;
  getSolveDispatchCount: () => number;
  selectDesignerKey: (index: number) => void;
  dragDesignerHandle: (joint: "knee" | "hip" | "spine", value: number) => void;
  designerHandlePositions: () => Array<{ joint: string; x: number; y: number }>;
  designerCheckpoint: () => DesignerCheckpoint;
  selectPoseKey: (index: number) => void;
  dragPoseHandle: (joint: "knee" | "hip" | "spine", value: number) => void;
  poseHandlePositions: () => Array<{ joint: string; x: number; y: number }>;
  poseCheckpoint: () => PoseCheckpoint;
  workbenchGeometryCheckpoint: () => WorkbenchCheckpoint;
  cameraCheckpoint: () => CameraResolution & { mode: CameraMode };
  selectReportRun: (runId: string) => void;
  selectReportBaseline: (runId: string) => void;
  reportCheckpoint: () => {
    runId: string;
    baselineRunId: string;
    chartCount: number;
  };
  validationCheckpoint: () => {
    status: "idle" | "running" | "completed" | "failed" | "budget-exceeded";
    checks: number;
    passing: number;
    failing: number;
    awaitingCore: number;
    running: number;
    rowCount: number;
    hashLineCount: number;
  };
  settleAnimations: () => Promise<void>;
  sampleCanvas: (label: string) => { minimum: number; maximum: number; nonTransparent: number };
  performanceSnapshot: () => InteractionPerformanceSnapshot;
  resetPerformanceSnapshot: () => void;
};

declare global {
  interface Window {
    __BIKE_JUMPER_TEST__?: BikeJumperTestHooks;
  }
}

export const installTestHooks = (): void => {
  if (import.meta.env.VITE_TEST_HOOKS !== "1") return;
  window.__BIKE_JUMPER_TEST__ = {
    workerSource: import.meta.env.VITE_WORKER_SOURCE === "fixture" ? "fixture" : "solver",
    getState: useAppStore.getState,
    resetStore: () => {
      solveDispatchCount = 0;
      useAppStore.getState().actions.clearScenario();
    },
    seekFrame: (frameIndex) => seekFrame?.(frameIndex),
    getSolveDispatchCount: () => solveDispatchCount,
    selectDesignerKey: (index) => poseControls?.selectKeyByIndex(index),
    dragDesignerHandle: (joint, value) => poseControls?.dragJointHandle(joint, value),
    designerHandlePositions: () => poseHandlePositions?.() ?? [],
    designerCheckpoint: () =>
      designerCheckpoint?.() ?? {
        activeRoute: useAppStore.getState().session.activeRoute,
        mode: "pose",
        geometryRequestId: 0,
        geometryStatus: "idle",
        geometry: null,
        draftValid: false,
        geometryIssueCodes: [],
        selectedKeyId: null,
        selectedIndex: -1,
        saturated: false,
        reason: null,
        minimumSeparation: null,
        contacts: [],
        inferredSaddleContact: false,
        acceptedTargets: null,
        conflictCodes: [],
        affectedKeyIndices: [],
        canSolve: null,
        targets: null,
        derivedArm: null,
        landmarks: null
      },
    selectPoseKey: (index) => poseControls?.selectKeyByIndex(index),
    dragPoseHandle: (joint, value) => poseControls?.dragJointHandle(joint, value),
    poseHandlePositions: () => poseHandlePositions?.() ?? [],
    poseCheckpoint: () =>
      poseControls?.getCheckpoint() ?? {
        selectedKeyId: null,
        selectedIndex: -1,
        saturated: false,
        reason: null,
        minimumSeparation: null,
        contacts: [],
        inferredSaddleContact: false,
        acceptedTargets: null,
        conflictCodes: [],
        affectedKeyIndices: [],
        canSolve: null,
        targets: null,
        derivedArm: null,
        landmarks: null
      },
    workbenchGeometryCheckpoint: () =>
      workbenchGeometry?.() ?? {
        targets: null,
        derivedArm: null,
        landmarks: null,
        groundedRear: null,
        groundedFront: null,
        minClearance: null,
        nearestTerrainSegment: null,
        touchdownFrame: null,
        touchdownIndicatorVisible: false
      },
    cameraCheckpoint: () =>
      cameraCheckpoint?.() ?? {
        mode: "follow",
        zoomFactor: 1,
        modelHeightFraction: 0,
        view: { minX: 0, maxX: 1, minY: 0, maxY: 1 }
      },
    selectReportRun: (runId) => reportControls?.selectRun(runId),
    selectReportBaseline: (runId) => reportControls?.selectBaseline(runId),
    reportCheckpoint: () =>
      reportControls?.getCheckpoint() ?? {
        runId: "",
        baselineRunId: "",
        chartCount: 0
      },
    validationCheckpoint: () =>
      validationControls?.getCheckpoint() ?? {
        status: "idle",
        checks: 0,
        passing: 0,
        failing: 0,
        awaitingCore: 0,
        running: 0,
        rowCount: 0,
        hashLineCount: 0
      },
    settleAnimations: () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    sampleCanvas: (label) => {
      const canvas = [...document.querySelectorAll("canvas")].find(
        (candidate) => candidate.getAttribute("aria-label") === label
      );
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return { minimum: 0, maximum: 0, nonTransparent: 0 };
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let minimum = 255;
      let maximum = 0;
      let nonTransparent = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const value = pixels[index] ?? 0;
        minimum = Math.min(minimum, value);
        maximum = Math.max(maximum, value);
        if ((pixels[index + 3] ?? 0) > 0) nonTransparent += 1;
      }
      return { minimum, maximum, nonTransparent };
    },
    performanceSnapshot: getPerformanceSnapshot,
    resetPerformanceSnapshot
  };
};
