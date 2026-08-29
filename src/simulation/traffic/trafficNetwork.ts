import { polygonCentroid } from '../../world/polygonGeometry';
import type {
  RoadEdge,
  RoadNodeId,
  World,
} from '../../world/types';
import type { TrafficSimulationConfig } from './config';
import { TRAFFIC_CONFIG } from './config';
import type { TrafficArc, TrafficNetwork } from './types';

function createArc(
  edge: RoadEdge,
  direction: 'forward' | 'reverse',
  config: TrafficSimulationConfig,
): TrafficArc {
  const nominalSpeed = config.nominalSpeedByRoadType[edge.type];
  return {
    id: `${edge.id}:${direction}`,
    sourceEdgeId: edge.id,
    from: direction === 'forward' ? edge.from : edge.to,
    to: direction === 'forward' ? edge.to : edge.from,
    direction,
    roadType: edge.type,
    length: edge.length,
    nominalSpeed,
    travelTime: edge.length / nominalSpeed,
  };
}

function getDevelopedNodeIds(
  world: World,
  validNodeIds: ReadonlySet<RoadNodeId>,
): RoadNodeId[] {
  const edgesById = new Map(world.roads.edges.map((edge) => [edge.id, edge]));
  const developed = new Set<RoadNodeId>();
  const blocks = [...world.urban.blocks].sort((first, second) => {
    const firstCentroid = polygonCentroid(first.polygon);
    const secondCentroid = polygonCentroid(second.polygon);
    return (
      firstCentroid.y - secondCentroid.y ||
      firstCentroid.x - secondCentroid.x ||
      first.id.localeCompare(second.id)
    );
  });

  for (const block of blocks) {
    for (const edgeId of block.boundaryRoadEdgeIds) {
      const edge = edgesById.get(edgeId);
      if (!edge) continue;
      if (validNodeIds.has(edge.from)) developed.add(edge.from);
      if (validNodeIds.has(edge.to)) developed.add(edge.to);
    }
  }

  if (developed.size >= 2) return [...developed].sort();
  return world.roads.nodes
    .map((node) => node.id)
    .filter((nodeId) => validNodeIds.has(nodeId))
    .sort();
}

export function buildTrafficNetwork(
  world: World,
  config: TrafficSimulationConfig = TRAFFIC_CONFIG,
): TrafficNetwork {
  const nodesById = new Map(world.roads.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<RoadNodeId, TrafficArc[]>();
  const degrees = new Map<RoadNodeId, number>();
  for (const node of world.roads.nodes) {
    outgoing.set(node.id, []);
    degrees.set(node.id, 0);
  }

  const arcs: TrafficArc[] = [];
  for (const edge of world.roads.edges) {
    if (
      !nodesById.has(edge.from) ||
      !nodesById.has(edge.to) ||
      edge.from === edge.to ||
      !Number.isFinite(edge.length) ||
      edge.length <= 0
    ) {
      continue;
    }
    const forward = createArc(edge, 'forward', config);
    const reverse = createArc(edge, 'reverse', config);
    arcs.push(forward, reverse);
    outgoing.get(forward.from)?.push(forward);
    outgoing.get(reverse.from)?.push(reverse);
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }

  arcs.sort((first, second) => first.id.localeCompare(second.id));
  for (const outgoingArcs of outgoing.values()) {
    outgoingArcs.sort((first, second) => first.id.localeCompare(second.id));
  }
  const validNodeIds = new Set(
    [...outgoing.entries()]
      .filter(([, outgoingArcs]) => outgoingArcs.length > 0)
      .map(([nodeId]) => nodeId),
  );

  return {
    sourceRoadGraph: world.roads,
    nodesById,
    arcsById: new Map(arcs.map((arc) => [arc.id, arc])),
    outgoingArcsByNodeId: outgoing,
    developedNodeIds: getDevelopedNodeIds(world, validNodeIds),
    intersectionNodeIds: new Set(
      [...degrees.entries()]
        .filter(([, degree]) => degree >= 3)
        .map(([nodeId]) => nodeId),
    ),
    maxNominalSpeed: Math.max(
      ...Object.values(config.nominalSpeedByRoadType),
    ),
  };
}
