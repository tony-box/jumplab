import type { Scenario } from "../../../../../packages/schema/src/index";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const createPresetThumbnailPath = (
  scenario: Scenario
): {
  terrainPath: string;
  fillPath: string;
  markers: Array<{ x: number; y: number }>;
} => {
  const lipX = 0;
  const landingX = scenario.jump.gap;
  const landingEndX = landingX + scenario.jump.landingLength;
  const points = [
    { x: scenario.entry.startX, y: 0 },
    { x: -scenario.jump.transitionLength, y: 0 },
    { x: lipX, y: scenario.jump.lipHeight },
    { x: landingX, y: scenario.jump.lipHeight + scenario.jump.stepDelta },
    { x: landingEndX, y: -0.2 },
    { x: landingEndX + scenario.jump.rollout, y: -0.2 }
  ];
  const width = 340;
  const height = 132;
  const padding = 10;

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs, scenario.entry.startX);
  const maxX = Math.max(...xs, landingEndX + scenario.jump.rollout);
  const maxY = Math.max(...ys, scenario.jump.lipHeight + 2);
  const minY = -0.8;

  const scaleX = (width - padding * 2) / Math.max(0.1, maxX - minX);
  const scaleY = (height - padding * 2) / Math.max(0.1, maxY - minY);
  const scale = Math.min(scaleX, scaleY);

  const xToSvg = (x: number): number => padding + (x - minX) * scale;
  const yToSvg = (y: number): number => height - padding - (y - minY) * scale;

  const terrainPath = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${xToSvg(point.x).toFixed(2)} ${yToSvg(point.y).toFixed(2)}`
    )
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const fillPath = `${terrainPath} L ${xToSvg(last?.x ?? 0).toFixed(2)} ${(height + 8).toFixed(2)} L ${xToSvg(
    first?.x ?? 0
  ).toFixed(2)} ${(height + 8).toFixed(2)} Z`;

  return {
    terrainPath,
    fillPath,
    markers: [
      {
        x: clamp(xToSvg(lipX), padding, width - padding),
        y: clamp(yToSvg(scenario.jump.lipHeight), 0, height)
      },
      {
        x: clamp(xToSvg(landingX), padding, width - padding),
        y: clamp(yToSvg(scenario.jump.lipHeight + scenario.jump.stepDelta), 0, height)
      }
    ]
  };
};
