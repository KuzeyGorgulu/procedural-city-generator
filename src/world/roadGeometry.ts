import type { Point } from './types';

export interface PointProjection {
  readonly point: Point;
  readonly distance: number;
  readonly t: number;
}

export interface SegmentIntersection {
  readonly point: Point;
  readonly firstT: number;
  readonly secondT: number;
}

export function pointDistance(first: Point, second: Point): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function projectPointToSegment(
  point: Point,
  start: Point,
  end: Point,
): PointProjection {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const unclampedT =
    lengthSquared === 0
      ? 0
      : ((point.x - start.x) * deltaX + (point.y - start.y) * deltaY) /
        lengthSquared;
  const t = Math.min(1, Math.max(0, unclampedT));
  const projection = {
    x: start.x + deltaX * t,
    y: start.y + deltaY * t,
  };

  return {
    point: projection,
    distance: pointDistance(point, projection),
    t,
  };
}

export function intersectSegments(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
  tolerance = 1e-9,
): SegmentIntersection | null {
  const firstX = firstEnd.x - firstStart.x;
  const firstY = firstEnd.y - firstStart.y;
  const secondX = secondEnd.x - secondStart.x;
  const secondY = secondEnd.y - secondStart.y;
  const denominator = firstX * secondY - firstY * secondX;

  if (Math.abs(denominator) <= tolerance) return null;

  const offsetX = secondStart.x - firstStart.x;
  const offsetY = secondStart.y - firstStart.y;
  const firstT = (offsetX * secondY - offsetY * secondX) / denominator;
  const secondT = (offsetX * firstY - offsetY * firstX) / denominator;

  if (
    firstT < -tolerance ||
    firstT > 1 + tolerance ||
    secondT < -tolerance ||
    secondT > 1 + tolerance
  ) {
    return null;
  }

  const clampedFirstT = Math.min(1, Math.max(0, firstT));
  return {
    point: {
      x: firstStart.x + firstX * clampedFirstT,
      y: firstStart.y + firstY * clampedFirstT,
    },
    firstT: clampedFirstT,
    secondT: Math.min(1, Math.max(0, secondT)),
  };
}
