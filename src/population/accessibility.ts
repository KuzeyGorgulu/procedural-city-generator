import { buildTrafficNetwork } from '../simulation/traffic/trafficNetwork';
import type { TrafficNetwork } from '../simulation/traffic/types';
import { polygonCentroid } from '../world/polygonGeometry';
import { pointDistance } from '../world/roadGeometry';
import type { BuildingId, RoadNodeId, World } from '../world/types';

export interface PopulationBuildingAccess {
  readonly buildingId: BuildingId;
  readonly accessNodeId: RoadNodeId;
  readonly roadComponentId: string;
}

export interface PopulationAccessIndex {
  readonly trafficNetwork: TrafficNetwork;
  readonly buildingAccessById: ReadonlyMap<BuildingId, PopulationBuildingAccess>;
  readonly roadComponentByNodeId: ReadonlyMap<RoadNodeId, string>;
}

interface TravelRecord {
  readonly nodeId: RoadNodeId;
  readonly cost: number;
}

function compareTravelRecords(first: TravelRecord, second: TravelRecord): number {
  return first.cost - second.cost || first.nodeId.localeCompare(second.nodeId);
}

class TravelHeap {
  readonly #items: TravelRecord[] = [];

  get size(): number {
    return this.#items.length;
  }

  push(record: TravelRecord): void {
    this.#items.push(record);
    let index = this.#items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareTravelRecords(this.#items[parent], this.#items[index]) <= 0) {
        break;
      }
      [this.#items[parent], this.#items[index]] = [
        this.#items[index],
        this.#items[parent],
      ];
      index = parent;
    }
  }

  pop(): TravelRecord | undefined {
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
        compareTravelRecords(this.#items[left], this.#items[smallest]) < 0
      ) {
        smallest = left;
      }
      if (
        right < this.#items.length &&
        compareTravelRecords(this.#items[right], this.#items[smallest]) < 0
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

function buildRoadComponents(network: TrafficNetwork): Map<RoadNodeId, string> {
  const components = new Map<RoadNodeId, string>();
  for (const startNodeId of [...network.nodesById.keys()].sort()) {
    if (components.has(startNodeId)) continue;
    const componentId = `road-component-${startNodeId}`;
    const pending = [startNodeId];
    components.set(startNodeId, componentId);
    for (let index = 0; index < pending.length; index += 1) {
      const nodeId = pending[index];
      for (const arc of network.outgoingArcsByNodeId.get(nodeId) ?? []) {
        if (components.has(arc.to)) continue;
        components.set(arc.to, componentId);
        pending.push(arc.to);
      }
    }
  }
  return components;
}

export function buildPopulationAccessIndex(world: World): PopulationAccessIndex {
  const trafficNetwork = buildTrafficNetwork(world);
  const roadComponentByNodeId = buildRoadComponents(trafficNetwork);
  const edgesById = new Map(world.roads.edges.map((edge) => [edge.id, edge]));
  const buildingAccessById = new Map<BuildingId, PopulationBuildingAccess>();

  for (const building of [...world.urban.buildings].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    const edge = edgesById.get(building.frontageRoadEdgeId);
    const from = edge && trafficNetwork.nodesById.get(edge.from);
    const to = edge && trafficNetwork.nodesById.get(edge.to);
    if (!edge || !from || !to) continue;
    const center = polygonCentroid(building.footprint);
    const fromDistance = pointDistance(center, from.position);
    const toDistance = pointDistance(center, to.position);
    const accessNodeId =
      fromDistance < toDistance ||
      (fromDistance === toDistance && from.id.localeCompare(to.id) <= 0)
        ? from.id
        : to.id;
    const roadComponentId = roadComponentByNodeId.get(accessNodeId);
    if (!roadComponentId) continue;
    buildingAccessById.set(building.id, {
      buildingId: building.id,
      accessNodeId,
      roadComponentId,
    });
  }

  return { trafficNetwork, buildingAccessById, roadComponentByNodeId };
}

/** Exact network travel-time costs without retaining thousands of routes. */
export function getTrafficTravelTimes(
  network: TrafficNetwork,
  originNodeId: RoadNodeId,
): ReadonlyMap<RoadNodeId, number> {
  if (!network.nodesById.has(originNodeId)) return new Map();
  const costs = new Map<RoadNodeId, number>([[originNodeId, 0]]);
  const open = new TravelHeap();
  open.push({ nodeId: originNodeId, cost: 0 });
  while (open.size > 0) {
    const current = open.pop();
    if (!current || current.cost > (costs.get(current.nodeId) ?? Infinity)) {
      continue;
    }
    for (const arc of network.outgoingArcsByNodeId.get(current.nodeId) ?? []) {
      const nextCost = current.cost + arc.travelTime;
      if (nextCost >= (costs.get(arc.to) ?? Infinity)) continue;
      costs.set(arc.to, nextCost);
      open.push({ nodeId: arc.to, cost: nextCost });
    }
  }
  return costs;
}
