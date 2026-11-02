import type { AchievedPoseLandmarks, Point2 } from "../../../../../packages/schema/src/index";

/**
 * One connected limb chain, in bike-local metres, as returned by the physics
 * core. TypeScript never recomputes these points; it only adapts them for
 * drawing (FR-005, FR-006).
 */
export type RiderLimbChain = {
  proximal: Point2;
  middle: Point2;
  distal: Point2;
};

export type RiderGeometry = {
  available: boolean;
  head: Point2;
  shoulder: Point2;
  hip: Point2;
  nearArm: RiderLimbChain;
  farArm: RiderLimbChain;
  nearLeg: RiderLimbChain;
  farLeg: RiderLimbChain;
  farLegReachable: boolean;
  handContact: Point2;
  footContact: Point2;
};

/** Visual-only forward/back separation between the near and far limb pairs. */
const FAR_LIMB_OFFSET_M = 0.035;

const shiftX = (point: Point2, dx: number): Point2 => ({ x: point.x + dx, y: point.y });
const distance = (a: Point2, b: Point2): number => Math.hypot(b.x - a.x, b.y - a.y);

export const canReachFarPedal = (
  landmarks: AchievedPoseLandmarks,
  farPedalContact: Point2
): boolean => {
  const thigh = distance(landmarks.hip, landmarks.knee);
  const shank = distance(landmarks.knee, landmarks.ankle);
  const reach = distance(landmarks.hip, farPedalContact);
  return reach >= Math.abs(thigh - shank) && reach <= thigh + shank;
};

const bendSign = (hip: Point2, knee: Point2, ankle: Point2): number => {
  const cross = (ankle.x - hip.x) * (knee.y - hip.y) - (ankle.y - hip.y) * (knee.x - hip.x);
  return cross >= 0 ? 1 : -1;
};

const reachableTarget = (
  proximal: Point2,
  target: Point2,
  minimum: number,
  maximum: number
): Point2 => {
  const dx = target.x - proximal.x;
  const dy = target.y - proximal.y;
  const distanceToTarget = Math.hypot(dx, dy);
  const boundedDistance = Math.min(maximum, Math.max(minimum, distanceToTarget));
  if (distanceToTarget <= Number.EPSILON) {
    return { x: proximal.x + boundedDistance, y: proximal.y };
  }
  return {
    x: proximal.x + (dx / distanceToTarget) * boundedDistance,
    y: proximal.y + (dy / distanceToTarget) * boundedDistance
  };
};

const twoLinkMiddle = (
  proximal: Point2,
  target: Point2,
  proximalLength: number,
  distalLength: number,
  sign: number
): Point2 => {
  const dx = target.x - proximal.x;
  const dy = target.y - proximal.y;
  const distanceToTarget = Math.hypot(dx, dy);
  const base = Math.atan2(dy, dx);
  const cosOffset = Math.min(
    1,
    Math.max(
      -1,
      (proximalLength ** 2 + distanceToTarget ** 2 - distalLength ** 2) /
        (2 * proximalLength * distanceToTarget)
    )
  );
  const angle = base + sign * Math.acos(cosOffset);
  return {
    x: proximal.x + Math.cos(angle) * proximalLength,
    y: proximal.y + Math.sin(angle) * proximalLength
  };
};

const zeroPoint: Point2 = { x: 0, y: 0 };
const zeroChain: RiderLimbChain = { proximal: zeroPoint, middle: zeroPoint, distal: zeroPoint };

export const unavailableRiderGeometry = (): RiderGeometry => ({
  available: false,
  head: zeroPoint,
  shoulder: zeroPoint,
  hip: zeroPoint,
  nearArm: zeroChain,
  farArm: zeroChain,
  nearLeg: zeroChain,
  farLeg: zeroChain,
  farLegReachable: false,
  handContact: zeroPoint,
  footContact: zeroPoint
});

/**
 * Adapts physics-owned achieved landmarks into one connected rider geometry.
 * Both displayed limb pairs share the same logical joint state (FR-002); the
 * far arm receives a presentation-only offset. The far leg uses the same
 * constrained segment lengths and bends toward the opposite pedal.
 */
export const buildRiderGeometry = (
  landmarks: AchievedPoseLandmarks | null,
  farPedalContact: Point2 | null
): RiderGeometry => {
  if (!landmarks) {
    return unavailableRiderGeometry();
  }

  const nearArm: RiderLimbChain = {
    proximal: landmarks.shoulder,
    middle: landmarks.elbow,
    distal: landmarks.hand
  };
  const nearLeg: RiderLimbChain = {
    proximal: landmarks.hip,
    middle: landmarks.knee,
    distal: landmarks.ankle
  };
  const thigh = distance(nearLeg.proximal, nearLeg.middle);
  const shank = distance(nearLeg.middle, nearLeg.distal);
  const farLegReachable = farPedalContact ? canReachFarPedal(landmarks, farPedalContact) : true;
  const farAnkle = farPedalContact
    ? farLegReachable
      ? farPedalContact
      : reachableTarget(
          nearLeg.proximal,
          farPedalContact,
          Math.abs(thigh - shank) + 1e-6,
          thigh + shank - 1e-6
        )
    : shiftX(nearLeg.distal, -FAR_LIMB_OFFSET_M);
  const farKnee = twoLinkMiddle(
    nearLeg.proximal,
    farAnkle,
    thigh,
    shank,
    bendSign(nearLeg.proximal, nearLeg.middle, nearLeg.distal)
  );

  return {
    available: true,
    head: landmarks.head,
    shoulder: landmarks.shoulder,
    hip: landmarks.hip,
    nearArm,
    nearLeg,
    farLegReachable,
    farArm: {
      proximal: shiftX(nearArm.proximal, -FAR_LIMB_OFFSET_M),
      middle: shiftX(nearArm.middle, -FAR_LIMB_OFFSET_M),
      distal: shiftX(nearArm.distal, -FAR_LIMB_OFFSET_M)
    },
    farLeg: {
      proximal: nearLeg.proximal,
      middle: farKnee,
      distal: farAnkle
    },
    handContact: landmarks.handlebarContact,
    footContact: landmarks.pedalContact
  };
};
