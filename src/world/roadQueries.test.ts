import { describe, expect, it } from 'vitest';
import type { RoadGraph } from './types';
import {
  findNearestRoad,
  getConnectedEdges,
  getRoadDegree,
  getRoadNeighbors,
  getRoadNode,
  getRoadStatistics,
} from './roadQueries';

const GRAPH: RoadGraph = {
  nodes: [
    { id: 'a', position: { x: 0, y: 0 } },
    { id: 'b', position: { x: 100, y: 0 } },
    { id: 'c', position: { x: 100, y: 100 } },
    { id: 'd', position: { x: 200, y: 0 } },
  ],
  edges: [
    { id: 'ab', from: 'a', to: 'b', type: 'arterial', length: 100 },
    { id: 'bc', from: 'b', to: 'c', type: 'secondary', length: 100 },
    { id: 'bd', from: 'b', to: 'd', type: 'arterial', length: 100 },
  ],
};

describe('road queries', () => {
  it('looks up nodes, incident edges, neighbors, and degree', () => {
    expect(getRoadNode(GRAPH, 'b')?.position).toEqual({ x: 100, y: 0 });
    expect(getConnectedEdges(GRAPH, 'b')).toHaveLength(3);
    expect(getRoadNeighbors(GRAPH, 'b').map((node) => node.id)).toEqual([
      'a',
      'c',
      'd',
    ]);
    expect(getRoadDegree(GRAPH, 'b')).toBe(3);
  });

  it('finds the nearest point on a road edge', () => {
    const nearest = findNearestRoad(GRAPH, { x: 55, y: 20 });
    expect(nearest?.edge.id).toBe('ab');
    expect(nearest?.point.x).toBeCloseTo(55);
    expect(nearest?.point.y).toBeCloseTo(0);
    expect(nearest?.distance).toBe(20);
  });

  it('derives connectivity and road statistics', () => {
    expect(getRoadStatistics(GRAPH)).toEqual({
      nodeCount: 4,
      edgeCount: 3,
      arterialLength: 200,
      secondaryLength: 100,
      connectedComponentCount: 1,
      intersectionCount: 1,
      deadEndCount: 3,
    });
  });
});
