import type { Point, TerrainData, WorldBounds } from '../../world/types';
import { pointDistance } from '../../world/roadGeometry';
import { sampleTerrain } from '../../world/terrainQueries';

export interface RoadPathSearchOptions {
  readonly terrain: TerrainData;
  readonly bounds: WorldBounds;
  readonly start: Point;
  readonly goal: Point;
  readonly routingStep: number;
  readonly terrainSampleStep: number;
  readonly boundaryMargin: number;
  readonly maxSlope: number;
  readonly slopePenalty: number;
  readonly turnPenalty: number;
  readonly maxSearchStates: number;
}

export interface TerrainTraversalOptions {
  readonly maxSlope: number;
  readonly slopePenalty: number;
  readonly sampleStep: number;
}

interface Direction {
  readonly x: number;
  readonly y: number;
}

interface SearchRecord {
  readonly stateIndex: number;
  readonly cellIndex: number;
  readonly directionIndex: number;
  readonly cost: number;
  readonly heuristic: number;
  readonly total: number;
}

const DIRECTIONS: readonly Direction[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];
const START_DIRECTION = DIRECTIONS.length;
const DIRECTIONS_PER_CELL = DIRECTIONS.length + 1;
const COST_TOLERANCE = 1e-9;

function compareRecords(first: SearchRecord, second: SearchRecord): number {
  return (
    first.total - second.total ||
    first.heuristic - second.heuristic ||
    first.cellIndex - second.cellIndex ||
    first.directionIndex - second.directionIndex
  );
}

class MinHeap {
  readonly #items: SearchRecord[] = [];

  get size(): number {
    return this.#items.length;
  }

  push(record: SearchRecord): void {
    this.#items.push(record);
    let index = this.#items.length - 1;

    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareRecords(this.#items[parent], this.#items[index]) <= 0) break;
      [this.#items[parent], this.#items[index]] = [
        this.#items[index],
        this.#items[parent],
      ];
      index = parent;
    }
  }

  pop(): SearchRecord | undefined {
    const first = this.#items[0];
    const last = this.#items.pop();
    if (!first || !last || this.#items.length === 0) return first;

    this.#items[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (
        left < this.#items.length &&
        compareRecords(this.#items[left], this.#items[smallest]) < 0
      ) {
        smallest = left;
      }
      if (
        right < this.#items.length &&
        compareRecords(this.#items[right], this.#items[smallest]) < 0
      ) {
        smallest = right;
      }
      if (smallest === index) break;
      [this.#items[index], this.#items[smallest]] = [
        this.#items[smallest],
        this.#items[index],
      ];
      index = smallest;
    }

    return first;
  }
}

export function getTerrainTraversalCost(
  terrain: TerrainData,
  start: Point,
  end: Point,
  options: TerrainTraversalOptions,
): number {
  const distance = pointDistance(start, end);
  if (distance === 0) {
    const sample = sampleTerrain(terrain, start.x, start.y);
    return sample.water || sample.slope > options.maxSlope
      ? Number.POSITIVE_INFINITY
      : 0;
  }

  const sampleCount = Math.max(1, Math.ceil(distance / options.sampleStep));
  let squaredSlopeTotal = 0;

  for (let index = 0; index <= sampleCount; index += 1) {
    const amount = index / sampleCount;
    const sample = sampleTerrain(
      terrain,
      start.x + (end.x - start.x) * amount,
      start.y + (end.y - start.y) * amount,
    );
    if (sample.water || sample.slope > options.maxSlope) {
      return Number.POSITIVE_INFINITY;
    }
    squaredSlopeTotal += sample.slope * sample.slope;
  }

  const meanSquaredSlope = squaredSlopeTotal / (sampleCount + 1);
  return distance * (1 + options.slopePenalty * meanSquaredSlope);
}

function getTurnCost(
  previousDirection: number,
  nextDirection: number,
  turnPenalty: number,
): number {
  if (previousDirection === START_DIRECTION) return 0;
  const previous = DIRECTIONS[previousDirection];
  const next = DIRECTIONS[nextDirection];
  const previousLength = Math.hypot(previous.x, previous.y);
  const nextLength = Math.hypot(next.x, next.y);
  const cosine =
    (previous.x * next.x + previous.y * next.y) /
    (previousLength * nextLength);
  return turnPenalty * (1 - cosine);
}

function removeConsecutiveDuplicates(points: readonly Point[]): Point[] {
  return points.filter(
    (point, index) =>
      index === 0 || pointDistance(point, points[index - 1]) > COST_TOLERANCE,
  );
}

export function findTerrainPath(
  options: RoadPathSearchOptions,
): Point[] | undefined {
  const {
    terrain,
    bounds,
    routingStep,
    boundaryMargin,
    maxSlope,
    slopePenalty,
    terrainSampleStep,
  } = options;
  const columns = Math.floor(bounds.width / routingStep) + 1;
  const rows = Math.floor(bounds.height / routingStep) + 1;
  const cellCount = columns * rows;
  const stateCount = cellCount * DIRECTIONS_PER_CELL;
  const traversalOptions: TerrainTraversalOptions = {
    maxSlope,
    slopePenalty,
    sampleStep: terrainSampleStep,
  };

  const pointForCell = (cellIndex: number): Point => ({
    x: bounds.x + (cellIndex % columns) * routingStep,
    y: bounds.y + Math.floor(cellIndex / columns) * routingStep,
  });
  const isInsideRoutingBounds = (point: Point): boolean =>
    point.x >= bounds.x + boundaryMargin &&
    point.x <= bounds.x + bounds.width - boundaryMargin &&
    point.y >= bounds.y + boundaryMargin &&
    point.y <= bounds.y + bounds.height - boundaryMargin;

  const findNearestCell = (point: Point): number | undefined => {
    let nearestIndex: number | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
      const candidate = pointForCell(cellIndex);
      if (!isInsideRoutingBounds(candidate)) continue;
      const connectorCost = getTerrainTraversalCost(
        terrain,
        point,
        candidate,
        traversalOptions,
      );
      if (!Number.isFinite(connectorCost)) continue;
      const distance = pointDistance(point, candidate);
      if (
        distance < nearestDistance - COST_TOLERANCE ||
        (Math.abs(distance - nearestDistance) <= COST_TOLERANCE &&
          (nearestIndex === undefined || cellIndex < nearestIndex))
      ) {
        nearestDistance = distance;
        nearestIndex = cellIndex;
      }
    }

    return nearestIndex;
  };

  const startCell = findNearestCell(options.start);
  const goalCell = findNearestCell(options.goal);
  if (startCell === undefined || goalCell === undefined) return undefined;

  const startState = startCell * DIRECTIONS_PER_CELL + START_DIRECTION;
  const gScore = new Float64Array(stateCount);
  gScore.fill(Number.POSITIVE_INFINITY);
  const cameFrom = new Int32Array(stateCount);
  cameFrom.fill(-1);
  const open = new MinHeap();
  const goalPoint = pointForCell(goalCell);
  const startHeuristic = pointDistance(pointForCell(startCell), goalPoint);
  gScore[startState] = 0;
  open.push({
    stateIndex: startState,
    cellIndex: startCell,
    directionIndex: START_DIRECTION,
    cost: 0,
    heuristic: startHeuristic,
    total: startHeuristic,
  });

  let visitedStates = 0;
  while (open.size > 0 && visitedStates < options.maxSearchStates) {
    const current = open.pop();
    if (!current) break;
    if (current.cost > gScore[current.stateIndex] + COST_TOLERANCE) continue;
    visitedStates += 1;

    if (current.cellIndex === goalCell) {
      const reversedCells: number[] = [];
      let state = current.stateIndex;
      while (state >= 0) {
        reversedCells.push(Math.floor(state / DIRECTIONS_PER_CELL));
        state = cameFrom[state];
      }
      reversedCells.reverse();
      return removeConsecutiveDuplicates([
        options.start,
        ...reversedCells.map(pointForCell),
        options.goal,
      ]);
    }

    const currentColumn = current.cellIndex % columns;
    const currentRow = Math.floor(current.cellIndex / columns);
    const currentPoint = pointForCell(current.cellIndex);

    for (let directionIndex = 0; directionIndex < DIRECTIONS.length; directionIndex += 1) {
      const direction = DIRECTIONS[directionIndex];
      const nextColumn = currentColumn + direction.x;
      const nextRow = currentRow + direction.y;
      if (
        nextColumn < 0 ||
        nextColumn >= columns ||
        nextRow < 0 ||
        nextRow >= rows
      ) {
        continue;
      }

      const nextCell = nextRow * columns + nextColumn;
      const nextPoint = pointForCell(nextCell);
      if (!isInsideRoutingBounds(nextPoint)) continue;
      const terrainCost = getTerrainTraversalCost(
        terrain,
        currentPoint,
        nextPoint,
        traversalOptions,
      );
      if (!Number.isFinite(terrainCost)) continue;

      const nextState = nextCell * DIRECTIONS_PER_CELL + directionIndex;
      const tentativeCost =
        current.cost +
        terrainCost +
        getTurnCost(
          current.directionIndex,
          directionIndex,
          options.turnPenalty,
        );
      const knownCost = gScore[nextState];
      const knownParent = cameFrom[nextState];
      const improvesCost = tentativeCost < knownCost - COST_TOLERANCE;
      const winsTie =
        Math.abs(tentativeCost - knownCost) <= COST_TOLERANCE &&
        (knownParent < 0 || current.stateIndex < knownParent);
      if (!improvesCost && !winsTie) continue;

      const heuristic = pointDistance(nextPoint, goalPoint);
      gScore[nextState] = tentativeCost;
      cameFrom[nextState] = current.stateIndex;
      open.push({
        stateIndex: nextState,
        cellIndex: nextCell,
        directionIndex,
        cost: tentativeCost,
        heuristic,
        total: tentativeCost + heuristic,
      });
    }
  }

  return undefined;
}
