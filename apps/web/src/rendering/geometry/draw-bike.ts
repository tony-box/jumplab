import type {
  CanonicalBikeGeometry,
  Point2,
  ProtectedShape
} from "../../../../../packages/schema/src/index";
import type { ToScreen } from "./draw-rider";

export type BikeDrawingOptions = {
  protectedEnvelopes?: boolean;
  contacts?: boolean;
  centerOfGravity?: boolean;
};

const FAR_SIDE_COLOR = "#4b5760";
const COMPONENT_COLOR = "#f2c14e";

const memberColor = (name: string): string => {
  if (name === "fork" || name === "rearShock") return "#89d3ff";
  if (name.includes("crank") || name === "handlebar" || name === "saddle") {
    return COMPONENT_COLOR;
  }
  if (name === "seatSupport") return "#eef3f6";
  return "#8fa2ad";
};

const line = (
  context: CanvasRenderingContext2D,
  toScreen: ToScreen,
  start: Point2,
  end: Point2,
  color: string,
  width: number
): void => {
  const [startX, startY] = toScreen(start);
  const [endX, endY] = toScreen(end);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(startX, startY);
  context.lineTo(endX, endY);
  context.stroke();
};

const drawShape = (
  context: CanvasRenderingContext2D,
  toScreen: ToScreen,
  shape: ProtectedShape
): void => {
  context.beginPath();
  if (shape.shape === "capsule") {
    const [startX, startY] = toScreen(shape.start);
    const [endX, endY] = toScreen(shape.end);
    const [, radiusY] = toScreen({ x: shape.start.x, y: shape.start.y + shape.radius });
    context.lineWidth = Math.max(1, Math.abs(startY - radiusY) * 2);
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
    return;
  }
  if (shape.shape === "circle" || shape.shape === "ring") {
    const [x, y] = toScreen(shape.center);
    const radius = shape.shape === "ring" ? shape.outerRadius : shape.radius;
    const [, radiusY] = toScreen({ x: shape.center.x, y: shape.center.y + radius });
    context.arc(x, y, Math.abs(y - radiusY), 0, Math.PI * 2);
    context.stroke();
    return;
  }
  shape.points.forEach((point, index) => {
    const [x, y] = toScreen(point);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.stroke();
};

const drawSaddle = (
  context: CanvasRenderingContext2D,
  toScreen: ToScreen,
  shape: ProtectedShape
): void => {
  if (shape.shape !== "capsule") {
    drawShape(context, toScreen, shape);
    return;
  }

  const dx = shape.end.x - shape.start.x;
  const dy = shape.end.y - shape.start.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-9) return;
  const inset = Math.min(0.035, length * 0.2);
  const ratio = inset / length;
  line(
    context,
    toScreen,
    { x: shape.start.x + dx * ratio, y: shape.start.y + dy * ratio },
    { x: shape.end.x - dx * ratio, y: shape.end.y - dy * ratio },
    COMPONENT_COLOR,
    5
  );
};

export const drawBikeGeometry = (
  context: CanvasRenderingContext2D,
  toScreen: ToScreen,
  geometry: CanonicalBikeGeometry,
  options: BikeDrawingOptions = {}
): void => {
  if (options.protectedEnvelopes) {
    context.save();
    context.strokeStyle = "rgba(240, 143, 127, 0.42)";
    context.setLineDash([4, 4]);
    for (const shape of geometry.protectedShapes) drawShape(context, toScreen, shape);
    context.setLineDash([]);
    context.restore();
  }

  const farCrank = geometry.members.find((member) => member.name === "crankRearward");
  if (farCrank) {
    line(context, toScreen, farCrank.start, farCrank.end, FAR_SIDE_COLOR, 3);
  }

  for (const member of geometry.members.filter((candidate) => candidate !== farCrank)) {
    line(context, toScreen, member.start, member.end, memberColor(member.name), 3);
  }

  const saddle = geometry.protectedShapes.find((shape) => shape.part === "saddle");
  if (saddle) {
    context.save();
    drawSaddle(context, toScreen, saddle);
    context.restore();
  }

  for (const shape of geometry.protectedShapes.filter((candidate) => candidate.shape === "ring")) {
    context.strokeStyle = "#dbe3e8";
    context.lineWidth = 2;
    drawShape(context, toScreen, shape);
  }

  if (options.contacts) {
    for (const shape of geometry.protectedShapes.filter(
      (candidate) => candidate.contactSurface !== "none"
    )) {
      const point =
        shape.part === "saddle" && shape.shape === "capsule"
          ? {
              x: (shape.start.x + shape.end.x) / 2,
              y: (shape.start.y + shape.end.y) / 2
            }
          : shape.shape === "capsule"
            ? shape.end
            : shape.shape === "circle" || shape.shape === "ring"
              ? shape.center
              : shape.points[0];
      if (!point) continue;
      const [x, y] = toScreen(point);
      context.fillStyle = shape.part === "pedalRearward" ? FAR_SIDE_COLOR : COMPONENT_COLOR;
      context.beginPath();
      context.arc(x, y, 3.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  if (options.centerOfGravity) {
    const [x, y] = toScreen(geometry.massProperties.centerOfGravity);
    context.fillStyle = "#82d28d";
    context.beginPath();
    context.arc(x, y, 4.5, 0, Math.PI * 2);
    context.fill();
  }
};
