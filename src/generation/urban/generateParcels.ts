import type { SeededRng } from '../../core/rng';
import {
  canonicalizePolygon,
  canonicalPolygonKey,
  collinearSegmentOverlapLength,
  getPolygonBounds,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
  polygonSelfIntersects,
} from '../../world/polygonGeometry';
import type { CityBlock, Parcel, Point } from '../../world/types';
import type { UrbanGenerationConfig } from './config';

type Axis = 'x' | 'y';

function clipPolygonAtAxis(
  polygon: readonly Point[],
  axis: Axis,
  splitAt: number,
  keepLower: boolean,
  epsilon: number,
): Point[] {
  const output: Point[] = [];
  const isInside = (point: Point) =>
    keepLower ? point[axis] <= splitAt + epsilon : point[axis] >= splitAt - epsilon;
  const intersection = (start: Point, end: Point): Point => {
    const amount = (splitAt - start[axis]) / (end[axis] - start[axis]);
    return {
      x: start.x + (end.x - start.x) * amount,
      y: start.y + (end.y - start.y) * amount,
    };
  };

  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[(index - 1 + polygon.length) % polygon.length];
    const end = polygon[index];
    const startInside = isInside(start);
    const endInside = isInside(end);
    if (startInside !== endInside) output.push(intersection(start, end));
    if (endInside) output.push(end);
  }
  return canonicalizePolygon(output, epsilon);
}

export function getFrontageEdgeIndices(
  parcelPolygon: readonly Point[],
  blockPolygon: readonly Point[],
  config: Pick<UrbanGenerationConfig, 'geometryEpsilon' | 'minFrontageLength'>,
): number[] {
  const frontage: number[] = [];
  for (let parcelIndex = 0; parcelIndex < parcelPolygon.length; parcelIndex += 1) {
    const start = parcelPolygon[parcelIndex];
    const end = parcelPolygon[(parcelIndex + 1) % parcelPolygon.length];
    let overlap = 0;
    for (let blockIndex = 0; blockIndex < blockPolygon.length; blockIndex += 1) {
      overlap += collinearSegmentOverlapLength(
        start,
        end,
        blockPolygon[blockIndex],
        blockPolygon[(blockIndex + 1) % blockPolygon.length],
        config.geometryEpsilon,
      );
    }
    if (overlap >= config.minFrontageLength) frontage.push(parcelIndex);
  }
  return frontage;
}

function hasUsableShape(
  polygon: readonly Point[],
  config: UrbanGenerationConfig,
): boolean {
  const area = polygonArea(polygon);
  const bounds = getPolygonBounds(polygon);
  const longest = Math.max(bounds.width, bounds.height);
  const aspectRatio = longest === 0 ? 0 : Math.min(bounds.width, bounds.height) / longest;
  return (
    polygon.length >= 3 &&
    Number.isFinite(area) &&
    area >= config.minParcelArea &&
    aspectRatio >= config.minParcelAspectRatio &&
    !polygonSelfIntersects(polygon, config.geometryEpsilon)
  );
}

function isContainedBy(
  candidate: readonly Point[],
  container: readonly Point[],
  epsilon: number,
): boolean {
  for (let index = 0; index < candidate.length; index += 1) {
    const start = candidate[index];
    const end = candidate[(index + 1) % candidate.length];
    for (const amount of [0, 0.25, 0.5, 0.75]) {
      if (
        !pointInPolygon(
          {
            x: start.x + (end.x - start.x) * amount,
            y: start.y + (end.y - start.y) * amount,
          },
          container,
          epsilon,
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

function trySplit(
  polygon: readonly Point[],
  blockPolygon: readonly Point[],
  rng: SeededRng,
  config: UrbanGenerationConfig,
): readonly [Point[], Point[]] | undefined {
  const bounds = getPolygonBounds(polygon);
  const primaryAxis: Axis = bounds.width >= bounds.height ? 'x' : 'y';
  const axes: readonly Axis[] = [primaryAxis, primaryAxis === 'x' ? 'y' : 'x'];
  const jitter = rng.float(-config.splitJitter, config.splitJitter);
  const parentArea = polygonArea(polygon);

  for (const axis of axes) {
    const minimum = axis === 'x' ? bounds.minX : bounds.minY;
    const size = axis === 'x' ? bounds.width : bounds.height;
    if (size <= config.geometryEpsilon) continue;
    const ratios = [
      0.5 + jitter,
      0.5,
      0.42,
      0.58,
      0.35,
      0.65,
      ...polygon.map((point) => (point[axis] - minimum) / size),
    ]
      .filter((ratio) => ratio >= 0.15 && ratio <= 0.85)
      .filter(
        (ratio, index, all) =>
          all.findIndex((candidate) => Math.abs(candidate - ratio) <= 1e-9) === index,
      );
    for (const ratio of ratios) {
      const splitAt = minimum + size * ratio;
      const lower = clipPolygonAtAxis(
        polygon,
        axis,
        splitAt,
        true,
        config.geometryEpsilon,
      );
      const upper = clipPolygonAtAxis(
        polygon,
        axis,
        splitAt,
        false,
        config.geometryEpsilon,
      );
      if (!hasUsableShape(lower, config) || !hasUsableShape(upper, config)) continue;
      const areaDifference = Math.abs(
        polygonArea(lower) + polygonArea(upper) - parentArea,
      );
      if (areaDifference > parentArea * config.areaToleranceRatio) continue;
      if (
        !isContainedBy(lower, polygon, config.geometryEpsilon) ||
        !isContainedBy(upper, polygon, config.geometryEpsilon) ||
        getFrontageEdgeIndices(lower, blockPolygon, config).length === 0 ||
        getFrontageEdgeIndices(upper, blockPolygon, config).length === 0
      ) {
        continue;
      }
      return [lower, upper];
    }
  }
  return undefined;
}

function subdivide(
  polygon: readonly Point[],
  blockPolygon: readonly Point[],
  rootRng: SeededRng,
  targetArea: number,
  config: UrbanGenerationConfig,
  depth: number,
): Point[][] {
  const area = polygonArea(polygon);
  const centroidNeedsRepair = !pointInPolygon(
    polygonCentroid(polygon),
    blockPolygon,
    config.geometryEpsilon,
  );
  if (
    depth >= config.maxSplitDepth ||
    (area <= targetArea && !centroidNeedsRepair) ||
    area < config.minParcelArea * 2
  ) {
    return [[...polygon]];
  }

  const key = canonicalPolygonKey(polygon);
  const split = trySplit(
    polygon,
    blockPolygon,
    rootRng.fork(`split/${depth}/${key}`),
    config,
  );
  if (!split) return [[...polygon]];
  return [
    ...subdivide(split[0], blockPolygon, rootRng, targetArea, config, depth + 1),
    ...subdivide(split[1], blockPolygon, rootRng, targetArea, config, depth + 1),
  ];
}

function compareParcels(
  first: readonly Point[],
  second: readonly Point[],
): number {
  const firstCentroid = polygonCentroid(first);
  const secondCentroid = polygonCentroid(second);
  return (
    firstCentroid.y - secondCentroid.y ||
    firstCentroid.x - secondCentroid.x ||
    polygonArea(first) - polygonArea(second) ||
    canonicalPolygonKey(first).localeCompare(canonicalPolygonKey(second))
  );
}

export function generateParcelsForBlock(
  block: CityBlock,
  rng: SeededRng,
  config: UrbanGenerationConfig,
): Parcel[] {
  const targetArea = rng.fork('target-area').float(
    config.targetParcelAreaMin,
    config.targetParcelAreaMax,
  );
  const polygons = subdivide(
    block.polygon,
    block.polygon,
    rng.fork('subdivision-v1'),
    targetArea,
    config,
    0,
  ).sort(compareParcels);

  if (
    polygons.some(
      (polygon) =>
        !hasUsableShape(polygon, config) ||
        polygonArea(polygon) > config.maxParcelArea ||
        !pointInPolygon(
          polygonCentroid(polygon),
          block.polygon,
          config.geometryEpsilon,
        ) ||
        getFrontageEdgeIndices(polygon, block.polygon, config).length === 0,
    )
  ) {
    return [];
  }

  return polygons.map((polygon, index) => ({
    id: `parcel-${block.id}-${index.toString().padStart(3, '0')}`,
    blockId: block.id,
    polygon,
    area: polygonArea(polygon),
    perimeter: polygonPerimeter(polygon),
    frontageEdgeIndices: getFrontageEdgeIndices(polygon, block.polygon, config),
  }));
}
