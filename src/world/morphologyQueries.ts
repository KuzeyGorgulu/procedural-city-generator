import { polygonCentroid } from './polygonGeometry';
import { findNearestRoad } from './roadQueries';
import { sampleTerrain } from './terrainQueries';
import type { Point, World, WorldBounds } from './types';

export interface MorphologySampleOptions {
  readonly sampleStep: number;
  readonly roadCoverageDistance: number;
  readonly maxViableSlope: number;
  readonly longArterialEdgeThreshold: number;
}

export interface MorphologyStatistics {
  readonly viableLandSampleCount: number;
  readonly viableLandRoadCoverageRatio: number;
  readonly roadExtentRatio: number;
  readonly blockCentroidExtentRatio: number;
  readonly maxArterialEdgeLength: number;
  readonly longArterialEdgeCount: number;
}

export const MORPHOLOGY_SAMPLE_OPTIONS: MorphologySampleOptions = {
  sampleStep: 200,
  roadCoverageDistance: 220,
  maxViableSlope: 0.5,
  longArterialEdgeThreshold: 300,
};

interface PointExtent {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

function getPointExtent(points: readonly Point[]): PointExtent | undefined {
  if (points.length === 0) return undefined;
  return {
    minX: Math.min(...points.map((point) => point.x)),
    minY: Math.min(...points.map((point) => point.y)),
    maxX: Math.max(...points.map((point) => point.x)),
    maxY: Math.max(...points.map((point) => point.y)),
  };
}

function getExtentArea(extent: PointExtent): number {
  return Math.max(0, extent.maxX - extent.minX) *
    Math.max(0, extent.maxY - extent.minY);
}

function getWorldArea(bounds: WorldBounds): number {
  return bounds.width * bounds.height;
}

function sampleViableLand(
  world: World,
  options: MorphologySampleOptions,
): Point[] {
  const points: Point[] = [];
  for (
    let y = world.bounds.y + options.sampleStep / 2;
    y < world.bounds.y + world.bounds.height;
    y += options.sampleStep
  ) {
    for (
      let x = world.bounds.x + options.sampleStep / 2;
      x < world.bounds.x + world.bounds.width;
      x += options.sampleStep
    ) {
      const sample = sampleTerrain(world.terrain, x, y);
      if (!sample.water && sample.slope <= options.maxViableSlope) {
        points.push({ x, y });
      }
    }
  }
  return points;
}

/** Lightweight derived diagnostics; no metric is stored in canonical world data. */
export function getMorphologyStatistics(
  world: World,
  options: MorphologySampleOptions = MORPHOLOGY_SAMPLE_OPTIONS,
): MorphologyStatistics {
  const viableLand = sampleViableLand(world, options);
  const coveredSamples = viableLand.filter(
    (point) =>
      (findNearestRoad(world.roads, point)?.distance ??
        Number.POSITIVE_INFINITY) <= options.roadCoverageDistance,
  ).length;
  const viableExtent = getPointExtent(viableLand);
  const viableArea = viableExtent ? getExtentArea(viableExtent) : 0;
  const referenceArea = viableArea > 0 ? viableArea : getWorldArea(world.bounds);
  const roadExtent = getPointExtent(
    world.roads.nodes.map((node) => node.position),
  );
  const blockExtent = getPointExtent(
    world.urban.blocks.map((block) => polygonCentroid(block.polygon)),
  );
  const arterialLengths = world.roads.edges
    .filter((edge) => edge.type === 'arterial')
    .map((edge) => edge.length);

  return {
    viableLandSampleCount: viableLand.length,
    viableLandRoadCoverageRatio:
      viableLand.length === 0 ? 0 : coveredSamples / viableLand.length,
    roadExtentRatio: roadExtent
      ? Math.min(1, getExtentArea(roadExtent) / referenceArea)
      : 0,
    blockCentroidExtentRatio: blockExtent
      ? Math.min(1, getExtentArea(blockExtent) / referenceArea)
      : 0,
    maxArterialEdgeLength:
      arterialLengths.length === 0 ? 0 : Math.max(...arterialLengths),
    longArterialEdgeCount: arterialLengths.filter(
      (length) => length > options.longArterialEdgeThreshold,
    ).length,
  };
}
