import type { CanonicalBikeGeometry } from "../../../../packages/schema/src/index";

export const canonicalBikeGeometry = (): CanonicalBikeGeometry => ({
  modelVersion: 1,
  valid: true,
  issues: [],
  closureResidual: 0.004,
  landmarks: {
    rearAxle: { x: -0.625, y: 0.3683 },
    frontAxle: { x: 0.625, y: 0.3683 },
    bottomBracket: { x: -0.19, y: 0.33 },
    pedalForward: { x: -0.02, y: 0.33 },
    pedalRearward: { x: -0.36, y: 0.33 },
    handlebarContact: { x: 0.33, y: 0.99 }
  },
  members: [
    {
      name: "chainstay",
      start: { x: -0.625, y: 0.3683 },
      end: { x: -0.19, y: 0.33 }
    }
  ],
  protectedShapes: [
    {
      part: "rearTire",
      contactSurface: "none",
      shape: "ring",
      center: { x: -0.625, y: 0.3683 },
      innerRadius: 0.33,
      outerRadius: 0.3683
    },
    {
      part: "frontTire",
      contactSurface: "none",
      shape: "ring",
      center: { x: 0.625, y: 0.3683 },
      innerRadius: 0.33,
      outerRadius: 0.3683
    }
  ],
  massProperties: {
    totalMass: 14,
    centerOfGravity: { x: -0.03, y: 0.51 },
    planarInertia: 2.8,
    distributionVersion: 1
  }
});
