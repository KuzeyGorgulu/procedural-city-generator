import type { SeededRng } from '../../core/rng';
import { pointDistance } from '../../world/roadGeometry';
import type { Point, RoadType, TerrainData, WorldBounds } from '../../world/types';
import type { RoadGenerationConfig } from './config';
import { getTerrainTraversalCost } from './pathfinder';

const GEOMETRY_EPSILON = 1e-9;

export interface RefineRoadPathInput {
  readonly points: readonly Point[];
  readonly roadType: RoadType;
  readonly terrain: TerrainData;
  readonly bounds: WorldBounds;
  readonly rng: SeededRng;
  readonly config: RoadGenerationConfig;
}

function isInsideMargin(
  point: Point,
  bounds: WorldBounds,
  margin: number,
): boolean {
  return (
    point.x >= bounds.x + margin &&
    point.x <= bounds.x + bounds.width - margin &&
    point.y >= bounds.y + margin &&
    point.y <= bounds.y + bounds.height - margin
  );
}

function removeConsecutiveDuplicates(points: readonly Point[]): Point[] {
  return points.filter(
    (point, index) =>
      index === 0 || pointDistance(point, points[index - 1]) > GEOMETRY_EPSILON,
  );
}

export function simplifyCollinear(points: readonly Point[]): Point[] {
  const unique = removeConsecutiveDuplicates(points);
  if (unique.length <= 2) return unique;
  const simplified: Point[] = [unique[0]];

  for (let index = 1; index < unique.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = unique[index];
    const next = unique[index + 1];
    const firstX = current.x - previous.x;
    const firstY = current.y - previous.y;
    const secondX = next.x - current.x;
    const secondY = next.y - current.y;
    const cross = firstX * secondY - firstY * secondX;
    const dot = firstX * secondX + firstY * secondY;
    if (Math.abs(cross) > GEOMETRY_EPSILON || dot <= 0) simplified.push(current);
  }

  simplified.push(unique[unique.length - 1]);
  return simplified;
}

function getRoadSettings(roadType: RoadType, config: RoadGenerationConfig) {
  return roadType === 'arterial'
    ? {
        cornerRadius: config.arterialCornerRadius,
        curveMinLength: config.arterialCurveMinLength,
        curveOffset: config.arterialCurveOffset,
        slopePenalty: config.arterialSlopePenalty,
      }
    : {
        cornerRadius: config.secondaryCornerRadius,
        curveMinLength: config.secondaryCurveMinLength,
        curveOffset: config.secondaryCurveOffset,
        slopePenalty: config.secondarySlopePenalty,
      };
}

function isPathPassable(
  points: readonly Point[],
  terrain: TerrainData,
  bounds: WorldBounds,
  config: RoadGenerationConfig,
  slopePenalty: number,
): boolean {
  if (
    points.some(
      (point) => !isInsideMargin(point, bounds, config.boundaryMargin),
    )
  ) {
    return false;
  }

  for (let index = 1; index < points.length; index += 1) {
    const cost = getTerrainTraversalCost(terrain, points[index - 1], points[index], {
      maxSlope: config.maxRoadSlope,
      slopePenalty,
      sampleStep: config.terrainSampleStep,
    });
    if (!Number.isFinite(cost)) return false;
  }
  return true;
}

function quadraticPoint(
  start: Point,
  control: Point,
  end: Point,
  amount: number,
): Point {
  const inverse = 1 - amount;
  return {
    x:
      inverse * inverse * start.x +
      2 * inverse * amount * control.x +
      amount * amount * end.x,
    y:
      inverse * inverse * start.y +
      2 * inverse * amount * control.y +
      amount * amount * end.y,
  };
}

function roundCorners(
  points: readonly Point[],
  terrain: TerrainData,
  bounds: WorldBounds,
  config: RoadGenerationConfig,
  cornerRadius: number,
  slopePenalty: number,
): Point[] {
  if (points.length <= 2 || cornerRadius <= 0) return [...points];
  const rounded: Point[] = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const incomingLength = pointDistance(previous, corner);
    const outgoingLength = pointDistance(corner, next);
    if (incomingLength <= GEOMETRY_EPSILON || outgoingLength <= GEOMETRY_EPSILON) {
      continue;
    }

    const trim = Math.min(
      cornerRadius,
      incomingLength * 0.32,
      outgoingLength * 0.32,
    );
    const before = {
      x: corner.x + ((previous.x - corner.x) / incomingLength) * trim,
      y: corner.y + ((previous.y - corner.y) / incomingLength) * trim,
    };
    const after = {
      x: corner.x + ((next.x - corner.x) / outgoingLength) * trim,
      y: corner.y + ((next.y - corner.y) / outgoingLength) * trim,
    };
    const curve = Array.from(
      { length: config.cornerSampleCount },
      (_, sampleIndex) =>
        quadraticPoint(
          before,
          corner,
          after,
          (sampleIndex + 1) / (config.cornerSampleCount + 1),
        ),
    );
    const candidate = [previous, before, ...curve, after, next];

    if (isPathPassable(candidate, terrain, bounds, config, slopePenalty)) {
      rounded.push(before, ...curve, after);
    } else {
      rounded.push(corner);
    }
  }

  rounded.push(points[points.length - 1]);
  return removeConsecutiveDuplicates(rounded);
}

function shapedSegment(
  start: Point,
  end: Point,
  sectionCount: number,
  offset: number,
): Point[] {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  const normalX = -deltaY / length;
  const normalY = deltaX / length;
  const points = [start];
  for (let index = 1; index < sectionCount; index += 1) {
    const amount = index / sectionCount;
    const lateral = Math.sin(Math.PI * amount) * offset;
    points.push({
      x: start.x + deltaX * amount + normalX * lateral,
      y: start.y + deltaY * amount + normalY * lateral,
    });
  }
  points.push(end);
  return points;
}

function refineLongSegments(
  points: readonly Point[],
  terrain: TerrainData,
  bounds: WorldBounds,
  rng: SeededRng,
  config: RoadGenerationConfig,
  curveMinLength: number,
  curveOffset: number,
  slopePenalty: number,
): Point[] {
  const refined: Point[] = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const length = pointDistance(start, end);
    const sectionCount = Math.max(
      1,
      Math.ceil(length / (config.maxStraightEdgeLength * 0.8)),
    );
    if (sectionCount === 1) {
      refined.push(end);
      continue;
    }

    const segmentRng = rng.fork(`segment-${index.toString().padStart(3, '0')}`);
    const magnitude = curveOffset * (0.68 + segmentRng.next() * 0.32);
    const preferredSign = segmentRng.next() < 0.5 ? -1 : 1;
    const offsets =
      length >= curveMinLength
        ? [
            magnitude * preferredSign,
            -magnitude * preferredSign,
            magnitude * preferredSign * 0.5,
            -magnitude * preferredSign * 0.5,
          ]
        : [];
    const shaped = offsets
      .map((offset) => shapedSegment(start, end, sectionCount, offset))
      .find((candidate) =>
        isPathPassable(candidate, terrain, bounds, config, slopePenalty),
      );
    const segment = shaped ?? shapedSegment(start, end, sectionCount, 0);
    refined.push(...segment.slice(1));
  }

  return removeConsecutiveDuplicates(refined);
}

/**
 * Refines canonical route geometry without changing its endpoints. All new
 * chords are terrain-validated before they become graph edges.
 */
export function refineRoadPath({
  points,
  roadType,
  terrain,
  bounds,
  rng,
  config,
}: RefineRoadPathInput): Point[] {
  const simplified = simplifyCollinear(points);
  if (simplified.length <= 1) return simplified;
  const settings = getRoadSettings(roadType, config);
  const rounded = roundCorners(
    simplified,
    terrain,
    bounds,
    config,
    settings.cornerRadius,
    settings.slopePenalty,
  );
  return refineLongSegments(
    rounded,
    terrain,
    bounds,
    rng,
    config,
    settings.curveMinLength,
    settings.curveOffset,
    settings.slopePenalty,
  );
}
