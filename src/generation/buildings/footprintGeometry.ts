import {
  canonicalizePolygon,
  getPolygonBounds,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonSelfIntersects,
} from '../../world/polygonGeometry';
import { pointDistance } from '../../world/roadGeometry';
import type { Point } from '../../world/types';

function sampleSegment(
  start: Point,
  end: Point,
  spacing: number,
): Point[] {
  const steps = Math.max(1, Math.ceil(pointDistance(start, end) / spacing));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const amount = index / steps;
    return {
      x: start.x + (end.x - start.x) * amount,
      y: start.y + (end.y - start.y) * amount,
    };
  });
}

/** Boundary and interior samples for defensive containment/terrain checks. */
export function getFootprintSamplePoints(
  polygon: readonly Point[],
  spacing: number,
): Point[] {
  if (polygon.length < 3 || !Number.isFinite(spacing) || spacing <= 0) return [];
  const samples: Point[] = [polygonCentroid(polygon)];
  for (let index = 0; index < polygon.length; index += 1) {
    samples.push(
      ...sampleSegment(
        polygon[index],
        polygon[(index + 1) % polygon.length],
        spacing,
      ),
    );
  }

  const bounds = getPolygonBounds(polygon);
  const columns = Math.max(1, Math.ceil(bounds.width / spacing));
  const rows = Math.max(1, Math.ceil(bounds.height / spacing));
  for (let row = 0; row <= rows; row += 1) {
    for (let column = 0; column <= columns; column += 1) {
      const point = {
        x: bounds.minX + (bounds.width * column) / columns,
        y: bounds.minY + (bounds.height * row) / rows,
      };
      if (pointInPolygon(point, polygon)) samples.push(point);
    }
  }
  return samples;
}

export function isValidContainedFootprint(
  candidate: readonly Point[],
  parcel: readonly Point[],
  minimumArea: number,
  spacing: number,
  epsilon = 1e-7,
): boolean {
  const canonical = canonicalizePolygon(candidate, epsilon);
  return (
    canonical.length >= 3 &&
    canonical.every(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    ) &&
    polygonArea(canonical) >= minimumArea &&
    !polygonSelfIntersects(canonical, epsilon) &&
    getFootprintSamplePoints(canonical, spacing).every((point) =>
      pointInPolygon(point, parcel, epsilon),
    )
  );
}
