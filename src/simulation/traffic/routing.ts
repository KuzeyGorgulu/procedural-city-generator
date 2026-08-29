import { pointDistance } from '../../world/roadGeometry';
import type { RoadNodeId } from '../../world/types';
import type {
  TrafficArc,
  TrafficArcId,
  TrafficNetwork,
  TrafficRoute,
} from './types';

const COST_EPSILON = 1e-9;

interface SearchRecord {
  readonly nodeId: RoadNodeId;
  readonly cost: number;
  readonly heuristic: number;
  readonly total: number;
}

function compareRecords(first: SearchRecord, second: SearchRecord): number {
  return (
    first.total - second.total ||
    first.heuristic - second.heuristic ||
    first.nodeId.localeCompare(second.nodeId)
  );
}

class SearchHeap {
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

function heuristic(
  network: TrafficNetwork,
  from: RoadNodeId,
  destination: RoadNodeId,
): number {
  const fromNode = network.nodesById.get(from);
  const destinationNode = network.nodesById.get(destination);
  return fromNode && destinationNode
    ? pointDistance(fromNode.position, destinationNode.position) /
        network.maxNominalSpeed
    : Number.POSITIVE_INFINITY;
}

function buildRoute(
  network: TrafficNetwork,
  originNodeId: RoadNodeId,
  destinationNodeId: RoadNodeId,
  cameFrom: ReadonlyMap<RoadNodeId, TrafficArcId>,
): TrafficRoute | undefined {
  const reversed: TrafficArc[] = [];
  let current = destinationNodeId;
  while (current !== originNodeId && reversed.length <= network.nodesById.size) {
    const arcId = cameFrom.get(current);
    const arc = arcId ? network.arcsById.get(arcId) : undefined;
    if (!arc || arc.to !== current) return undefined;
    reversed.push(arc);
    current = arc.from;
  }
  if (current !== originNodeId) return undefined;
  const arcs = reversed.reverse();
  return {
    originNodeId,
    destinationNodeId,
    arcIds: arcs.map((arc) => arc.id),
    totalLength: arcs.reduce((total, arc) => total + arc.length, 0),
    estimatedTravelTime: arcs.reduce(
      (total, arc) => total + arc.travelTime,
      0,
    ),
  };
}

/** Deterministic travel-time A* over the bidirectional traffic adapter. */
export function findTrafficRoute(
  network: TrafficNetwork,
  originNodeId: RoadNodeId,
  destinationNodeId: RoadNodeId,
): TrafficRoute | undefined {
  if (
    !network.nodesById.has(originNodeId) ||
    !network.nodesById.has(destinationNodeId)
  ) {
    return undefined;
  }
  if (originNodeId === destinationNodeId) {
    return {
      originNodeId,
      destinationNodeId,
      arcIds: [],
      totalLength: 0,
      estimatedTravelTime: 0,
    };
  }

  const costs = new Map<RoadNodeId, number>([[originNodeId, 0]]);
  const cameFrom = new Map<RoadNodeId, TrafficArcId>();
  const open = new SearchHeap();
  const initialHeuristic = heuristic(network, originNodeId, destinationNodeId);
  open.push({
    nodeId: originNodeId,
    cost: 0,
    heuristic: initialHeuristic,
    total: initialHeuristic,
  });

  while (open.size > 0) {
    const current = open.pop();
    if (!current) break;
    if (current.cost > (costs.get(current.nodeId) ?? Infinity) + COST_EPSILON) {
      continue;
    }
    if (current.nodeId === destinationNodeId) {
      return buildRoute(
        network,
        originNodeId,
        destinationNodeId,
        cameFrom,
      );
    }

    for (const arc of network.outgoingArcsByNodeId.get(current.nodeId) ?? []) {
      const tentativeCost = current.cost + arc.travelTime;
      const knownCost = costs.get(arc.to) ?? Number.POSITIVE_INFINITY;
      const knownArcId = cameFrom.get(arc.to);
      const improvesCost = tentativeCost < knownCost - COST_EPSILON;
      const winsTie =
        Math.abs(tentativeCost - knownCost) <= COST_EPSILON &&
        (knownArcId === undefined || arc.id < knownArcId);
      if (!improvesCost && !winsTie) continue;

      const nextHeuristic = heuristic(network, arc.to, destinationNodeId);
      costs.set(arc.to, tentativeCost);
      cameFrom.set(arc.to, arc.id);
      open.push({
        nodeId: arc.to,
        cost: tentativeCost,
        heuristic: nextHeuristic,
        total: tentativeCost + nextHeuristic,
      });
    }
  }

  return undefined;
}
