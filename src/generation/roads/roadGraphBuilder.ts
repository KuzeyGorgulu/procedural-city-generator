import {
  intersectSegments,
  pointDistance,
  projectPointToSegment,
} from '../../world/roadGeometry';
import type {
  Point,
  RoadEdge,
  RoadGraph,
  RoadNode,
  RoadType,
} from '../../world/types';

export interface RoadGraphBuilderConfig {
  readonly snapDistance: number;
  readonly intersectionTolerance: number;
  readonly minSegmentLength: number;
}

interface SegmentNode {
  readonly t: number;
  readonly nodeId: string;
}

export class RoadGraphBuilder {
  readonly #config: RoadGraphBuilderConfig;
  readonly #nodes: RoadNode[] = [];
  readonly #edges: RoadEdge[] = [];
  #nodeCounter = 0;
  #edgeCounter = 0;

  constructor(config: RoadGraphBuilderConfig) {
    this.#config = config;
  }

  addRoute(points: readonly Point[], type: RoadType): number {
    let addedEdges = 0;
    for (let index = 1; index < points.length; index += 1) {
      addedEdges += this.#addSegment(points[index - 1], points[index], type);
    }
    return addedEdges;
  }

  toRoadGraph(): RoadGraph {
    return {
      nodes: [...this.#nodes],
      edges: [...this.#edges],
    };
  }

  #createNode(position: Point): RoadNode {
    const node: RoadNode = {
      id: `road-node-${this.#nodeCounter.toString().padStart(4, '0')}`,
      position: { x: position.x, y: position.y },
    };
    this.#nodeCounter += 1;
    this.#nodes.push(node);
    return node;
  }

  #findNodeWithin(position: Point, distance: number): RoadNode | undefined {
    let nearest: RoadNode | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const node of this.#nodes) {
      const candidateDistance = pointDistance(position, node.position);
      if (
        candidateDistance <= distance &&
        (candidateDistance < nearestDistance ||
          (candidateDistance === nearestDistance &&
            (!nearest || node.id < nearest.id)))
      ) {
        nearest = node;
        nearestDistance = candidateDistance;
      }
    }
    return nearest;
  }

  #getNode(nodeId: string): RoadNode {
    const node = this.#nodes.find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error(`Road graph references missing node ${nodeId}.`);
    return node;
  }

  #addRawEdge(from: string, to: string, type: RoadType): boolean {
    if (from === to) return false;
    const fromNode = this.#getNode(from);
    const toNode = this.#getNode(to);
    const length = pointDistance(fromNode.position, toNode.position);
    if (!Number.isFinite(length) || length < this.#config.minSegmentLength) {
      return false;
    }

    const duplicateIndex = this.#edges.findIndex(
      (edge) =>
        (edge.from === from && edge.to === to) ||
        (edge.from === to && edge.to === from),
    );
    if (duplicateIndex >= 0) {
      const duplicate = this.#edges[duplicateIndex];
      if (duplicate.type === 'secondary' && type === 'arterial') {
        this.#edges[duplicateIndex] = { ...duplicate, type: 'arterial' };
      }
      return false;
    }

    this.#edges.push({
      id: `road-edge-${this.#edgeCounter.toString().padStart(4, '0')}`,
      from,
      to,
      type,
      length,
    });
    this.#edgeCounter += 1;
    return true;
  }

  #splitEdge(edgeId: string, nodeId: string): void {
    const edgeIndex = this.#edges.findIndex((edge) => edge.id === edgeId);
    if (edgeIndex < 0) return;
    const [edge] = this.#edges.splice(edgeIndex, 1);
    if (edge.from === nodeId || edge.to === nodeId) return;
    this.#addRawEdge(edge.from, nodeId, edge.type);
    this.#addRawEdge(nodeId, edge.to, edge.type);
  }

  #resolveEndpoint(position: Point): RoadNode {
    const nearbyNode = this.#findNodeWithin(position, this.#config.snapDistance);
    if (nearbyNode) return nearbyNode;

    let nearestProjection:
      | { readonly edge: RoadEdge; readonly point: Point; readonly distance: number }
      | undefined;
    for (const edge of this.#edges) {
      const start = this.#getNode(edge.from);
      const end = this.#getNode(edge.to);
      const projection = projectPointToSegment(
        position,
        start.position,
        end.position,
      );
      if (
        projection.t <= this.#config.intersectionTolerance ||
        projection.t >= 1 - this.#config.intersectionTolerance ||
        projection.distance > this.#config.snapDistance
      ) {
        continue;
      }
      if (
        !nearestProjection ||
        projection.distance < nearestProjection.distance ||
        (projection.distance === nearestProjection.distance &&
          edge.id < nearestProjection.edge.id)
      ) {
        nearestProjection = {
          edge,
          point: projection.point,
          distance: projection.distance,
        };
      }
    }

    if (nearestProjection) {
      const node = this.#createNode(nearestProjection.point);
      this.#splitEdge(nearestProjection.edge.id, node.id);
      return node;
    }

    return this.#createNode(position);
  }

  #intersectionNode(edge: RoadEdge, point: Point, edgeT: number): RoadNode {
    const from = this.#getNode(edge.from);
    const to = this.#getNode(edge.to);
    if (
      edgeT <= this.#config.intersectionTolerance ||
      pointDistance(point, from.position) < this.#config.minSegmentLength
    ) {
      return from;
    }
    if (
      edgeT >= 1 - this.#config.intersectionTolerance ||
      pointDistance(point, to.position) < this.#config.minSegmentLength
    ) {
      return to;
    }

    const existing = this.#findNodeWithin(
      point,
      this.#config.intersectionTolerance,
    );
    const node = existing ?? this.#createNode(point);
    this.#splitEdge(edge.id, node.id);
    return node;
  }

  #addSegment(start: Point, end: Point, type: RoadType): number {
    if (pointDistance(start, end) < this.#config.minSegmentLength) return 0;
    const from = this.#resolveEndpoint(start);
    const to = this.#resolveEndpoint(end);
    if (from.id === to.id) return 0;

    const segmentNodes: SegmentNode[] = [
      { t: 0, nodeId: from.id },
      { t: 1, nodeId: to.id },
    ];

    for (const node of this.#nodes) {
      if (node.id === from.id || node.id === to.id) continue;
      const projection = projectPointToSegment(node.position, from.position, to.position);
      if (
        projection.distance <= this.#config.intersectionTolerance &&
        projection.t > this.#config.intersectionTolerance &&
        projection.t < 1 - this.#config.intersectionTolerance
      ) {
        segmentNodes.push({ t: projection.t, nodeId: node.id });
      }
    }

    const existingEdges = [...this.#edges];
    for (const edge of existingEdges) {
      const edgeStart = this.#getNode(edge.from);
      const edgeEnd = this.#getNode(edge.to);
      const intersection = intersectSegments(
        from.position,
        to.position,
        edgeStart.position,
        edgeEnd.position,
        this.#config.intersectionTolerance,
      );
      if (!intersection) continue;
      const node = this.#intersectionNode(
        edge,
        intersection.point,
        intersection.secondT,
      );
      segmentNodes.push({ t: intersection.firstT, nodeId: node.id });
    }

    segmentNodes.sort((first, second) => {
      if (first.t !== second.t) return first.t - second.t;
      if (first.nodeId === second.nodeId) return 0;
      return first.nodeId < second.nodeId ? -1 : 1;
    });
    const orderedNodeIds = segmentNodes
      .map(({ nodeId }) => nodeId)
      .filter((nodeId, index, all) => index === 0 || nodeId !== all[index - 1]);

    let addedEdges = 0;
    for (let index = 1; index < orderedNodeIds.length; index += 1) {
      if (this.#addRawEdge(orderedNodeIds[index - 1], orderedNodeIds[index], type)) {
        addedEdges += 1;
      }
    }
    return addedEdges;
  }
}
