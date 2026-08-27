import { pointDistance } from './roadGeometry';
import type { Point } from './types';

export interface PolygonBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

function cross(first: Point, second: Point, third: Point): number {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  );
}

function pointsEqual(first: Point, second: Point, epsilon: number): boolean {
  return pointDistance(first, second) <= epsilon;
}

export function signedPolygonArea(polygon: readonly Point[]): number {
  let doubledArea = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    doubledArea += current.x * next.y - next.x * current.y;
  }
  return doubledArea / 2;
}

export function polygonArea(polygon: readonly Point[]): number {
  return Math.abs(signedPolygonArea(polygon));
}

export function polygonPerimeter(polygon: readonly Point[]): number {
  let perimeter = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    perimeter += pointDistance(polygon[index], polygon[(index + 1) % polygon.length]);
  }
  return perimeter;
}

export function getPolygonBounds(polygon: readonly Point[]): PolygonBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function polygonCentroid(polygon: readonly Point[]): Point {
  const signedArea = signedPolygonArea(polygon);
  if (Math.abs(signedArea) <= Number.EPSILON) {
    const total = polygon.reduce(
      (sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
      { x: 0, y: 0 },
    );
    const divisor = Math.max(1, polygon.length);
    return { x: total.x / divisor, y: total.y / divisor };
  }

  let weightedX = 0;
  let weightedY = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const weight = current.x * next.y - next.x * current.y;
    weightedX += (current.x + next.x) * weight;
    weightedY += (current.y + next.y) * weight;
  }
  const divisor = 6 * signedArea;
  return { x: weightedX / divisor, y: weightedY / divisor };
}

function isRemovableCollinearPoint(
  previous: Point,
  current: Point,
  next: Point,
  epsilon: number,
): boolean {
  const scale = Math.max(
    1,
    pointDistance(previous, current) * pointDistance(current, next),
  );
  if (Math.abs(cross(previous, current, next)) > epsilon * scale) return false;
  return (
    (previous.x - current.x) * (next.x - current.x) +
      (previous.y - current.y) * (next.y - current.y) <=
    epsilon
  );
}

/** Returns a stable positive-area ring with duplicates and collinear bends removed. */
export function canonicalizePolygon(
  input: readonly Point[],
  epsilon = 1e-7,
): Point[] {
  const polygon: Point[] = [];
  for (const point of input) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return [];
    if (!polygon.length || !pointsEqual(polygon[polygon.length - 1], point, epsilon)) {
      polygon.push({ x: point.x, y: point.y });
    }
  }
  if (polygon.length > 1 && pointsEqual(polygon[0], polygon[polygon.length - 1], epsilon)) {
    polygon.pop();
  }

  let changed = true;
  while (changed && polygon.length >= 3) {
    changed = false;
    for (let index = 0; index < polygon.length; index += 1) {
      const previous = polygon[(index - 1 + polygon.length) % polygon.length];
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      if (isRemovableCollinearPoint(previous, current, next, epsilon)) {
        polygon.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  if (polygon.length < 3 || Math.abs(signedPolygonArea(polygon)) <= epsilon) return [];
  if (signedPolygonArea(polygon) < 0) polygon.reverse();

  let startIndex = 0;
  for (let index = 1; index < polygon.length; index += 1) {
    const point = polygon[index];
    const start = polygon[startIndex];
    if (
      point.y < start.y - epsilon ||
      (Math.abs(point.y - start.y) <= epsilon && point.x < start.x - epsilon)
    ) {
      startIndex = index;
    }
  }
  return [...polygon.slice(startIndex), ...polygon.slice(0, startIndex)];
}

export function canonicalPolygonKey(
  polygon: readonly Point[],
  precision = 6,
): string {
  return polygon
    .map((point) => `${point.x.toFixed(precision)},${point.y.toFixed(precision)}`)
    .join('|');
}

export function pointOnSegment(
  point: Point,
  start: Point,
  end: Point,
  epsilon: number,
): boolean {
  const scale = Math.max(1, pointDistance(start, end));
  if (Math.abs(cross(start, end, point)) > epsilon * scale) return false;
  return (
    point.x >= Math.min(start.x, end.x) - epsilon &&
    point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon &&
    point.y <= Math.max(start.y, end.y) + epsilon
  );
}

export function pointOnPolygonBoundary(
  point: Point,
  polygon: readonly Point[],
  epsilon = 1e-7,
): boolean {
  return polygon.some((start, index) =>
    pointOnSegment(point, start, polygon[(index + 1) % polygon.length], epsilon),
  );
}

export function pointInPolygon(
  point: Point,
  polygon: readonly Point[],
  epsilon = 1e-7,
): boolean {
  let inside = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    if (pointOnSegment(point, start, end, epsilon)) return true;
    if (
      (start.y > point.y) !== (end.y > point.y) &&
      point.x <
        ((end.x - start.x) * (point.y - start.y)) / (end.y - start.y) + start.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointStrictlyInPolygon(
  point: Point,
  polygon: readonly Point[],
  epsilon = 1e-7,
): boolean {
  return (
    !pointOnPolygonBoundary(point, polygon, epsilon) &&
    pointInPolygon(point, polygon, epsilon)
  );
}

function orientation(first: Point, second: Point, third: Point, epsilon: number): number {
  const value = cross(first, second, third);
  const scale = Math.max(1, pointDistance(first, second) * pointDistance(second, third));
  if (Math.abs(value) <= epsilon * scale) return 0;
  return value < 0 ? -1 : 1;
}

function segmentsIntersect(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
  epsilon: number,
): boolean {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart, epsilon);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd, epsilon);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart, epsilon);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd, epsilon);
  if (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation) {
    return true;
  }
  return (
    (firstOrientation === 0 && pointOnSegment(secondStart, firstStart, firstEnd, epsilon)) ||
    (secondOrientation === 0 && pointOnSegment(secondEnd, firstStart, firstEnd, epsilon)) ||
    (thirdOrientation === 0 && pointOnSegment(firstStart, secondStart, secondEnd, epsilon)) ||
    (fourthOrientation === 0 && pointOnSegment(firstEnd, secondStart, secondEnd, epsilon))
  );
}

function segmentsProperlyIntersect(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
  epsilon: number,
): boolean {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart, epsilon);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd, epsilon);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart, epsilon);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd, epsilon);
  return (
    firstOrientation * secondOrientation < 0 &&
    thirdOrientation * fourthOrientation < 0
  );
}

export function polygonSelfIntersects(
  polygon: readonly Point[],
  epsilon = 1e-7,
): boolean {
  for (let first = 0; first < polygon.length; first += 1) {
    const firstNext = (first + 1) % polygon.length;
    for (let second = first + 1; second < polygon.length; second += 1) {
      const secondNext = (second + 1) % polygon.length;
      if (
        first === second ||
        firstNext === second ||
        secondNext === first
      ) {
        continue;
      }
      if (
        segmentsIntersect(
          polygon[first],
          polygon[firstNext],
          polygon[second],
          polygon[secondNext],
          epsilon,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

/** True only when polygon interiors overlap; a shared boundary is allowed. */
export function polygonInteriorsOverlap(
  first: readonly Point[],
  second: readonly Point[],
  epsilon = 1e-7,
): boolean {
  if (canonicalPolygonKey(first) === canonicalPolygonKey(second)) return true;
  for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < second.length; secondIndex += 1) {
      if (
        segmentsProperlyIntersect(
          first[firstIndex],
          first[(firstIndex + 1) % first.length],
          second[secondIndex],
          second[(secondIndex + 1) % second.length],
          epsilon,
        )
      ) {
        return true;
      }
    }
  }
  return (
    first.some((point) => pointStrictlyInPolygon(point, second, epsilon)) ||
    second.some((point) => pointStrictlyInPolygon(point, first, epsilon)) ||
    pointStrictlyInPolygon(polygonCentroid(first), second, epsilon) ||
    pointStrictlyInPolygon(polygonCentroid(second), first, epsilon)
  );
}

export function collinearSegmentOverlapLength(
  firstStart: Point,
  firstEnd: Point,
  secondStart: Point,
  secondEnd: Point,
  epsilon = 1e-7,
): number {
  const firstLength = pointDistance(firstStart, firstEnd);
  if (firstLength <= epsilon) return 0;
  const scale = Math.max(1, firstLength);
  if (
    Math.abs(cross(firstStart, firstEnd, secondStart)) > epsilon * scale ||
    Math.abs(cross(firstStart, firstEnd, secondEnd)) > epsilon * scale
  ) {
    return 0;
  }
  const deltaX = firstEnd.x - firstStart.x;
  const deltaY = firstEnd.y - firstStart.y;
  const lengthSquared = deltaX * deltaX + deltaY * deltaY;
  const firstT =
    ((secondStart.x - firstStart.x) * deltaX +
      (secondStart.y - firstStart.y) * deltaY) /
    lengthSquared;
  const secondT =
    ((secondEnd.x - firstStart.x) * deltaX +
      (secondEnd.y - firstStart.y) * deltaY) /
    lengthSquared;
  const overlap = Math.max(
    0,
    Math.min(1, Math.max(firstT, secondT)) - Math.max(0, Math.min(firstT, secondT)),
  );
  return overlap * firstLength;
}
