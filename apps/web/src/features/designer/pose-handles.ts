import type { Point2, PoseSample } from "../../../../../packages/schema/src/index";

import { type JointName } from "./pose-sampling";

/**
 * One draggable joint marker. `point` follows the pointer; `pivot` is the
 * parent joint it swings about, so the handle is the exact inverse of one
 * step of the physics-owned bottom-up chain:
 *   knee     = ankle    + shank * (sin knee,  cos knee)
 *   hip      = knee     + thigh * (sin hip,   cos hip)
 *   shoulder = hip      + torso * (sin spine, cos spine)
 */
export type PoseHandle = {
  joint: JointName;
  label: string;
  pivot: Point2;
  point: Point2;
  radius: number;
};

/** Grab distance around a handle, in world metres. */
export const POSE_HANDLE_GRAB_RADIUS_M = 0.1;

const distance = (a: Point2, b: Point2): number => Math.hypot(b.x - a.x, b.y - a.y);

export const poseHandles = (sample: PoseSample | null): PoseHandle[] => {
  if (!sample) {
    return [];
  }

  const { ankle, knee, hip, shoulder } = sample.landmarks;
  return [
    { joint: "knee", label: "Knee", pivot: ankle, point: knee, radius: distance(ankle, knee) },
    { joint: "hip", label: "Hip", pivot: knee, point: hip, radius: distance(knee, hip) },
    { joint: "spine", label: "Spine", pivot: hip, point: shoulder, radius: distance(hip, shoulder) }
  ];
};

/**
 * Joint value that places `handle` under `point`. Angles are measured from
 * the +y axis toward +x, matching the sin/cos order the solver uses.
 */
export const handleTargetFromPoint = (handle: PoseHandle, point: Point2): number =>
  Math.atan2(point.x - handle.pivot.x, point.y - handle.pivot.y);

export const pickPoseHandle = (
  handles: PoseHandle[],
  point: Point2,
  grabRadius = POSE_HANDLE_GRAB_RADIUS_M
): PoseHandle | null => {
  let picked: PoseHandle | null = null;
  let pickedDistance = grabRadius;

  for (const handle of handles) {
    const candidate = distance(handle.point, point);
    if (candidate <= pickedDistance) {
      picked = handle;
      pickedDistance = candidate;
    }
  }

  return picked;
};

/** Sampled arc of every position a handle may occupy across `range`. */
export const handleLimitArc = (
  handle: PoseHandle,
  range: { min: number; max: number },
  segments = 24
): Point2[] =>
  Array.from({ length: segments + 1 }, (_, index) => {
    const angle = range.min + ((range.max - range.min) * index) / segments;
    return {
      x: handle.pivot.x + Math.sin(angle) * handle.radius,
      y: handle.pivot.y + Math.cos(angle) * handle.radius
    };
  });
