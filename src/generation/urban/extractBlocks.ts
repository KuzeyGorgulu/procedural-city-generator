import {
  canonicalizePolygon,
  canonicalPolygonKey,
  getPolygonBounds,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
  polygonSelfIntersects,
  signedPolygonArea,
} from '../../world/polygonGeometry';
import { sampleTerrain } from '../../world/terrainQueries';
import type {
  CityBlock,
  Point,
  RoadEdgeId,
  RoadGraph,
  TerrainData,
} from '../../world/types';
import type { UrbanGenerationConfig } from './config';

interface HalfEdge {
  readonly key: string;
  readonly edgeId: RoadEdgeId;
  readonly from: string;
  readonly to: string;
  readonly fromPosition: Point;
  readonly toPosition: Point;
  readonly angle: number;
}

export interface RoadFace {
  readonly polygon: readonly Point[];
  readonly boundaryRoadEdgeIds: readonly RoadEdgeId[];
}

function compareNumber(first: number, second: number, epsilon: number): number {
  if (Math.abs(first - second) <= epsilon) return 0;
  return first < second ? -1 : 1;
}

function compareHalfEdges(
  first: HalfEdge,
  second: HalfEdge,
  epsilon: number,
): number {
  return (
    compareNumber(first.angle, second.angle, epsilon) ||
    compareNumber(first.toPosition.y, second.toPosition.y, epsilon) ||
    compareNumber(first.toPosition.x, second.toPosition.x, epsilon) ||
    first.to.localeCompare(second.to) ||
    first.edgeId.localeCompare(second.edgeId) ||
    first.key.localeCompare(second.key)
  );
}

function compareFaceStarts(
  first: HalfEdge,
  second: HalfEdge,
  epsilon: number,
): number {
  return (
    compareNumber(first.fromPosition.y, second.fromPosition.y, epsilon) ||
    compareNumber(first.fromPosition.x, second.fromPosition.x, epsilon) ||
    compareNumber(first.toPosition.y, second.toPosition.y, epsilon) ||
    compareNumber(first.toPosition.x, second.toPosition.x, epsilon) ||
    first.key.localeCompare(second.key)
  );
}

/** Extracts only bounded faces from a planar at-grade road graph. */
export function extractRoadFaces(
  graph: RoadGraph,
  epsilon = 1e-7,
): RoadFace[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, HalfEdge[]>();
  const halfEdges: HalfEdge[] = [];

  for (const edge of graph.edges) {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to || edge.from === edge.to) continue;
    const directions = [
      { from, to, key: `${edge.id}:0` },
      { from: to, to: from, key: `${edge.id}:1` },
    ];
    for (const direction of directions) {
      const halfEdge: HalfEdge = {
        key: direction.key,
        edgeId: edge.id,
        from: direction.from.id,
        to: direction.to.id,
        fromPosition: direction.from.position,
        toPosition: direction.to.position,
        angle: Math.atan2(
          direction.to.position.y - direction.from.position.y,
          direction.to.position.x - direction.from.position.x,
        ),
      };
      halfEdges.push(halfEdge);
      const edges = outgoing.get(halfEdge.from) ?? [];
      edges.push(halfEdge);
      outgoing.set(halfEdge.from, edges);
    }
  }

  for (const edges of outgoing.values()) {
    edges.sort((first, second) => compareHalfEdges(first, second, epsilon));
  }
  halfEdges.sort((first, second) => compareFaceStarts(first, second, epsilon));

  const nextByKey = new Map<string, HalfEdge>();
  for (const halfEdge of halfEdges) {
    const choices = outgoing.get(halfEdge.to) ?? [];
    const reverseIndex = choices.findIndex(
      (candidate) =>
        candidate.edgeId === halfEdge.edgeId && candidate.to === halfEdge.from,
    );
    if (reverseIndex < 0 || choices.length === 0) continue;
    // The clockwise predecessor of the reverse direction keeps the face on
    // the left of the traversed half-edge in the world-coordinate plane.
    nextByKey.set(
      halfEdge.key,
      choices[(reverseIndex - 1 + choices.length) % choices.length],
    );
  }

  const visited = new Set<string>();
  const faceKeys = new Set<string>();
  const faces: RoadFace[] = [];
  for (const start of halfEdges) {
    if (visited.has(start.key)) continue;
    const walk: HalfEdge[] = [];
    const walkKeys = new Set<string>();
    let current: HalfEdge | undefined = start;
    while (current && !walkKeys.has(current.key) && walk.length <= halfEdges.length) {
      walk.push(current);
      walkKeys.add(current.key);
      current = nextByKey.get(current.key);
    }
    for (const traversed of walk) visited.add(traversed.key);
    if (!current || current.key !== start.key || walk.length < 3) continue;

    const rawPolygon = walk.map((halfEdge) => halfEdge.fromPosition);
    if (signedPolygonArea(rawPolygon) <= epsilon) continue;
    const polygon = canonicalizePolygon(rawPolygon, epsilon);
    if (polygon.length < 3 || polygonSelfIntersects(polygon, epsilon)) continue;
    const faceKey = canonicalPolygonKey(polygon);
    if (faceKeys.has(faceKey)) continue;
    faceKeys.add(faceKey);
    faces.push({
      polygon,
      boundaryRoadEdgeIds: [...new Set(walk.map(({ edgeId }) => edgeId))].sort(),
    });
  }
  return faces;
}

function getLandRatio(
  polygon: readonly Point[],
  terrain: TerrainData,
  spacing: number,
  epsilon: number,
): number {
  const bounds = getPolygonBounds(polygon);
  const centroid = polygonCentroid(polygon);
  const points: Point[] = pointInPolygon(centroid, polygon, epsilon)
    ? [centroid]
    : [];
  const firstX = Math.ceil(bounds.minX / spacing) * spacing;
  const firstY = Math.ceil(bounds.minY / spacing) * spacing;
  for (let y = firstY; y <= bounds.maxY + epsilon; y += spacing) {
    for (let x = firstX; x <= bounds.maxX + epsilon; x += spacing) {
      const point = { x, y };
      if (pointInPolygon(point, polygon, epsilon)) points.push(point);
    }
  }
  if (points.length === 0) points.push(polygon[0]);
  let landSamples = 0;
  for (const point of points) {
    if (!sampleTerrain(terrain, point.x, point.y).water) landSamples += 1;
  }
  return landSamples / points.length;
}

interface ValidBlockCandidate extends RoadFace {
  readonly area: number;
  readonly perimeter: number;
  readonly centroid: Point;
  readonly key: string;
}

export function extractBlocks(
  graph: RoadGraph,
  terrain: TerrainData,
  config: UrbanGenerationConfig,
): CityBlock[] {
  const candidates: ValidBlockCandidate[] = [];
  for (const face of extractRoadFaces(graph, config.geometryEpsilon)) {
    const area = polygonArea(face.polygon);
    if (
      !Number.isFinite(area) ||
      area < config.minBlockArea ||
      area > config.maxBlockArea ||
      polygonSelfIntersects(face.polygon, config.geometryEpsilon) ||
      getLandRatio(
        face.polygon,
        terrain,
        config.terrainSampleSpacing,
        config.geometryEpsilon,
      ) < config.minLandRatio
    ) {
      continue;
    }
    candidates.push({
      ...face,
      area,
      perimeter: polygonPerimeter(face.polygon),
      centroid: polygonCentroid(face.polygon),
      key: canonicalPolygonKey(face.polygon),
    });
  }

  candidates.sort(
    (first, second) =>
      compareNumber(first.centroid.y, second.centroid.y, config.geometryEpsilon) ||
      compareNumber(first.centroid.x, second.centroid.x, config.geometryEpsilon) ||
      compareNumber(first.area, second.area, config.geometryEpsilon) ||
      first.key.localeCompare(second.key),
  );
  return candidates.map((candidate, index) => ({
    id: `block-${index.toString().padStart(4, '0')}`,
    polygon: candidate.polygon,
    area: candidate.area,
    perimeter: candidate.perimeter,
    boundaryRoadEdgeIds: candidate.boundaryRoadEdgeIds,
    parcelIds: [],
  }));
}
