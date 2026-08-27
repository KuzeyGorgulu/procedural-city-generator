import type { SeededRng } from '../../core/rng';
import { pointDistance } from '../../world/roadGeometry';
import { sampleTerrain } from '../../world/terrainQueries';
import type {
  Point,
  RoadGraph,
  TerrainData,
  WorldBounds,
} from '../../world/types';
import type { RoadGenerationConfig } from './config';
import { findTerrainPath } from './pathfinder';
import { RoadGraphBuilder } from './roadGraphBuilder';

export interface GenerateRoadsInput {
  readonly bounds: WorldBounds;
  readonly terrain: TerrainData;
  readonly rng: SeededRng;
  readonly config: RoadGenerationConfig;
}

interface AnchorCandidate {
  readonly point: Point;
  readonly slope: number;
  readonly jitter: number;
}

interface SecondaryAttachment {
  readonly id: string;
  readonly position: Point;
}

interface SecondaryPair {
  readonly first: SecondaryAttachment;
  readonly second: SecondaryAttachment;
  readonly priority: number;
}

function comparePoints(first: Point, second: Point): number {
  return first.y - second.y || first.x - second.x;
}

function simplifyCollinear(points: readonly Point[]): Point[] {
  if (points.length <= 2) return [...points];
  const simplified: Point[] = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const firstX = current.x - previous.x;
    const firstY = current.y - previous.y;
    const secondX = next.x - current.x;
    const secondY = next.y - current.y;
    const cross = firstX * secondY - firstY * secondX;
    const dot = firstX * secondX + firstY * secondY;
    if (Math.abs(cross) > 1e-9 || dot <= 0) simplified.push(current);
  }

  simplified.push(points[points.length - 1]);
  return simplified;
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

function isViableAnchor(
  terrain: TerrainData,
  point: Point,
  maxSlope: number,
): boolean {
  const sample = sampleTerrain(terrain, point.x, point.y);
  return !sample.water && sample.slope <= maxSlope;
}

function selectArterialAnchors(
  bounds: WorldBounds,
  terrain: TerrainData,
  rng: SeededRng,
  config: RoadGenerationConfig,
): Point[] {
  const candidates: AnchorCandidate[] = [];
  for (
    let y = bounds.y + config.boundaryMargin;
    y <= bounds.y + bounds.height - config.boundaryMargin;
    y += config.anchorCandidateStep
  ) {
    for (
      let x = bounds.x + config.boundaryMargin;
      x <= bounds.x + bounds.width - config.boundaryMargin;
      x += config.anchorCandidateStep
    ) {
      const point = { x, y };
      const sample = sampleTerrain(terrain, x, y);
      if (!sample.water && sample.slope <= config.anchorMaxSlope) {
        candidates.push({ point, slope: sample.slope, jitter: rng.next() });
      }
    }
  }
  if (candidates.length === 0) return [];

  const worldCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const hub = [...candidates].sort((first, second) => {
    const firstScore =
      pointDistance(first.point, worldCenter) +
      first.slope * config.anchorCandidateStep * 3 +
      first.jitter * config.anchorCandidateStep * 0.35;
    const secondScore =
      pointDistance(second.point, worldCenter) +
      second.slope * config.anchorCandidateStep * 3 +
      second.jitter * config.anchorCandidateStep * 0.35;
    return firstScore - secondScore || comparePoints(first.point, second.point);
  })[0];

  const selected = [hub];
  const remaining = candidates.filter((candidate) => candidate !== hub);
  while (
    selected.length < config.arterialAnchorCount &&
    remaining.length > 0
  ) {
    let bestIndex = -1;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const separation = Math.min(
        ...selected.map((anchor) => pointDistance(candidate.point, anchor.point)),
      );
      if (separation < config.minimumAnchorSeparation) continue;
      const score =
        separation -
        candidate.slope * config.anchorCandidateStep * 3 +
        (candidate.jitter - 0.5) * config.anchorCandidateStep;
      if (
        score > bestScore ||
        (score === bestScore &&
          (bestIndex < 0 ||
            comparePoints(candidate.point, remaining[bestIndex].point) < 0))
      ) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) break;
    selected.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }

  return selected.map((candidate) => candidate.point);
}

function findRoadPath(
  terrain: TerrainData,
  bounds: WorldBounds,
  start: Point,
  goal: Point,
  config: RoadGenerationConfig,
  roadType: 'arterial' | 'secondary',
): Point[] | undefined {
  return findTerrainPath({
    terrain,
    bounds,
    start,
    goal,
    routingStep: config.routingStep,
    terrainSampleStep: config.terrainSampleStep,
    boundaryMargin: config.boundaryMargin,
    maxSlope: config.maxRoadSlope,
    slopePenalty:
      roadType === 'arterial'
        ? config.arterialSlopePenalty
        : config.secondarySlopePenalty,
    turnPenalty:
      roadType === 'arterial'
        ? config.arterialTurnPenalty
        : config.secondaryTurnPenalty,
    maxSearchStates: config.maxSearchStates,
  });
}

function addArterials(
  builder: RoadGraphBuilder,
  anchors: readonly Point[],
  terrain: TerrainData,
  bounds: WorldBounds,
  config: RoadGenerationConfig,
): void {
  if (anchors.length < 2) return;
  const connectedAnchors = [anchors[0]];

  for (const anchor of anchors.slice(1)) {
    const connectionTargets = [...connectedAnchors].sort(
      (first, second) =>
        pointDistance(anchor, first) - pointDistance(anchor, second) ||
        comparePoints(first, second),
    );
    for (const target of connectionTargets) {
      const path = findRoadPath(
        terrain,
        bounds,
        anchor,
        target,
        config,
        'arterial',
      );
      if (!path) continue;
      builder.addRoute(simplifyCollinear(path), 'arterial');
      connectedAnchors.push(anchor);
      break;
    }
  }
}

function roundToRoutingGrid(
  point: Point,
  bounds: WorldBounds,
  routingStep: number,
): Point {
  return {
    x:
      bounds.x +
      Math.round((point.x - bounds.x) / routingStep) * routingStep,
    y:
      bounds.y +
      Math.round((point.y - bounds.y) / routingStep) * routingStep,
  };
}

function createSecondaryPairs(
  graph: RoadGraph,
  rng: SeededRng,
  config: RoadGenerationConfig,
): SecondaryPair[] {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const arterialNodeIds = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.type === 'arterial') {
      arterialNodeIds.add(edge.from);
      arterialNodeIds.add(edge.to);
    }
  }
  const attachments: SecondaryAttachment[] = graph.nodes
    .filter((node) => arterialNodeIds.has(node.id))
    .map((node) => ({ id: node.id, position: node.position }));
  const attachmentKeys = new Set(
    attachments.map(
      ({ position }) => `${position.x.toFixed(6)},${position.y.toFixed(6)}`,
    ),
  );

  for (const edge of graph.edges) {
    if (edge.type !== 'arterial') continue;
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) continue;
    const segmentCount = Math.floor(
      edge.length / config.secondaryAttachmentSpacing,
    );
    for (let index = 1; index <= segmentCount; index += 1) {
      const amount = index / (segmentCount + 1);
      const position = {
        x: from.position.x + (to.position.x - from.position.x) * amount,
        y: from.position.y + (to.position.y - from.position.y) * amount,
      };
      const key = `${position.x.toFixed(6)},${position.y.toFixed(6)}`;
      if (attachmentKeys.has(key)) continue;
      attachmentKeys.add(key);
      attachments.push({ id: `attachment-${edge.id}-${index}`, position });
    }
  }

  const pairs: SecondaryPair[] = [];

  for (let firstIndex = 0; firstIndex < attachments.length; firstIndex += 1) {
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < attachments.length;
      secondIndex += 1
    ) {
      const first = attachments[firstIndex];
      const second = attachments[secondIndex];
      const distance = pointDistance(first.position, second.position);
      if (
        distance >= config.secondaryPairMinDistance &&
        distance <= config.secondaryPairMaxDistance
      ) {
        pairs.push({ first, second, priority: rng.next() });
      }
    }
  }

  return pairs.sort((first, second) => {
    if (first.priority !== second.priority) return first.priority - second.priority;
    if (first.first.id !== second.first.id) {
      return first.first.id < second.first.id ? -1 : 1;
    }
    if (first.second.id === second.second.id) return 0;
    return first.second.id < second.second.id ? -1 : 1;
  });
}

function addSecondaryRoads(
  builder: RoadGraphBuilder,
  terrain: TerrainData,
  bounds: WorldBounds,
  rng: SeededRng,
  config: RoadGenerationConfig,
): void {
  const initialGraph = builder.toRoadGraph();
  const pairs = createSecondaryPairs(initialGraph, rng, config);
  const usedMidpoints: Point[] = [];
  let completedLoops = 0;

  for (const pair of pairs) {
    if (completedLoops >= config.secondaryLoopCount) break;
    const midpoint = {
      x: (pair.first.position.x + pair.second.position.x) / 2,
      y: (pair.first.position.y + pair.second.position.y) / 2,
    };
    if (
      usedMidpoints.some(
        (used) => pointDistance(used, midpoint) < config.secondaryLoopSpacing,
      )
    ) {
      continue;
    }

    const deltaX = pair.second.position.x - pair.first.position.x;
    const deltaY = pair.second.position.y - pair.first.position.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length === 0) continue;
    const baseSide = rng.next() < 0.5 ? -1 : 1;
    const offset = rng.float(
      config.secondaryOffsetMin,
      config.secondaryOffsetMax,
    );

    let added = false;
    for (const side of [baseSide, -baseSide]) {
      const offsetX = (-deltaY / length) * offset * side;
      const offsetY = (deltaX / length) * offset * side;
      const firstWaypoint = roundToRoutingGrid(
        {
          x: pair.first.position.x + offsetX,
          y: pair.first.position.y + offsetY,
        },
        bounds,
        config.routingStep,
      );
      const secondWaypoint = roundToRoutingGrid(
        {
          x: pair.second.position.x + offsetX,
          y: pair.second.position.y + offsetY,
        },
        bounds,
        config.routingStep,
      );
      if (
        !isInsideMargin(firstWaypoint, bounds, config.boundaryMargin) ||
        !isInsideMargin(secondWaypoint, bounds, config.boundaryMargin) ||
        !isViableAnchor(terrain, firstWaypoint, config.anchorMaxSlope) ||
        !isViableAnchor(terrain, secondWaypoint, config.anchorMaxSlope)
      ) {
        continue;
      }

      const firstPath = findRoadPath(
        terrain,
        bounds,
        pair.first.position,
        firstWaypoint,
        config,
        'secondary',
      );
      const middlePath = findRoadPath(
        terrain,
        bounds,
        firstWaypoint,
        secondWaypoint,
        config,
        'secondary',
      );
      const finalPath = findRoadPath(
        terrain,
        bounds,
        secondWaypoint,
        pair.second.position,
        config,
        'secondary',
      );
      if (!firstPath || !middlePath || !finalPath) continue;

      const route = simplifyCollinear([
        ...firstPath,
        ...middlePath.slice(1),
        ...finalPath.slice(1),
      ]);
      if (builder.addRoute(route, 'secondary') > 0) {
        usedMidpoints.push(midpoint);
        completedLoops += 1;
        added = true;
        break;
      }
    }
    if (added) continue;
  }
}

export function generateRoads({
  bounds,
  terrain,
  rng,
  config,
}: GenerateRoadsInput): RoadGraph {
  const builder = new RoadGraphBuilder(config);
  const anchors = selectArterialAnchors(
    bounds,
    terrain,
    rng.fork('arterial-v1'),
    config,
  );
  addArterials(builder, anchors, terrain, bounds, config);
  addSecondaryRoads(
    builder,
    terrain,
    bounds,
    rng.fork('secondary-v1'),
    config,
  );
  return builder.toRoadGraph();
}
