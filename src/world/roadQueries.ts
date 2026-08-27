import { pointDistance, projectPointToSegment } from './roadGeometry';
import type {
  Point,
  RoadEdge,
  RoadGraph,
  RoadNode,
  RoadNodeId,
} from './types';

export interface NearestRoadResult {
  readonly edge: RoadEdge;
  readonly point: Point;
  readonly distance: number;
}

export interface RoadStatistics {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly arterialLength: number;
  readonly secondaryLength: number;
  readonly connectedComponentCount: number;
  readonly intersectionCount: number;
  readonly deadEndCount: number;
}

export function getRoadNode(
  graph: RoadGraph,
  nodeId: RoadNodeId,
): RoadNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function getConnectedEdges(
  graph: RoadGraph,
  nodeId: RoadNodeId,
): RoadEdge[] {
  return graph.edges.filter(
    (edge) => edge.from === nodeId || edge.to === nodeId,
  );
}

export function getRoadDegree(graph: RoadGraph, nodeId: RoadNodeId): number {
  return getConnectedEdges(graph, nodeId).length;
}

export function getRoadNeighbors(
  graph: RoadGraph,
  nodeId: RoadNodeId,
): RoadNode[] {
  const neighborIds = new Set<RoadNodeId>();
  for (const edge of getConnectedEdges(graph, nodeId)) {
    neighborIds.add(edge.from === nodeId ? edge.to : edge.from);
  }

  return graph.nodes.filter((node) => neighborIds.has(node.id));
}

export function findNearestRoad(
  graph: RoadGraph,
  point: Point,
): NearestRoadResult | undefined {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  let nearest: NearestRoadResult | undefined;

  for (const edge of graph.edges) {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) continue;

    const projection = projectPointToSegment(point, from.position, to.position);
    if (
      !nearest ||
      projection.distance < nearest.distance ||
      (projection.distance === nearest.distance && edge.id < nearest.edge.id)
    ) {
      nearest = {
        edge,
        point: projection.point,
        distance: projection.distance,
      };
    }
  }

  return nearest;
}

export function getRoadStatistics(graph: RoadGraph): RoadStatistics {
  const adjacency = new Map<RoadNodeId, RoadNodeId[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);

  let arterialLength = 0;
  let secondaryLength = 0;
  for (const edge of graph.edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
    if (edge.type === 'arterial') arterialLength += edge.length;
    else secondaryLength += edge.length;
  }

  let connectedComponentCount = 0;
  const visited = new Set<RoadNodeId>();
  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;
    connectedComponentCount += 1;
    const queue = [node.id];
    visited.add(node.id);
    for (let index = 0; index < queue.length; index += 1) {
      for (const neighbor of adjacency.get(queue[index]) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  const degrees = graph.nodes.map(
    (node) => adjacency.get(node.id)?.length ?? 0,
  );
  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    arterialLength,
    secondaryLength,
    connectedComponentCount,
    intersectionCount: degrees.filter((degree) => degree >= 3).length,
    deadEndCount: degrees.filter((degree) => degree === 1).length,
  };
}

export function getRoadNodeDistance(
  graph: RoadGraph,
  firstId: RoadNodeId,
  secondId: RoadNodeId,
): number | undefined {
  const first = getRoadNode(graph, firstId);
  const second = getRoadNode(graph, secondId);
  return first && second
    ? pointDistance(first.position, second.position)
    : undefined;
}
