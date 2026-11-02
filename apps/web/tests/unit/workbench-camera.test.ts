import { describe, expect, it } from "vitest";

import { normalizePlaybackRate } from "../../src/features/workbench/usePlayback";

import {
  clampZoomFactor,
  interpolateWorldBounds,
  resolveCameraView,
  type CameraViewState,
  type ModelExtent
} from "../../src/rendering/canvas/camera";

const modelExtent: ModelExtent = { minX: -0.8, maxX: 0.9, minY: 0, maxY: 2 };
const follow: CameraViewState = { mode: "follow", zoomFactor: 1, manual: null };

describe("playback speed", () => {
  it("supports 0.1x through 2x with detents at 0.5x and 1x", () => {
    expect(normalizePlaybackRate(0)).toBe(0.1);
    expect(normalizePlaybackRate(0.3)).toBe(0.3);
    expect(normalizePlaybackRate(0.46)).toBe(0.5);
    expect(normalizePlaybackRate(0.96)).toBe(1);
    expect(normalizePlaybackRate(1.4)).toBe(1.4);
    expect(normalizePlaybackRate(3)).toBe(2);
  });
});

describe("workbench camera", () => {
  it("frames the model at the default Follow scale and forward bias", () => {
    const result = resolveCameraView({
      frameX: -14,
      modelExtent,
      camera: follow,
      stageWidth: 960,
      stageHeight: 540
    });

    expect(result.modelHeightFraction).toBeCloseTo(0.32);
    const bikeFraction = (-14 - result.view.minX) / (result.view.maxX - result.view.minX);
    expect(bikeFraction).toBeGreaterThanOrEqual(0.32);
    expect(bikeFraction).toBeLessThanOrEqual(0.38);
  });

  it("keeps manual framing stable and clamps zoom", () => {
    const manual: CameraViewState = {
      mode: "pan-zoom",
      zoomFactor: 3,
      manual: { centerX: 4, centerY: 2, zoomFactor: 8 }
    };
    const first = resolveCameraView({
      frameX: -14,
      modelExtent,
      camera: manual,
      stageWidth: 960,
      stageHeight: 540
    });
    const later = resolveCameraView({
      frameX: 20,
      modelExtent: { ...modelExtent, minX: 19.2, maxX: 20.9 },
      camera: manual,
      stageWidth: 960,
      stageHeight: 540
    });

    expect(first.zoomFactor).toBe(3);
    expect(later.view).toEqual(first.view);
    expect(clampZoomFactor(0.1)).toBe(0.5);
  });

  it("returns finite bounds for degenerate stage sizes", () => {
    const result = resolveCameraView({
      frameX: 0,
      modelExtent,
      camera: follow,
      stageWidth: 0,
      stageHeight: 0
    });
    expect(Object.values(result.view).every(Number.isFinite)).toBe(true);
    expect(result.view.maxX).toBeGreaterThan(result.view.minX);
    expect(result.view.maxY).toBeGreaterThan(result.view.minY);
  });

  it("frames the whole jump statically and ignores bike position in Jump mode", () => {
    const jumpExtent = { minX: -5, maxX: 17, minY: 0, maxY: 1.2 };
    const jump: CameraViewState = { mode: "jump", zoomFactor: 1, manual: null };
    const atApproach = resolveCameraView({
      frameX: -5,
      modelExtent,
      camera: jump,
      stageWidth: 960,
      stageHeight: 540,
      jumpExtent
    });
    const midFlight = resolveCameraView({
      frameX: 9,
      modelExtent: { ...modelExtent, minX: 8.2, maxX: 9.9 },
      camera: jump,
      stageWidth: 960,
      stageHeight: 540,
      jumpExtent
    });

    expect(midFlight.view).toEqual(atApproach.view);
    expect(atApproach.view.minX).toBeLessThan(jumpExtent.minX);
    expect(atApproach.view.maxX).toBeGreaterThan(jumpExtent.maxX);
    expect(atApproach.view.minY).toBeLessThan(jumpExtent.minY);
    expect(atApproach.view.maxY).toBeGreaterThan(jumpExtent.maxY);

    const aspect =
      (atApproach.view.maxX - atApproach.view.minX) / (atApproach.view.maxY - atApproach.view.minY);
    expect(aspect).toBeCloseTo(960 / 540);
  });

  it("falls back to Follow framing when no terrain extent is available", () => {
    const jump: CameraViewState = { mode: "jump", zoomFactor: 1, manual: null };
    const withoutTerrain = resolveCameraView({
      frameX: -5,
      modelExtent,
      camera: jump,
      stageWidth: 960,
      stageHeight: 540,
      jumpExtent: null
    });
    const followed = resolveCameraView({
      frameX: -5,
      modelExtent,
      camera: follow,
      stageWidth: 960,
      stageHeight: 540
    });

    expect(withoutTerrain.view).toEqual(followed.view);
  });

  it("interpolates camera bounds with exact clamped endpoints", () => {
    const start = { minX: -5, maxX: 5, minY: -2, maxY: 3 };
    const end = { minX: 0, maxX: 20, minY: -4, maxY: 6 };

    expect(interpolateWorldBounds(start, end, -1)).toEqual(start);
    expect(interpolateWorldBounds(start, end, 1)).toEqual(end);
    expect(interpolateWorldBounds(start, end, 0.5)).toEqual({
      minX: -2.5,
      maxX: 12.5,
      minY: -3,
      maxY: 4.5
    });
  });
});
