import { describe, expect, it } from 'vitest';
import type { Point, RoadGraph, TerrainData } from '../../world/types';
import { URBAN_CONFIG } from './config';
import { extractBlocks, extractRoadFaces } from './extractBlocks';

function graphFromSegments(segments: readonly [Point, Point][]): RoadGraph {
  const points = new Map<string, { id: string; position: Point }>();
  const nodeFor = (point: Point) => {
    const key = `${point.x},${point.y}`;
    let node = points.get(key);
    if (!node) {
      node = { id: `node-${points.size}`, position: point };
      points.set(key, node);
    }
    return node;
  };
  const edges = segments.map(([start, end], index) => {
    const from = nodeFor(start);
    const to = nodeFor(end);
    return {
      id: `edge-${index}`,
      from: from.id,
      to: to.id,
      type: 'secondary' as const,
      length: Math.hypot(end.x - start.x, end.y - start.y),
    };
  });
  return { nodes: [...points.values()], edges };
}

const LAND_TERRAIN: TerrainData = {
  origin: { x: -100, y: -100 },
  width: 500,
  height: 500,
  columns: 2,
  rows: 2,
  cellSize: 500,
  seaLevel: 0.5,
  slopeNormalization: 1,
  elevation: [1, 1, 1, 1],
  slope: [0, 0, 0, 0],
};

const SQUARE: readonly [Point, Point][] = [
  [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  [{ x: 100, y: 0 }, { x: 100, y: 100 }],
  [{ x: 100, y: 100 }, { x: 0, y: 100 }],
  [{ x: 0, y: 100 }, { x: 0, y: 0 }],
];

describe('extractRoadFaces', () => {
  it('extracts one bounded canonical face from a square', () => {
    const faces = extractRoadFaces(graphFromSegments(SQUARE));
    expect(faces).toHaveLength(1);
    expect(faces[0].polygon).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
  });

  it('extracts two adjacent faces and never returns their exterior', () => {
    const graph = graphFromSegments([
      ...SQUARE,
      [{ x: 100, y: 0 }, { x: 200, y: 0 }],
      [{ x: 200, y: 0 }, { x: 200, y: 100 }],
      [{ x: 200, y: 100 }, { x: 100, y: 100 }],
    ]);
    const faces = extractRoadFaces(graph);
    expect(faces).toHaveLength(2);
    expect(faces.map((face) => face.polygon)).toContainEqual([
      { x: 100, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 100 },
      { x: 100, y: 100 },
    ]);
  });

  it('ignores dangling edges attached to an otherwise valid face', () => {
    const faces = extractRoadFaces(
      graphFromSegments([
        ...SQUARE,
        [{ x: 100, y: 0 }, { x: 150, y: -50 }],
      ]),
    );
    expect(faces).toHaveLength(1);
    expect(faces[0].polygon).toHaveLength(4);
  });

  it('does not invent a face for an open U-shaped network', () => {
    const faces = extractRoadFaces(
      graphFromSegments([
        [{ x: 0, y: 0 }, { x: 0, y: 100 }],
        [{ x: 0, y: 100 }, { x: 100, y: 100 }],
        [{ x: 100, y: 100 }, { x: 100, y: 0 }],
      ]),
    );
    expect(faces).toEqual([]);
  });

  it('handles a square split by crossing roads with an explicit center node', () => {
    const faces = extractRoadFaces(
      graphFromSegments([
        [{ x: 0, y: 0 }, { x: 50, y: 0 }],
        [{ x: 50, y: 0 }, { x: 100, y: 0 }],
        [{ x: 100, y: 0 }, { x: 100, y: 50 }],
        [{ x: 100, y: 50 }, { x: 100, y: 100 }],
        [{ x: 100, y: 100 }, { x: 50, y: 100 }],
        [{ x: 50, y: 100 }, { x: 0, y: 100 }],
        [{ x: 0, y: 100 }, { x: 0, y: 50 }],
        [{ x: 0, y: 50 }, { x: 0, y: 0 }],
        [{ x: 50, y: 0 }, { x: 50, y: 50 }],
        [{ x: 50, y: 50 }, { x: 50, y: 100 }],
        [{ x: 0, y: 50 }, { x: 50, y: 50 }],
        [{ x: 50, y: 50 }, { x: 100, y: 50 }],
      ]),
    );
    expect(faces).toHaveLength(4);
    expect(faces.every((face) => face.polygon.length === 4)).toBe(true);
  });
});

describe('extractBlocks', () => {
  it('assigns stable IDs after validation and rejects water-dominated faces', () => {
    const graph = graphFromSegments(SQUARE);
    const config = { ...URBAN_CONFIG, minBlockArea: 100 };
    expect(extractBlocks(graph, LAND_TERRAIN, config)[0]?.id).toBe('block-0000');
    expect(
      extractBlocks(
        graph,
        { ...LAND_TERRAIN, elevation: [0, 0, 0, 0] },
        config,
      ),
    ).toEqual([]);
  });
});
