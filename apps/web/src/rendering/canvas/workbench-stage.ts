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
  /** World centre of mass of the rider body. */
  riderX?: number;
  riderY?: number;
  /** Rider actuator force on the rider (bike-local, N) and torque (N·m). */
  actuatorForceX?: number;
  actuatorForceY?: number;
  actuatorTorque?: number;
  /** True once the run has crashed; the marker stays on from then on. */
  crashed?: boolean;
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

/** Clearance above a standing rider's head kept inside the framed rig. */
const RIDER_HEADROOM_M = 0.05;

/**
 * Fixed outline of the rig used for camera framing: the bike plus a standing rider of the
 * scenario's height. The live rider pose is deliberately left out, or the follow camera zooms
 * and shifts every time the rider compresses or extends (most visibly on landing).
 */
export const modelExtent = (
  scenario: Scenario,
  frame: WorkbenchFrame,
  bike: BikeGeometry,
  _rider?: ReturnType<typeof worldRiderGeometry>
): ModelExtent => {
  const points: Point2[] = canonicalGeometryPoints(bike);
  // Measure the rig in its own frame; otherwise a spinning bike pumps the follow zoom.
  const cos = Math.cos(frame.pitch);
  const sin = Math.sin(frame.pitch);
  const upright = points.map((point) => {
    const dx = point.x - frame.x;
    const dy = point.y - frame.y;
    return { x: frame.x + dx * cos + dy * sin, y: frame.y - dx * sin + dy * cos };
  });

  upright.push({ x: frame.x, y: frame.y + scenario.rider.height + RIDER_HEADROOM_M });

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
    /** World positions of the bike origin over the solved run. */
    trajectory?: readonly Point2[];
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

  const trajectory = options.trajectory ?? [];
  if (overlays.includes("trajectory") && trajectory.length > 1) {
    context.strokeStyle = "#7fc9e8";
    context.lineWidth = 2;
    context.setLineDash([7, 6]);
    context.beginPath();
    trajectory.forEach((point, index) => {
      const [screenX, screenY] = viewport.worldToCss(point.x, point.y);
      if (index === 0) context.moveTo(screenX, screenY);
      else context.lineTo(screenX, screenY);
    });
    context.stroke();
    context.setLineDash([]);
  }

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

  const arrow = (from: Point2, vector: Point2, color: string) => {
    const length = Math.hypot(vector.x, vector.y);
    if (length < 1e-3) return;
    const [startX, startY] = toScreen(from);
    const [endX, endY] = toScreen({ x: from.x + vector.x, y: from.y + vector.y });
    const angle = Math.atan2(endY - startY, endX - startX);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.stroke();
    context.beginPath();
    context.moveTo(endX, endY);
    context.lineTo(endX - 8 * Math.cos(angle - 0.4), endY - 8 * Math.sin(angle - 0.4));
    context.lineTo(endX - 8 * Math.cos(angle + 0.4), endY - 8 * Math.sin(angle + 0.4));
    context.closePath();
    context.fill();
  };
  const bikeCenter = bikeGeometry.massProperties.centerOfGravity;

  if (overlays.includes("velocity") && frame.vx !== undefined && frame.vy !== undefined) {
    // 0.1 s of travel: the arrow ends where the bike will be a tenth of a second later.
    arrow(bikeCenter, { x: frame.vx * 0.1, y: frame.vy * 0.1 }, "#f4c66a");
  }

  if (overlays.includes("force")) {
    // Ground support at each wheel, 1 kN per metre, along the bike's up axis.
    const up = { x: -Math.sin(frame.pitch), y: Math.cos(frame.pitch) };
    for (const [axleName, force] of [
      ["rearAxle", frame.normalForceRear],
      ["frontAxle", frame.normalForceFront]
    ] as const) {
      const axle = canonicalLandmark(canonicalGeometry, axleName, axleName);
      if (!axle || !force) continue;
      const wheelRadius = scenario.bike.wheelSize * 0.0254 * 0.5;
      const contact = toWorldPoint({ x: axle.x, y: axle.y - wheelRadius }, frame);
      arrow(contact, { x: up.x * (force / 1000), y: up.y * (force / 1000) }, "#f08f7f");
    }
    // The rider's push on the bike is the reaction to the actuator force on the rider.
    if (
      frame.riderX !== undefined &&
      frame.riderY !== undefined &&
      frame.actuatorForceX !== undefined &&
      frame.actuatorForceY !== undefined
    ) {
      const cos = Math.cos(frame.pitch);
      const sin = Math.sin(frame.pitch);
      const onBike = {
        x: -(frame.actuatorForceX * cos - frame.actuatorForceY * sin) / 1000,
        y: -(frame.actuatorForceX * sin + frame.actuatorForceY * cos) / 1000
      };
      arrow({ x: frame.riderX, y: frame.riderY }, onBike, "#e8a0d8");
    }
  }
  if (overlays.includes("com")) {
    const centerOfGravity = bikeGeometry.massProperties.centerOfGravity;
    const [centerX, centerY] = viewport.worldToCss(centerOfGravity.x, centerOfGravity.y);
    context.fillStyle = "#82d28d";
    context.beginPath();
    context.arc(centerX, centerY, 4, 0, Math.PI * 2);
    context.fill();
    if (frame.riderX !== undefined && frame.riderY !== undefined) {
      const [riderX, riderY] = viewport.worldToCss(frame.riderX, frame.riderY);
      context.strokeStyle = "#82d28d";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(riderX, riderY, 6, 0, Math.PI * 2);
      context.stroke();
    }
  }

  if (overlays.includes("torque") && frame.actuatorTorque && frame.riderX !== undefined) {
    // Arc sweep shows the rider's twisting effort; a full turn is 400 N·m.
    const [centerX, centerY] = viewport.worldToCss(frame.riderX, frame.riderY ?? 0);
    const sweep = Math.max(-1, Math.min(1, frame.actuatorTorque / 400)) * Math.PI * 1.8;
    context.strokeStyle = "#b7a9ef";
    context.lineWidth = 2;
    context.beginPath();
    // Canvas y points down, so a counter-clockwise torque sweeps toward negative angles.
    context.arc(centerX, centerY, 16, -Math.PI / 2, -Math.PI / 2 - sweep, sweep > 0);
    context.stroke();
  }

  if (frame.crashed) {
    const [crashX, crashY] = toScreen(bikeCenter);
    context.strokeStyle = "#f08f7f";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(crashX - 9, crashY - 9);
    context.lineTo(crashX + 9, crashY + 9);
    context.moveTo(crashX + 9, crashY - 9);
    context.lineTo(crashX - 9, crashY + 9);
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
