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
import { refineRoadPath } from './refineRoadPath';
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
  readonly midpoint: Point;
  readonly priority: number;
  readonly key: string;
}

function comparePoints(first: Point, second: Point): number {
  return first.y - second.y || first.x - second.x;
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

export function selectArterialAnchors(
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

  const viableCenter = {
    x:
      candidates.reduce((total, candidate) => total + candidate.point.x, 0) /
      candidates.length,
    y:
      candidates.reduce((total, candidate) => total + candidate.point.y, 0) /
      candidates.length,
  };
  const hub = [...candidates].sort((first, second) => {
    const firstScore =
      pointDistance(first.point, viableCenter) +
      first.slope * config.anchorCandidateStep * 3 +
      first.jitter * config.anchorCandidateStep * 0.35;
    const secondScore =
      pointDistance(second.point, viableCenter) +
      second.slope * config.anchorCandidateStep * 3 +
      second.jitter * config.anchorCandidateStep * 0.35;
    return firstScore - secondScore || comparePoints(first.point, second.point);
  })[0];

  const selected = [hub];
  const remaining = candidates.filter((candidate) => candidate !== hub);
  const usableLeft = bounds.x + config.boundaryMargin;
  const usableTop = bounds.y + config.boundaryMargin;
  const usableWidth = bounds.width - config.boundaryMargin * 2;
  const usableHeight = bounds.height - config.boundaryMargin * 2;
  const regionCandidates = Array.from(
    { length: config.anchorRegionColumns * config.anchorRegionRows },
    (_, regionIndex) => {
      const regionColumn = regionIndex % config.anchorRegionColumns;
      const regionRow = Math.floor(regionIndex / config.anchorRegionColumns);
      const regionCenter = {
        x:
          usableLeft +
          ((regionColumn + 0.5) / config.anchorRegionColumns) * usableWidth,
        y:
          usableTop +
          ((regionRow + 0.5) / config.anchorRegionRows) * usableHeight,
      };
      return [...remaining]
        .filter((candidate) => {
          const candidateColumn = Math.min(
            config.anchorRegionColumns - 1,
            Math.floor(
              ((candidate.point.x - usableLeft) / usableWidth) *
                config.anchorRegionColumns,
            ),
          );
          const candidateRow = Math.min(
            config.anchorRegionRows - 1,
            Math.floor(
              ((candidate.point.y - usableTop) / usableHeight) *
                config.anchorRegionRows,
            ),
          );
          return (
            candidateColumn === regionColumn && candidateRow === regionRow
          );
        })
        .sort((first, second) => {
          const firstScore =
            pointDistance(first.point, regionCenter) +
            first.slope * config.anchorCandidateStep * 2 +
            first.jitter * config.anchorCandidateStep * 0.25;
          const secondScore =
            pointDistance(second.point, regionCenter) +
            second.slope * config.anchorCandidateStep * 2 +
            second.jitter * config.anchorCandidateStep * 0.25;
          return firstScore - secondScore || comparePoints(first.point, second.point);
        })[0];
    },
  ).filter((candidate): candidate is AnchorCandidate => candidate !== undefined);

  for (const candidate of regionCandidates) {
    if (selected.length >= config.arterialAnchorCount) break;
    const separation = Math.min(
      ...selected.map((anchor) => pointDistance(candidate.point, anchor.point)),
    );
    if (separation < config.minimumAnchorSeparation) continue;
    selected.push(candidate);
    remaining.splice(remaining.indexOf(candidate), 1);
  }

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
  morphologyRng: SeededRng,
  config: RoadGenerationConfig,
): void {
  if (anchors.length < 2) return;
  const parents = anchors.map((_, index) => index);
  const findRoot = (index: number): number => {
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const pairs = anchors
    .flatMap((first, firstIndex) =>
      anchors.slice(firstIndex + 1).map((second, offset) => ({
        firstIndex,
        secondIndex: firstIndex + offset + 1,
        distance: pointDistance(first, second),
      })),
    )
    .sort(
      (first, second) =>
        first.distance - second.distance ||
        first.firstIndex - second.firstIndex ||
        first.secondIndex - second.secondIndex,
    );

  for (const pair of pairs) {
    const firstRoot = findRoot(pair.firstIndex);
    const secondRoot = findRoot(pair.secondIndex);
    if (firstRoot === secondRoot) continue;
    const path = findRoadPath(
      terrain,
      bounds,
      anchors[pair.firstIndex],
      anchors[pair.secondIndex],
      config,
      'arterial',
    );
    if (!path) continue;
    const refined = refineRoadPath({
      points: path,
      roadType: 'arterial',
      terrain,
      bounds,
      rng: morphologyRng.fork(
        `anchor-${pair.firstIndex.toString().padStart(2, '0')}-${pair.secondIndex
          .toString()
          .padStart(2, '0')}`,
      ),
      config,
    });
    if (builder.addRoute(refined, 'arterial') === 0) continue;
    parents[secondRoot] = firstRoot;
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
        pairs.push({
          first,
          second,
          midpoint: {
            x: (first.position.x + second.position.x) / 2,
            y: (first.position.y + second.position.y) / 2,
          },
          priority: rng.next(),
          key: `${first.id}/${second.id}`,
        });
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

function takeNextSecondaryPair(
  pairs: SecondaryPair[],
  usedMidpoints: readonly Point[],
  networkCenter: Point,
  config: RoadGenerationConfig,
): SecondaryPair | undefined {
  let bestIndex = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index];
    const coverageScore =
      usedMidpoints.length === 0
        ? -pointDistance(pair.midpoint, networkCenter)
        : Math.min(
            ...usedMidpoints.map((used) => pointDistance(pair.midpoint, used)),
          );
    const score =
      coverageScore + (pair.priority - 0.5) * config.secondaryCoverageJitter;
    if (
      score > bestScore ||
      (score === bestScore &&
        (bestIndex < 0 || pair.key < pairs[bestIndex].key))
    ) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex < 0 ? undefined : pairs.splice(bestIndex, 1)[0];
}

function addSecondaryRoads(
  builder: RoadGraphBuilder,
  terrain: TerrainData,
  bounds: WorldBounds,
  rng: SeededRng,
  config: RoadGenerationConfig,
): void {
  const initialGraph = builder.toRoadGraph();
  const pairs = createSecondaryPairs(
    initialGraph,
    rng.fork('pair-priority-v1'),
    config,
  );
  const usedMidpoints: Point[] = [];
  const networkCenter = {
    x:
      initialGraph.nodes.reduce(
        (total, node) => total + node.position.x,
        0,
      ) / Math.max(1, initialGraph.nodes.length),
    y:
      initialGraph.nodes.reduce(
        (total, node) => total + node.position.y,
        0,
      ) / Math.max(1, initialGraph.nodes.length),
  };
  let completedLoops = 0;
  let attemptedPairs = 0;

  while (
    pairs.length > 0 &&
    completedLoops < config.secondaryLoopCount &&
    attemptedPairs < config.secondaryCandidateAttemptLimit
  ) {
    const pair = takeNextSecondaryPair(
      pairs,
      usedMidpoints,
      networkCenter,
      config,
    );
    if (!pair) break;
    attemptedPairs += 1;
    if (
      usedMidpoints.some(
        (used) =>
          pointDistance(used, pair.midpoint) < config.secondaryLoopSpacing,
      )
    ) {
      continue;
    }

    const deltaX = pair.second.position.x - pair.first.position.x;
    const deltaY = pair.second.position.y - pair.first.position.y;
    const length = Math.hypot(deltaX, deltaY);
    if (length === 0) continue;
    const pairRng = rng.fork(`loop/${pair.key}`);
    const baseSide = pairRng.next() < 0.5 ? -1 : 1;
    const offset = pairRng.float(
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

      const route = refineRoadPath({
        points: [
          ...firstPath,
          ...middlePath.slice(1),
          ...finalPath.slice(1),
        ],
        roadType: 'secondary',
        terrain,
        bounds,
        rng: pairRng.fork(`morphology/side-${side}`),
        config,
      });
      if (builder.addRoute(route, 'secondary') > 0) {
        usedMidpoints.push(pair.midpoint);
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
    rng.fork('anchors-v2'),
    config,
  );
  addArterials(
    builder,
    anchors,
    terrain,
    bounds,
    rng.fork('morphology-v1/arterials'),
    config,
  );
  addSecondaryRoads(
    builder,
    terrain,
    bounds,
    rng.fork('secondary-expansion-v1'),
    config,
  );
  return builder.toRoadGraph();
}
