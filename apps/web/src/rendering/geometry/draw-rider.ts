import type { Point2 } from "../../../../../packages/schema/src/index";
import type { RiderGeometry, RiderLimbChain } from "../geometry/rider-geometry";

export type ToScreen = (point: Point2) => [number, number];

const strokeChain = (
  context: CanvasRenderingContext2D,
  toScreen: ToScreen,
  points: Point2[],
  color: string,
  lineWidth: number
): void => {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  points.forEach((point, index) => {
    const [x, y] = toScreen(point);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
};

const chainPoints = (chain: RiderLimbChain): Point2[] => [
  chain.distal,
  chain.middle,
  chain.proximal
];

const dotJoints = (
  context: CanvasRenderingContext2D,
  toScreen: ToScreen,
  points: Point2[],
  color: string,
  radius: number
): void => {
  context.fillStyle = color;
  for (const point of points) {
    const [x, y] = toScreen(point);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
};

/**
 * Draws only the far (dimmer, behind) limb pair. Callers draw this before
 * the bike frame so frame tubes (notably the top tube) render in front of
 * the far leg/arm, matching their greater depth.
 */
export const drawFarRiderLimbs = (
  context: CanvasRenderingContext2D,
  toScreen: ToScreen,
  geometry: RiderGeometry,
  options: { lineWidth?: number }
): void => {
  if (!geometry.available) {
    return;
  }

  const farColor = "#4b5760";
  const lineWidth = options.lineWidth ?? 4;

  strokeChain(context, toScreen, chainPoints(geometry.farLeg), farColor, lineWidth * 0.75);
  strokeChain(context, toScreen, chainPoints(geometry.farArm), farColor, lineWidth * 0.75);
};

/**
 * Draws the torso, near limb pair, and joint markers. Callers draw this
 * after the bike frame so the near limbs render in front of it.
 */
export const drawNearRiderGeometry = (
  context: CanvasRenderingContext2D,
  toScreen: ToScreen,
  geometry: RiderGeometry,
  options: { saturated: boolean; lineWidth?: number }
): void => {
  if (!geometry.available) {
    return;
  }

  const accentColor = options.saturated ? "#f08f7f" : "#66c878";
  const lineWidth = options.lineWidth ?? 4;

  strokeChain(
    context,
    toScreen,
    [geometry.hip, geometry.shoulder, geometry.head],
    accentColor,
    lineWidth
  );
  strokeChain(context, toScreen, chainPoints(geometry.nearLeg), accentColor, lineWidth);
  strokeChain(context, toScreen, chainPoints(geometry.nearArm), accentColor, lineWidth);

  dotJoints(
    context,
    toScreen,
    [
      geometry.head,
      geometry.shoulder,
      geometry.hip,
      geometry.nearArm.middle,
      geometry.nearArm.distal,
      geometry.nearLeg.middle,
      geometry.nearLeg.distal
    ],
    "#dbe3e8",
    lineWidth * 1.15
  );
};

/**
 * Draws the complete rider (far limbs, torso, near limbs, joint markers) in
 * one call, for callers that don't need the bike frame interleaved between
 * the far and near limb pairs.
 */
export const drawRiderGeometry = (
  context: CanvasRenderingContext2D,
  toScreen: ToScreen,
  geometry: RiderGeometry,
  options: { saturated: boolean; lineWidth?: number }
): void => {
  drawFarRiderLimbs(context, toScreen, geometry, options);
  drawNearRiderGeometry(context, toScreen, geometry, options);
};
