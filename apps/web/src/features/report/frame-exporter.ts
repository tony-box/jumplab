import type { RunArtifact } from "../../../../../packages/schema/src/index";

import { createFrameBufferView } from "../../solver/frame-buffer";

const canonicalFieldHeader = (name: string): string => {
  switch (name) {
    case "t":
      return "time_s";
    case "x":
      return "x_m";
    case "y":
      return "y_m";
    case "vx":
      return "vx_m_per_s";
    case "vy":
      return "vy_m_per_s";
    case "pitch":
      return "pitch_rad";
    case "contactImpulse":
      return "contact_impulse_n_s";
    default:
      return name;
  }
};

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return "";
  }
  return Number(value.toFixed(6)).toString();
};

export const exportArtifactFramesCsv = (artifact: RunArtifact): string => {
  if (artifact.frameBuffer.byteLength === 0 || artifact.manifest.frameCount === 0) {
    throw new Error("Frame data unavailable: run has no frame samples to export.");
  }

  let frameView;
  try {
    frameView = createFrameBufferView(artifact.manifest.frameLayout, artifact.frameBuffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "invalid frame buffer layout";
    throw new Error(`Frame data unavailable: ${message}. Re-run solve and try export again.`);
  }

  const header = [
    "run_id",
    "frame_index",
    ...artifact.manifest.frameLayout.fields.flatMap((field) => {
      const canonical = canonicalFieldHeader(field.name);
      if (field.length === 1) {
        return canonical;
      }
      return Array.from({ length: field.length }, (_unused, index) => `${canonical}_${index}`);
    })
  ];

  const lines: string[] = [header.join(",")];
  for (let frameIndex = 0; frameIndex < frameView.frameCount; frameIndex += 1) {
    const row: string[] = [artifact.runId, String(frameIndex)];
    for (const field of artifact.manifest.frameLayout.fields) {
      const values = frameView.readField(frameIndex, field.name);
      for (let index = 0; index < field.length; index += 1) {
        row.push(formatNumber(values[index] ?? Number.NaN));
      }
    }
    lines.push(row.join(","));
  }

  return lines.join("\n");
};
