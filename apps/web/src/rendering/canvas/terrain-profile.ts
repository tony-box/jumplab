import type { TerrainPoint, TerrainProfile } from "../../../../../packages/schema/src/index";

type TerrainPathContext = Pick<
  CanvasRenderingContext2D,
  "beginPath" | "moveTo" | "lineTo" | "stroke"
>;

type TerrainFillContext = Pick<
  CanvasRenderingContext2D,
  "beginPath" | "moveTo" | "lineTo" | "closePath" | "fill"
>;

export type TerrainDrawSummary = {
  segmentCount: number;
  vertexCount: number;
};

export type TerrainFillSummary = {
  filledSegmentCount: number;
  vertexCount: number;
};

export type NearestTerrainSegment = {
  segmentId: string;
  distance: number;
};

/**
 * Fills solid ground beneath each segment down to `bottomY`. Filling per segment
 * rather than as one body keeps gaps and step faces as true voids.
 */
export const fillTerrainProfileSegments = (
  context: TerrainFillContext,
  profile: TerrainProfile,
  toScreen: (point: TerrainPoint) => [number, number],
  bottomY: number
): TerrainFillSummary => {
  let filledSegmentCount = 0;
  let vertexCount = 0;
  for (const segment of profile.segments) {
    const first = segment.points[0];
    const last = segment.points[segment.points.length - 1];
    if (!first || !last || first[0] === last[0]) continue;

    context.beginPath();
    segment.points.forEach((point, index) => {
      const [screenX, screenY] = toScreen(point);
      if (index === 0) context.moveTo(screenX, screenY);
      else context.lineTo(screenX, screenY);
      vertexCount += 1;
    });
    context.lineTo(toScreen(last)[0], bottomY);
    context.lineTo(toScreen(first)[0], bottomY);
    context.closePath();
    context.fill();
    filledSegmentCount += 1;
  }
  return { filledSegmentCount, vertexCount };
};

export const drawTerrainProfileSegments = (
  context: TerrainPathContext,
  profile: TerrainProfile,
  toScreen: (point: TerrainPoint) => [number, number]
): TerrainDrawSummary => {
  let vertexCount = 0;
  let segmentCount = 0;
  for (const segment of profile.segments) {
    const first = segment.points[0];
    const last = segment.points[segment.points.length - 1];
    // Vertical cut faces are body boundaries the fill already expresses, not rideable surface.
    if (!first || !last || first[0] === last[0]) continue;

    context.beginPath();
    segment.points.forEach((point, index) => {
      const [screenX, screenY] = toScreen(point);
      if (index === 0) context.moveTo(screenX, screenY);
      else context.lineTo(screenX, screenY);
      vertexCount += 1;
    });
    context.stroke();
    segmentCount += 1;
  }
  return { segmentCount, vertexCount };
};

const pointToEdgeDistance = (
  point: { x: number; y: number },
  start: TerrainPoint,
  end: TerrainPoint
): number => {
  const edgeX = end[0] - start[0];
  const edgeY = end[1] - start[1];
  const lengthSquared = edgeX * edgeX + edgeY * edgeY;
  const projection =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((point.x - start[0]) * edgeX + (point.y - start[1]) * edgeY) / lengthSquared)
        );
  return Math.hypot(
    point.x - (start[0] + projection * edgeX),
    point.y - (start[1] + projection * edgeY)
  );
};

/** Surface height at a world x, mirroring the solver's initial body placement. */
export const terrainHeightAt = (profile: TerrainProfile | null, x: number): number | null => {
  for (const segment of profile?.segments ?? []) {
    for (let index = 1; index < segment.points.length; index += 1) {
      const start = segment.points[index - 1];
      const end = segment.points[index];
      if (!start || !end || start[0] === end[0]) continue;
      if (x < Math.min(start[0], end[0]) || x > Math.max(start[0], end[0])) continue;
      return start[1] + ((end[1] - start[1]) * (x - start[0])) / (end[0] - start[0]);
    }
  }
  return null;
};

export const nearestTerrainSegment = (
  profile: TerrainProfile | null,
  point: { x: number; y: number }
): NearestTerrainSegment | null => {
  let nearest: NearestTerrainSegment | null = null;
  for (const segment of profile?.segments ?? []) {
    for (let index = 1; index < segment.points.length; index += 1) {
      const start = segment.points[index - 1];
      const end = segment.points[index];
      if (!start || !end) continue;
      const distance = pointToEdgeDistance(point, start, end);
      if (!nearest || distance < nearest.distance) {
        nearest = { segmentId: segment.id, distance };
      }
    }
  }
  return nearest;
};
