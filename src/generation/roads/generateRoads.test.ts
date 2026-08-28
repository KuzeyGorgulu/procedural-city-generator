import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../core/rng';
import { intersectSegments, pointDistance } from '../../world/roadGeometry';
import { getRoadStatistics } from '../../world/roadQueries';
import { sampleTerrain } from '../../world/terrainQueries';
import type { RoadGraph, WorldBounds } from '../../world/types';
import { generateWorld } from '../generateWorld';
import { TERRAIN_CONFIG } from '../terrain/config';
import { generateTerrain } from '../terrain/generateTerrain';
import { ROAD_CONFIG } from './config';
import { generateRoads, selectArterialAnchors } from './generateRoads';

const BOUNDS: WorldBounds = { x: 0, y: 0, width: 2_400, height: 1_600 };

function assertNoUnresolvedCrossings(graph: RoadGraph): void {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  for (let firstIndex = 0; firstIndex < graph.edges.length; firstIndex += 1) {
    const first = graph.edges[firstIndex];
    for (
      let secondIndex = firstIndex + 1;
      secondIndex < graph.edges.length;
      secondIndex += 1
    ) {
      const second = graph.edges[secondIndex];
      const sharedNode =
        first.from === second.from ||
        first.from === second.to ||
        first.to === second.from ||
        first.to === second.to;
      if (sharedNode) continue;
      const intersection = intersectSegments(
        nodes.get(first.from)!.position,
        nodes.get(first.to)!.position,
        nodes.get(second.from)!.position,
        nodes.get(second.to)!.position,
        ROAD_CONFIG.intersectionTolerance,
      );
      expect(intersection).toBeNull();
    }
  }
}

describe('generateRoads', () => {
  it('distributes arterial anchors across broad viable regions', () => {
    const columns = 49;
    const rows = 33;
    const terrain = {
      origin: { x: 0, y: 0 },
      width: BOUNDS.width,
      height: BOUNDS.height,
      columns,
      rows,
      cellSize: 50,
      seaLevel: 0.2,
      slopeNormalization: 0.14,
      elevation: Array(columns * rows).fill(0.8),
      slope: Array(columns * rows).fill(0),
    };
    const anchors = selectArterialAnchors(
      BOUNDS,
      terrain,
      createSeededRng('distributed-anchors'),
      ROAD_CONFIG,
    );
    const representedRegions = new Set(
      anchors.map((anchor) => {
        const column = Math.min(
          ROAD_CONFIG.anchorRegionColumns - 1,
          Math.floor((anchor.x / BOUNDS.width) * ROAD_CONFIG.anchorRegionColumns),
        );
        const row = Math.min(
          ROAD_CONFIG.anchorRegionRows - 1,
          Math.floor((anchor.y / BOUNDS.height) * ROAD_CONFIG.anchorRegionRows),
        );
        return `${column},${row}`;
      }),
    );

    expect(anchors).toHaveLength(ROAD_CONFIG.arterialAnchorCount);
    expect(representedRegions.size).toBe(
      ROAD_CONFIG.anchorRegionColumns * ROAD_CONFIG.anchorRegionRows,
    );
    for (let first = 0; first < anchors.length; first += 1) {
      for (let second = first + 1; second < anchors.length; second += 1) {
        expect(pointDistance(anchors[first], anchors[second])).toBeGreaterThanOrEqual(
          ROAD_CONFIG.minimumAnchorSeparation,
        );
      }
    }
  });

  it('reproduces an identical graph for the same seed and version', () => {
    expect(generateWorld({ seed: 'road-repeatability' }).roads).toEqual(
      generateWorld({ seed: 'road-repeatability' }).roads,
    );
  });

  it('produces different graphs for different seeds', () => {
    expect(generateWorld({ seed: 'road-seed-a' }).roads).not.toEqual(
      generateWorld({ seed: 'road-seed-b' }).roads,
    );
  });

  it('creates a connected graph with arterial and secondary structure', () => {
    const graph = generateWorld({ seed: 'phase-zero' }).roads;
    const statistics = getRoadStatistics(graph);
    expect(graph.edges.some((edge) => edge.type === 'arterial')).toBe(true);
    expect(graph.edges.some((edge) => edge.type === 'secondary')).toBe(true);
    expect(statistics.connectedComponentCount).toBe(1);
    expect(statistics.intersectionCount).toBeGreaterThan(0);
    expect(statistics.secondaryLength).toBeGreaterThan(500);
  });

  it('satisfies graph identity, reference, geometry, and type invariants', () => {
    const graph = generateWorld({ seed: 'graph-invariants' }).roads;
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    const edgeIds = new Set(graph.edges.map((edge) => edge.id));
    expect(nodeIds.size).toBe(graph.nodes.length);
    expect(edgeIds.size).toBe(graph.edges.length);

    const endpointPairs = new Set<string>();
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const node of graph.nodes) {
      expect(Number.isFinite(node.position.x)).toBe(true);
      expect(Number.isFinite(node.position.y)).toBe(true);
      expect(node.position.x).toBeGreaterThanOrEqual(BOUNDS.x);
      expect(node.position.x).toBeLessThanOrEqual(BOUNDS.x + BOUNDS.width);
      expect(node.position.y).toBeGreaterThanOrEqual(BOUNDS.y);
      expect(node.position.y).toBeLessThanOrEqual(BOUNDS.y + BOUNDS.height);
    }
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
      expect(edge.from).not.toBe(edge.to);
      expect(['arterial', 'secondary']).toContain(edge.type);
      expect(Number.isFinite(edge.length)).toBe(true);
      expect(edge.length).toBeGreaterThan(0);
      expect(edge.length).toBeCloseTo(
        pointDistance(nodes.get(edge.from)!.position, nodes.get(edge.to)!.position),
      );
      const pair = [edge.from, edge.to].sort().join('|');
      expect(endpointPairs.has(pair)).toBe(false);
      endpointPairs.add(pair);
    }
  });

  it('keeps road geometry on passable terrain', () => {
    const world = generateWorld({ seed: 'terrain-valid-roads' });
    const nodes = new Map(world.roads.nodes.map((node) => [node.id, node]));
    for (const edge of world.roads.edges) {
      const start = nodes.get(edge.from)!.position;
      const end = nodes.get(edge.to)!.position;
      const samples = Math.max(
        1,
        Math.ceil(edge.length / ROAD_CONFIG.terrainSampleStep),
      );
      for (let index = 0; index <= samples; index += 1) {
        const amount = index / samples;
        const terrainSample = sampleTerrain(
          world.terrain,
          start.x + (end.x - start.x) * amount,
          start.y + (end.y - start.y) * amount,
        );
        expect(terrainSample.water).toBe(false);
        expect(terrainSample.slope).toBeLessThanOrEqual(ROAD_CONFIG.maxRoadSlope);
      }
    }
  });

  it('resolves all non-parallel geometric crossings into shared nodes', () => {
    for (const seed of ['phase-zero', 'istanbul-1453', 'intersection-check']) {
      assertNoUnresolvedCrossings(generateWorld({ seed }).roads);
    }
  });

  it('survives JSON serialization without meaningful data loss', () => {
    const graph = generateWorld({ seed: 'road-serialization' }).roads;
    expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
  });

  it('is isolated from unrelated RNG consumption', () => {
    const consumedRoot = createSeededRng('road-isolation');
    const terrain = generateTerrain({
      bounds: BOUNDS,
      rng: consumedRoot.fork('terrain/v1'),
      config: TERRAIN_CONFIG,
    });
    consumedRoot.fork('unrelated-system').next();
    const afterUnrelatedUse = generateRoads({
      bounds: BOUNDS,
      terrain,
      rng: consumedRoot.fork('roads/v2'),
      config: ROAD_CONFIG,
    });
    const fresh = generateRoads({
      bounds: BOUNDS,
      terrain,
      rng: createSeededRng('road-isolation').fork('roads/v2'),
      config: ROAD_CONFIG,
    });
    expect(afterUnrelatedUse).toEqual(fresh);
  });
});
