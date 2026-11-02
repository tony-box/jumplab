import type {
  AchievedPoseLandmarks,
  CanonicalBikeGeometry,
  Point2,
  Scenario,
  TerrainPoint,
  TerrainProfile
} from "../../../../../packages/schema/src/index";

import { configureCanvas, createCanvasViewport } from "./viewport";
import {
  resolveCameraView,
  type CameraResolution,
  type CameraViewState,
  type ModelExtent
} from "./camera";
import type { WorldBounds } from "./viewport";
import { drawTerrainProfileSegments, fillTerrainProfileSegments } from "./terrain-profile";
import { buildRiderGeometry, unavailableRiderGeometry } from "../geometry/rider-geometry";
import { drawFarRiderLimbs, drawNearRiderGeometry } from "../geometry/draw-rider";
import {
  canonicalGeometryPoints,
  canonicalLandmark,
  transformCanonicalBikeGeometry,
  type BikeGeometry
} from "../geometry/bike-geometry";
import { drawBikeGeometry } from "../geometry/draw-bike";

export type WorkbenchFrame = {
  x: number;
  y: number;
  pitch: number;
  vx?: number;
  vy?: number;
  contactImpulse?: number;
  groundedRear?: boolean;
  groundedFront?: boolean;
  normalForceRear?: number;
  normalForceFront?: number;
  minClearance?: number;
  shoulder?: number;
  elbow?: number;
  /** Bike-local achieved rider/contact landmarks; undefined for legacy runs. */
  landmarks?: AchievedPoseLandmarks;
};

/** Rotates and translates a bike-local point into world coordinates. */
export const toWorldPoint = (local: Point2, frame: WorkbenchFrame): Point2 => {
  const cos = Math.cos(frame.pitch);
  const sin = Math.sin(frame.pitch);
  return {
    x: frame.x + local.x * cos - local.y * sin,
    y: frame.y + local.x * sin + local.y * cos
  };
};

const worldRiderGeometry = (frame: WorkbenchFrame, canonicalGeometry: CanonicalBikeGeometry) => {
  const farPedal = canonicalLandmark(canonicalGeometry, "pedalRearward", "farPedalContact");
  const local = buildRiderGeometry(frame.landmarks ?? null, farPedal ?? { x: 0, y: 0 });
  if (!local.available) {
    return unavailableRiderGeometry();
  }

  const transformChain = (chain: typeof local.nearArm) => ({
    proximal: toWorldPoint(chain.proximal, frame),
    middle: toWorldPoint(chain.middle, frame),
    distal: toWorldPoint(chain.distal, frame)
  });

  return {
    available: true,
    head: toWorldPoint(local.head, frame),
    shoulder: toWorldPoint(local.shoulder, frame),
    hip: toWorldPoint(local.hip, frame),
    nearArm: transformChain(local.nearArm),
    farArm: transformChain(local.farArm),
    nearLeg: transformChain(local.nearLeg),
    farLeg: transformChain(local.farLeg),
    farLegReachable: local.farLegReachable,
    handContact: toWorldPoint(local.handContact, frame),
    footContact: toWorldPoint(local.footContact, frame)
  };
};

const worldBikeGeometry = (
  canonicalGeometry: CanonicalBikeGeometry,
  frame: WorkbenchFrame
): BikeGeometry =>
  transformCanonicalBikeGeometry(canonicalGeometry, (point) => toWorldPoint(point, frame));

const extentOf = (points: Point2[]): ModelExtent => ({
  minX: Math.min(...points.map((point) => point.x)),
  maxX: Math.max(...points.map((point) => point.x)),
  minY: Math.min(...points.map((point) => point.y)),
  maxY: Math.max(...points.map((point) => point.y))
});

export const modelExtent = (
  scenario: Scenario,
  frame: WorkbenchFrame,
  bike: BikeGeometry,
  rider: ReturnType<typeof worldRiderGeometry>
): ModelExtent => {
  const points: Point2[] = canonicalGeometryPoints(bike);
  if (rider.available) {
    points.push(
      rider.head,
      rider.shoulder,
      rider.hip,
      rider.nearArm.middle,
      rider.nearArm.distal,
      rider.farArm.middle,
      rider.farArm.distal,
      rider.nearLeg.middle,
      rider.nearLeg.distal,
      rider.farLeg.middle,
      rider.farLeg.distal
    );
  }

  // Measure the rig in its own frame; otherwise a spinning bike pumps the follow zoom.
  const cos = Math.cos(frame.pitch);
  const sin = Math.sin(frame.pitch);
  const upright = points.map((point) => {
    const dx = point.x - frame.x;
    const dy = point.y - frame.y;
    return { x: frame.x + dx * cos + dy * sin, y: frame.y - dx * sin + dy * cos };
  });

  if (!rider.available) {
    upright.push({ x: frame.x, y: frame.y + scenario.rider.height });
  }

  return extentOf(upright);
};

/**
 * Bounds of the jump feature itself: approach through the end of the landing
 * slope. The flat rollout is excluded so it cannot dominate the framing.
 */
const jumpExtentOf = (
  scenario: Scenario,
  terrainProfile: TerrainProfile | null
): ModelExtent | null => {
  if (!terrainProfile) return null;
  const endX = terrainProfile.landingStartX + scenario.jump.landingLength;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const segment of terrainProfile.segments) {
    for (const [x, y] of segment.points) {
      if (x > endX) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return Number.isFinite(minX) && maxX > minX ? { minX, maxX, minY, maxY } : null;
};

export const drawWorkbenchStage = (
  canvas: HTMLCanvasElement,
  options: {
    scenario: Scenario;
    frame: WorkbenchFrame;
    baselineFrame: WorkbenchFrame | null;
    frameIndex: number;
    terrainProfile: TerrainProfile | null;
    touchdownFrame: number | null;
    overlays: string[];
    camera: CameraViewState;
    canonicalGeometry: CanonicalBikeGeometry;
    viewOverride?: WorldBounds;
  }
): CameraResolution => {
  const {
    scenario,
    frame,
    baselineFrame,
    frameIndex,
    terrainProfile,
    touchdownFrame,
    overlays,
    camera,
    canonicalGeometry
  } = options;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  const bikeGeometry = worldBikeGeometry(canonicalGeometry, frame);
  const riderGeometry = worldRiderGeometry(frame, canonicalGeometry);
  const resolvedCamera = resolveCameraView({
    frameX: frame.x,
    modelExtent: modelExtent(scenario, frame, bikeGeometry, riderGeometry),
    camera,
    stageWidth: width,
    stageHeight: height,
    jumpExtent: jumpExtentOf(scenario, terrainProfile)
  });
  const cameraResolution = options.viewOverride
    ? { ...resolvedCamera, view: options.viewOverride }
    : resolvedCamera;
  const viewport = createCanvasViewport(width, height, globalThis.devicePixelRatio || 1, {
    ...cameraResolution.view
  });
  const context = configureCanvas(canvas, viewport);
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#303841";
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "#46515d";
  context.lineWidth = 1;
  for (
    let x = Math.ceil(cameraResolution.view.minX / 2) * 2;
    x <= cameraResolution.view.maxX;
    x += 2
  ) {
    const [screenX] = viewport.worldToCss(x, 0);
    context.beginPath();
    context.moveTo(screenX, 0);
    context.lineTo(screenX, height);
    context.stroke();
  }

  if (terrainProfile) {
    const toTerrainScreen = ([x, y]: TerrainPoint) => viewport.worldToCss(x, y);
    context.fillStyle = "#4a4238";
    fillTerrainProfileSegments(context, terrainProfile, toTerrainScreen, height);
    context.strokeStyle = "#dbe3e8";
    context.lineWidth = 3;
    context.lineJoin = "round";
    drawTerrainProfileSegments(context, terrainProfile, toTerrainScreen);
  }

  context.strokeStyle = "#7fc9e8";
  context.lineWidth = 2;
  context.setLineDash([7, 6]);
  context.beginPath();
  for (let step = 0; step <= 36; step += 1) {
    const time = step / 18;
    const x = scenario.entry.speed * time * Math.cos(scenario.jump.lipAngle);
    const y =
      scenario.jump.lipHeight +
      scenario.entry.speed * time * Math.sin(scenario.jump.lipAngle) -
      4.905 * time * time;
    const [screenX, screenY] = viewport.worldToCss(x, y);
    if (step === 0) context.moveTo(screenX, screenY);
    else context.lineTo(screenX, screenY);
  }
  context.stroke();
  context.setLineDash([]);

  if (overlays.includes("baseline") && baselineFrame) {
    context.save();
    context.globalAlpha = 0.4;
    const baselineGeometry = worldBikeGeometry(canonicalGeometry, baselineFrame);
    drawBikeGeometry(context, (point) => viewport.worldToCss(point.x, point.y), baselineGeometry);
    context.restore();
  }

  const [bikeX, bikeY] = viewport.worldToCss(frame.x, frame.y);
  const visibleRiderGeometry = overlays.includes("rider") ? riderGeometry : null;
  const toScreen = (point: Point2) => viewport.worldToCss(point.x, point.y);

  // Far limbs draw before the frame so tubes (notably the top tube) sit in
  // front of them; near limbs draw after so they sit in front of the frame.
  if (visibleRiderGeometry?.available) {
    drawFarRiderLimbs(context, toScreen, visibleRiderGeometry, { lineWidth: 3 });
  }
  drawBikeGeometry(context, toScreen, bikeGeometry);
  if (visibleRiderGeometry?.available) {
    drawNearRiderGeometry(context, toScreen, visibleRiderGeometry, {
      saturated: false,
      lineWidth: 3
    });
  }

  if (touchdownFrame !== null && frameIndex === touchdownFrame) {
    context.fillStyle = "#f4c66a";
    context.strokeStyle = "#f4c66a";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(bikeX, bikeY - 42);
    context.lineTo(bikeX, bikeY - 20);
    context.stroke();
    context.beginPath();
    context.arc(bikeX, bikeY - 48, 6, 0, Math.PI * 2);
    context.fill();
  }

  if (overlays.includes("velocity")) {
    const vectorLength = Math.min(44, viewport.scale * 0.75);
    context.strokeStyle = "#f4c66a";
    context.fillStyle = "#f4c66a";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(bikeX, bikeY);
    context.lineTo(bikeX + vectorLength, bikeY - vectorLength * 0.2);
    context.stroke();
  }

  if (overlays.includes("force")) {
    const forceLength = Math.min(52, viewport.scale);
    context.strokeStyle = "#f08f7f";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(bikeX, bikeY);
    context.lineTo(bikeX, bikeY + forceLength);
    context.stroke();
  }

  if (overlays.includes("com")) {
    const centerOfGravity = bikeGeometry.massProperties.centerOfGravity;
    const [centerX, centerY] = viewport.worldToCss(centerOfGravity.x, centerOfGravity.y);
    context.fillStyle = "#82d28d";
    context.beginPath();
    context.arc(centerX, centerY, 4, 0, Math.PI * 2);
    context.fill();
  }

  if (overlays.includes("torque")) {
    context.strokeStyle = "#b7a9ef";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(bikeX, bikeY, 14, Math.PI * 0.2, Math.PI * 1.6);
    context.stroke();
  }

  if (overlays.includes("suspension")) {
    context.strokeStyle = "#89d3ff";
    context.lineWidth = 3;
    context.beginPath();
    for (const member of bikeGeometry.members.filter(
      (candidate) => candidate.name === "fork" || candidate.name === "rearShock"
    )) {
      const [startX, startY] = toScreen(member.start);
      const [endX, endY] = toScreen(member.end);
      context.moveTo(startX, startY);
      context.lineTo(endX, endY);
    }
    context.stroke();
  }
  return cameraResolution;
};
