import { describe, expect, it } from "vitest";

import { createCanvasViewport } from "../../src/rendering/canvas/viewport";
import { createFrameBufferView } from "../../src/solver/frame-buffer";
import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32
} from "../../../../packages/schema/src/run-result";
import {
  clampFrameIndex,
  interpolateFrameField,
  stepFrameIndex
} from "../../src/features/workbench/usePlayback";

const layout = {
  version: FRAME_LAYOUT_VERSION,
  strideFloat32: FRAME_STRIDE_FLOAT32,
  fields: FRAME_LAYOUT_FIELDS.map((field) => ({ ...field }))
};

describe("immutable frame playback", () => {
  it("reads typed contact state through the frame layout", () => {
    const values = new Float32Array(FRAME_STRIDE_FLOAT32);
    values[31] = 1;
    values[32] = 0;
    values[33] = 420;
    values[34] = 0;
    values[35] = -0.002;
    const frames = createFrameBufferView(
      {
        version: FRAME_LAYOUT_VERSION,
        strideFloat32: FRAME_STRIDE_FLOAT32,
        fields: FRAME_LAYOUT_FIELDS.map((field) => ({ ...field }))
      },
      values.buffer
    );

    expect(frames.readContactState(0)).toEqual({
      groundedRear: true,
      groundedFront: false,
      normalForceRear: 420,
      normalForceFront: 0,
      minClearance: expect.closeTo(-0.002)
    });
  });

  it("steps and scrubs by exact bounded frame index", () => {
    expect(stepFrameIndex(5, 1, 10)).toBe(6);
    expect(stepFrameIndex(9, 1, 10)).toBe(9);
    expect(stepFrameIndex(0, -1, 10)).toBe(0);
    expect(clampFrameIndex(4.9, 10)).toBe(4);
  });

  it("interpolates display values without mutating immutable frames", () => {
    const source = new Float32Array(FRAME_STRIDE_FLOAT32 * 2);
    source[1] = 0;
    source[FRAME_STRIDE_FLOAT32 + 1] = 10;
    const frames = createFrameBufferView(layout, source.buffer);
    const sample = interpolateFrameField(frames, "x", 0.5);

    expect(Array.from(sample)).toEqual([5]);
    expect(source[1]).toBe(0);
    expect(source[FRAME_STRIDE_FLOAT32 + 1]).toBe(10);
  });

  it("keeps CSS framing invariant across device pixel ratios", () => {
    const bounds = { minX: -10, maxX: 20, minY: -2, maxY: 8 };
    const oneX = createCanvasViewport(900, 500, 1, bounds);
    const twoX = createCanvasViewport(900, 500, 2, bounds);

    expect(oneX.worldToCss(3, 2)).toEqual(twoX.worldToCss(3, 2));
    expect(twoX.backingWidth).toBe(oneX.backingWidth * 2);
    expect(twoX.worldToBacking(3, 2)).toEqual(oneX.worldToCss(3, 2).map((value) => value * 2));
  });
});
