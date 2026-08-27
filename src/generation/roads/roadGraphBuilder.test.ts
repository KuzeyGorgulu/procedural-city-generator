import { describe, expect, it } from 'vitest';
import { getRoadDegree, getRoadStatistics } from '../../world/roadQueries';
import { RoadGraphBuilder } from './roadGraphBuilder';

const CONFIG = {
  snapDistance: 2,
  intersectionTolerance: 1e-7,
  minSegmentLength: 0.1,
};

describe('RoadGraphBuilder', () => {
  it('turns a geometric crossing into a shared graph node', () => {
    const builder = new RoadGraphBuilder(CONFIG);
    builder.addRoute(
      [
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ],
      'arterial',
    );
    builder.addRoute(
      [
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
      'secondary',
    );

    const graph = builder.toRoadGraph();
    const intersection = graph.nodes.find(
      (node) => node.position.x === 50 && node.position.y === 50,
    );
    expect(intersection).toBeDefined();
    expect(intersection && getRoadDegree(graph, intersection.id)).toBe(4);
    expect(graph.edges).toHaveLength(4);
    expect(getRoadStatistics(graph).connectedComponentCount).toBe(1);
  });

  it('snaps nearby endpoints and rejects duplicate endpoint pairs', () => {
    const builder = new RoadGraphBuilder(CONFIG);
    builder.addRoute(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      'arterial',
    );
    builder.addRoute(
      [
        { x: 100.5, y: 0 },
        { x: 150, y: 0 },
      ],
      'secondary',
    );
    builder.addRoute(
      [
        { x: 150, y: 0 },
        { x: 100, y: 0 },
      ],
      'secondary',
    );

    const graph = builder.toRoadGraph();
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.nodes.some((node) => node.position.x === 100.5)).toBe(false);
  });
});
