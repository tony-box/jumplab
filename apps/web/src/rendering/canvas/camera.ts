import type { WorldBounds } from "./viewport";

export const MIN_ZOOM_FACTOR = 0.5;
export const MAX_ZOOM_FACTOR = 3;
export const FOLLOW_MODEL_FRACTION = 0.32;
export const FOLLOW_BIKE_FRACTION = 0.35;
/** Breathing room kept around the fitted jump, as a fraction of its extent. */
export const JUMP_VIEW_PADDING = 0.08;

export type CameraMode = "follow" | "pan-zoom" | "jump";

export type ManualCameraState = {
  centerX: number;
  centerY: number;
  zoomFactor: number;
  baseWidth?: number;
  baseHeight?: number;
};

export type CameraViewState = {
  mode: CameraMode;
  zoomFactor: number;
  manual: ManualCameraState | null;
};

export type ModelExtent = WorldBounds;

export type CameraResolution = {
  view: WorldBounds;
  zoomFactor: number;
  modelHeightFraction: number;
};

const finite = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export const clampZoomFactor = (zoomFactor: number): number =>
  Math.min(MAX_ZOOM_FACTOR, Math.max(MIN_ZOOM_FACTOR, finite(zoomFactor, 1)));

const modelDimensions = (extent: ModelExtent) => ({
  width: Math.max(0.1, finite(extent.maxX - extent.minX, 1.8)),
  height: Math.max(0.1, finite(extent.maxY - extent.minY, 2))
});

const defaultViewSize = (
  extent: ModelExtent,
  stageWidth: number,
  stageHeight: number
): { width: number; height: number; modelHeightFraction: number } => {
  const model = modelDimensions(extent);
  const safeWidth = Math.max(1, finite(stageWidth, 1));
  const safeHeight = Math.max(1, finite(stageHeight, 1));
  const height = model.height / FOLLOW_MODEL_FRACTION;
  const width = Math.max(model.width * 1.5, height * (safeWidth / safeHeight));
  return { width, height, modelHeightFraction: model.height / height };
};

/** Fits bounds into the stage aspect by growing the deficient axis, never cropping. */
const fitBounds = (
  extent: WorldBounds,
  stageWidth: number,
  stageHeight: number,
  zoomFactor: number
): WorldBounds => {
  const centerX = finite((extent.minX + extent.maxX) / 2, 0);
  const centerY = finite((extent.minY + extent.maxY) / 2, 0);
  const padding = 1 + 2 * JUMP_VIEW_PADDING;
  const extentWidth = Math.max(0.1, finite(extent.maxX - extent.minX, 1)) * padding;
  const extentHeight = Math.max(0.1, finite(extent.maxY - extent.minY, 1)) * padding;
  const aspect = Math.max(0.1, finite(stageWidth, 1)) / Math.max(0.1, finite(stageHeight, 1));

  const width = Math.max(extentWidth, extentHeight * aspect) / zoomFactor;
  const height = width / aspect;
  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minY: centerY - height / 2,
    maxY: centerY + height / 2
  };
};

export const resolveCameraView = (input: {
  frameX: number;
  modelExtent: ModelExtent;
  camera: CameraViewState;
  stageWidth: number;
  stageHeight: number;
  jumpExtent?: WorldBounds | null;
}): CameraResolution => {
  const size = defaultViewSize(input.modelExtent, input.stageWidth, input.stageHeight);
  const frameX = finite(input.frameX, 0);
  const sharedZoomFactor = clampZoomFactor(input.camera.zoomFactor);

  if (input.camera.mode === "jump" && input.jumpExtent) {
    const view = fitBounds(input.jumpExtent, input.stageWidth, input.stageHeight, sharedZoomFactor);
    return {
      view,
      zoomFactor: sharedZoomFactor,
      modelHeightFraction: modelDimensions(input.modelExtent).height / (view.maxY - view.minY)
    };
  }

  if (input.camera.mode === "pan-zoom" && input.camera.manual) {
    const zoomFactor = sharedZoomFactor;
    const width =
      Math.max(0.1, finite(input.camera.manual.baseWidth ?? size.width, size.width)) / zoomFactor;
    const height =
      Math.max(0.1, finite(input.camera.manual.baseHeight ?? size.height, size.height)) /
      zoomFactor;
    const centerX = finite(input.camera.manual.centerX, frameX);
    const centerY = finite(input.camera.manual.centerY, 1.5);
    return {
      view: {
        minX: centerX - width / 2,
        maxX: centerX + width / 2,
        minY: centerY - height / 2,
        maxY: centerY + height / 2
      },
      zoomFactor,
      modelHeightFraction: modelDimensions(input.modelExtent).height / height
    };
  }

  const width = size.width / sharedZoomFactor;
  const height = size.height / sharedZoomFactor;
  const modelCenterY = finite((input.modelExtent.minY + input.modelExtent.maxY) / 2, 1.5);
  const minX = frameX - width * FOLLOW_BIKE_FRACTION;
  return {
    view: {
      minX,
      maxX: minX + width,
      minY: modelCenterY - height / 2,
      maxY: modelCenterY + height / 2
    },
    zoomFactor: sharedZoomFactor,
    modelHeightFraction: size.modelHeightFraction * sharedZoomFactor
  };
};

export const viewCenter = (view: WorldBounds): { x: number; y: number } => ({
  x: (view.minX + view.maxX) / 2,
  y: (view.minY + view.maxY) / 2
});

export const interpolateWorldBounds = (
  start: WorldBounds,
  end: WorldBounds,
  fraction: number
): WorldBounds => {
  const amount = Math.min(1, Math.max(0, fraction));
  const interpolate = (from: number, to: number) => from + (to - from) * amount;
  return {
    minX: interpolate(start.minX, end.minX),
    maxX: interpolate(start.maxX, end.maxX),
    minY: interpolate(start.minY, end.minY),
    maxY: interpolate(start.maxY, end.maxY)
  };
};
