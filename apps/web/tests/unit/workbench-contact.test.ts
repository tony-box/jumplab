import { describe, expect, it } from "vitest";

import {
  FRAME_LAYOUT_FIELDS,
  FRAME_LAYOUT_VERSION,
  FRAME_STRIDE_FLOAT32
} from "../../../../packages/schema/src/index";
import { findTouchdownFrame } from "../../src/features/workbench/useWorkbench";
import { createFrameBufferView } from "../../src/solver/frame-buffer";

const fieldOffset = (name: string): number => {
  const field = FRAME_LAYOUT_FIELDS.find((entry) => entry.name === name);
  if (!field) throw new Error(`Missing frame field ${name}`);
  return field.offset;
};

describe("workbench contact transitions", () => {
  it("uses the first supported frame after airborne as touchdown", () => {
    const data = new Float32Array(4 * FRAME_STRIDE_FLOAT32);
    data[2 * FRAME_STRIDE_FLOAT32 + fieldOffset("groundedFront")] = 1;
    data[3 * FRAME_STRIDE_FLOAT32 + fieldOffset("groundedRear")] = 1;
    const frameView = createFrameBufferView(
      {
        version: FRAME_LAYOUT_VERSION,
        strideFloat32: FRAME_STRIDE_FLOAT32,
        fields: FRAME_LAYOUT_FIELDS
      },
      data.buffer
    );

    expect(findTouchdownFrame(frameView)).toBe(2);
  });
});
