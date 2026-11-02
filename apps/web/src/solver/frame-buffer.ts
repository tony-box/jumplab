import type { FrameLayout, Telemetry } from "../../../../packages/schema/src/run-result";

export type FrameBufferView = {
  readonly frameCount: number;
  readonly strideFloat32: number;
  readonly data: Float32Array;
  readField: (frameIndex: number, fieldName: string) => Float32Array;
  readContactState: (frameIndex: number) => FrameContactState;
  hasField: (fieldName: string) => boolean;
};

export type FrameContactState = {
  groundedRear: boolean;
  groundedFront: boolean;
  normalForceRear: number;
  normalForceFront: number;
  minClearance: number;
};

export type TelemetryBufferView = {
  readonly sampleCount: number;
  readonly data: Float32Array;
  readChannel: (name: string) => Float32Array;
};

const assertValidFrameLayout = (layout: FrameLayout, frameBuffer: ArrayBuffer): void => {
  const expectedBytes = layout.strideFloat32 * 4;
  if (expectedBytes <= 0 || frameBuffer.byteLength % expectedBytes !== 0) {
    throw new Error("buffer_layout_error: invalid frame byte length");
  }
};

export const createFrameBufferView = (
  frameLayout: FrameLayout,
  frameBuffer: ArrayBuffer
): FrameBufferView => {
  assertValidFrameLayout(frameLayout, frameBuffer);

  const frameCount = frameBuffer.byteLength / (frameLayout.strideFloat32 * 4);
  const data = new Float32Array(frameBuffer);

  const readField = (frameIndex: number, fieldName: string): Float32Array => {
    if (frameIndex < 0 || frameIndex >= frameCount) {
      throw new Error("buffer_layout_error: frame index out of bounds");
    }

    const field = frameLayout.fields.find((entry) => entry.name === fieldName);
    if (!field) {
      throw new Error(`buffer_layout_error: unknown field ${fieldName}`);
    }

    const start = frameIndex * frameLayout.strideFloat32 + field.offset;
    return data.slice(start, start + field.length);
  };

  const readScalar = (frameIndex: number, fieldName: string): number => {
    const value = readField(frameIndex, fieldName)[0];
    if (value === undefined) {
      throw new Error(`buffer_layout_error: empty field ${fieldName}`);
    }
    return value;
  };

  return {
    frameCount,
    strideFloat32: frameLayout.strideFloat32,
    data,
    readField,
    readContactState: (frameIndex) => ({
      groundedRear: readScalar(frameIndex, "groundedRear") === 1,
      groundedFront: readScalar(frameIndex, "groundedFront") === 1,
      normalForceRear: readScalar(frameIndex, "normalForceRear"),
      normalForceFront: readScalar(frameIndex, "normalForceFront"),
      minClearance: readScalar(frameIndex, "minClearance")
    }),
    hasField: (fieldName) => frameLayout.fields.some((entry) => entry.name === fieldName)
  };
};

export const createTelemetryBufferView = (
  telemetry: Telemetry,
  telemetryBuffer: ArrayBuffer
): TelemetryBufferView => {
  const data = new Float32Array(telemetryBuffer);
  if (telemetry.sampleCount > data.length) {
    throw new Error("buffer_layout_error: telemetry sampleCount exceeds buffer");
  }

  return {
    sampleCount: telemetry.sampleCount,
    data,
    readChannel: (name) => {
      const channel = telemetry.channels.find((entry) => entry.name === name);
      if (!channel) {
        throw new Error(`buffer_layout_error: unknown channel ${name}`);
      }
      return data.slice(channel.offset, channel.offset + channel.count);
    }
  };
};
