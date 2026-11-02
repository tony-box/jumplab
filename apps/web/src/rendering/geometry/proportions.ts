/**
 * Documented, deterministic schematic proportions for bicycle landmarks that
 * have no corresponding physical scenario field (FR-012, FR-013). Every value
 * here is representative display geometry, never a measured physical input,
 * and Pose/Workbench must not expose it as an editable control.
 *
 * Reference: a modern (2020s) size-large 29" trail/enduro hardtail, e.g.
 * reach ~470 mm, stack ~630 mm, head angle ~65 deg, effective seat angle
 * ~76 deg. These figures are representative of current mainstream trail
 * geometry, not any single named model.
 */
export const bikeProportions = {
  /** Bottom-bracket-to-head-tube-top horizontal distance ("reach"), in metres. */
  reachM: 0.47,
  /** Bottom-bracket-to-head-tube-top vertical distance ("stack"), in metres. */
  stackM: 0.63,
  /** Head tube length, in metres. */
  headTubeLengthM: 0.11,
  /** Head tube/fork lean from vertical, in radians (~65 deg from horizontal). */
  headAngleRad: 0.44,
  /** Effective seat tube lean from vertical, in radians (~76 deg from horizontal). */
  seatTubeAngleRad: 0.24,
  /** Bottom-bracket-to-saddle-top distance along the seat tube, in metres. A
   * dropper post lowered for descending/jumping, not a pedaling-height fit. */
  seatTubeLengthM: 0.46,
  /** Fraction of seatTubeLengthM where the top tube/seatstay frame junction
   * sits; the seatpost is the remaining segment up to the saddle. */
  seatTubeFrameJunctionRatio: 0.7,
  /** Representative saddle half-length used to draw its cap, in metres. */
  saddleHalfLengthM: 0.07,
  /** Adult crank arm length, in metres. */
  crankRadiusM: 0.17,
  /** Stem length forward of the head tube top, in metres. */
  stemForwardM: 0.05,
  /** Riser-bar rise above the head tube top, in metres. */
  barRiseM: 0.03,
  /** Representative handlebar cap half-width, in metres. */
  handlebarHalfWidthM: 0.09,
  /** Representative rear-shock strut endpoints relative to the bottom bracket. */
  rearShockTopOffsetM: { x: -0.06, y: 0.26 },
  rearShockBottomOffsetM: { x: -0.2, y: 0.05 }
} as const;
