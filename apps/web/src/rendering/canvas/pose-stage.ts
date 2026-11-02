import type {
  CanonicalBikeGeometry,
  Point2,
  PoseSample,
  Scenario
} from "../../../../../packages/schema/src/index";

import { configureCanvas, createCanvasViewport, type CanvasViewport } from "./viewport";
import { buildRiderGeometry } from "../geometry/rider-geometry";
import { drawFarRiderLimbs, drawNearRiderGeometry } from "../geometry/draw-rider";
import { canonicalLandmark } from "../geometry/bike-geometry";
import { drawBikeGeometry } from "../geometry/draw-bike";
import { handleLimitArc, poseHandles, type PoseHandle } from "../../features/designer/pose-handles";
import type { PoseFeasibleLimits } from "../../features/designer/pose-limits";
import { poseAuthoringRange, type JointName } from "../../features/designer/pose-sampling";

const POSE_STAGE_BOUNDS = { minX: -1.6, maxX: 1.6, minY: -0.3, maxY: 2.3 };

/** Same viewport the stage draws with, so pointer hit-testing stays exact. */
export const poseStageViewport = (canvas: HTMLCanvasElement): CanvasViewport =>
  createCanvasViewport(
    Math.max(1, canvas.clientWidth),
    Math.max(1, canvas.clientHeight),
    globalThis.devicePixelRatio || 1,
    POSE_STAGE_BOUNDS
  );

export type PoseHandleState = {
  hovered: JointName | null;
  active: JointName | null;
  showLimits: boolean;
};

const strokeArc = (
  context: CanvasRenderingContext2D,
  toScreen: (point: Point2) => [number, number],
  arc: Point2[],
  color: string,
  lineWidth: number,
  dash: number[]
): void => {
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.setLineDash(dash);
  context.beginPath();
  arc.forEach((point, index) => {
    const [x, y] = toScreen(point);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
  context.setLineDash([]);
};

const drawHandles = (
  context: CanvasRenderingContext2D,
  toScreen: (point: Point2) => [number, number],
  scenario: Scenario,
  handles: PoseHandle[],
  handleState: PoseHandleState,
  feasibleLimits: PoseFeasibleLimits | null,
  envelopeLimits: PoseFeasibleLimits | null
): void => {
  for (const handle of handles) {
    const active = handleState.active === handle.joint;
    const hovered = handleState.hovered === handle.joint;
    const emphasized = active || hovered;
    const declared = poseAuthoringRange(scenario, handle.joint);
    const envelope = envelopeLimits?.[handle.joint] ?? declared;
    const reachable = feasibleLimits?.[handle.joint] ?? envelope;

    if (handleState.showLimits) {
      // The envelope is everything any combination of the other joints can
      // reach; the reachable arc on top is what the current pose allows.
      strokeArc(
        context,
        toScreen,
        handleLimitArc(handle, envelope),
        emphasized ? "#8a5f5f" : "#5b4a4a",
        emphasized ? 2 : 1.5,
        [4, 4]
      );
      strokeArc(
        context,
        toScreen,
        handleLimitArc(handle, reachable),
        active ? "#f4c66a" : emphasized ? "#a9dcf0" : "#6f93a6",
        emphasized ? 3 : 2,
        []
      );
    }

    const [x, y] = toScreen(handle.point);
    context.beginPath();
    context.arc(x, y, active ? 11 : 9, 0, Math.PI * 2);
    context.fillStyle = active ? "rgba(244, 198, 106, 0.28)" : "rgba(127, 201, 232, 0.16)";
    context.fill();
    context.strokeStyle = active ? "#f4c66a" : hovered ? "#a9dcf0" : "#7fc9e8";
    context.lineWidth = 2;
    context.stroke();
  }
};

export const drawPoseStage = (
  canvas: HTMLCanvasElement,
  scenario: Scenario,
  sample: PoseSample | null,
  saturated: boolean,
  handleState: PoseHandleState = { hovered: null, active: null, showLimits: false },
  feasibleLimits: PoseFeasibleLimits | null = null,
  envelopeLimits: PoseFeasibleLimits | null = null,
  canonicalGeometry: CanonicalBikeGeometry | null = null,
  mode: "bike" | "pose" = "pose"
): void => {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const viewport = poseStageViewport(canvas);
  const context = configureCanvas(canvas, viewport);
  context.fillStyle = "#303841";
  context.fillRect(0, 0, width, height);

  const toScreen = (point: { x: number; y: number }): [number, number] =>
    viewport.worldToCss(point.x, point.y);

  const farPedal = canonicalGeometry
    ? canonicalLandmark(canonicalGeometry, "pedalRearward", "farPedalContact")
    : null;
  const geometry = buildRiderGeometry(sample?.landmarks ?? null, farPedal ?? { x: 0, y: 0 });

  // Far limbs draw before the frame so tubes (notably the top tube) sit in
  // front of them; near limbs draw after so they sit in front of the frame.
  drawFarRiderLimbs(context, toScreen, geometry, {});
  if (canonicalGeometry) {
    drawBikeGeometry(context, toScreen, canonicalGeometry, {
      protectedEnvelopes: mode === "bike",
      contacts: true,
      centerOfGravity: mode === "bike"
    });
  }
  drawNearRiderGeometry(context, toScreen, geometry, { saturated });
  if (mode === "pose") {
    drawHandles(
      context,
      toScreen,
      scenario,
      poseHandles(sample),
      handleState,
      feasibleLimits,
      envelopeLimits
    );
  }

  if (geometry.available) {
    context.fillStyle = saturated ? "#f08f7f" : "#7fc9e8";
    const [comX, comY] = toScreen({
      x: (geometry.hip.x + geometry.shoulder.x) / 2,
      y: (geometry.hip.y + geometry.shoulder.y) / 2
    });
    context.beginPath();
    context.arc(comX, comY, 4.5, 0, Math.PI * 2);
    context.fill();
  }
};
