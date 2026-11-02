import type {
  CanonicalBikeGeometry,
  Point2,
  ProtectedShape
} from "../../../../../packages/schema/src/index";

export type BikeGeometry = CanonicalBikeGeometry;
export type PointTransform = (point: Point2) => Point2;

const transformShape = (shape: ProtectedShape, transform: PointTransform): ProtectedShape => {
  if (shape.shape === "capsule") {
    return { ...shape, start: transform(shape.start), end: transform(shape.end) };
  }
  if (shape.shape === "circle" || shape.shape === "ring") {
    return { ...shape, center: transform(shape.center) };
  }
  return { ...shape, points: shape.points.map(transform) };
};

export const transformCanonicalBikeGeometry = (
  geometry: CanonicalBikeGeometry,
  transform: PointTransform
): CanonicalBikeGeometry => ({
  ...geometry,
  landmarks: Object.fromEntries(
    Object.entries(geometry.landmarks).map(([name, point]) => [name, transform(point)])
  ),
  members: geometry.members.map((member) => ({
    ...member,
    start: transform(member.start),
    end: transform(member.end)
  })),
  protectedShapes: geometry.protectedShapes.map((shape) => transformShape(shape, transform)),
  massProperties: {
    ...geometry.massProperties,
    centerOfGravity: transform(geometry.massProperties.centerOfGravity)
  }
});

export const canonicalGeometryPoints = (geometry: CanonicalBikeGeometry): Point2[] => [
  ...Object.values(geometry.landmarks),
  ...geometry.members.flatMap((member) => [member.start, member.end]),
  ...geometry.protectedShapes.flatMap((shape) => {
    if (shape.shape === "capsule") return [shape.start, shape.end];
    if (shape.shape === "circle" || shape.shape === "ring") return [shape.center];
    return shape.points;
  }),
  geometry.massProperties.centerOfGravity
];

export const canonicalLandmark = (
  geometry: CanonicalBikeGeometry,
  ...names: string[]
): Point2 | null => {
  for (const name of names) {
    const point = geometry.landmarks[name];
    if (point) return point;
  }
  return null;
};
