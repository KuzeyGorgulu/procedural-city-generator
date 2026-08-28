import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generateWorld';
import { getRoadStatistics } from './roadQueries';
import { getMorphologyStatistics } from './morphologyQueries';

const REPRESENTATIVE_SEEDS = [
  'phase-zero',
  'istanbul-1453',
  'memleket',
  'kamikaze1234',
  '23456789',
  '!',
  'a deliberately long deterministic seed string for morphology coverage',
  'auto-seed-001',
  'auto-seed-002',
  'auto-seed-003',
];

describe('morphology diagnostics', () => {
  it('reports broad road coverage and distributed blocks across representative seeds', () => {
    const worlds = REPRESENTATIVE_SEEDS.map((seed) => generateWorld({ seed }));
    const statistics = worlds.map((world) => getMorphologyStatistics(world));
    const meanBlockExtent =
      statistics.reduce(
        (total, entry) => total + entry.blockCentroidExtentRatio,
        0,
      ) / statistics.length;

    expect(statistics.every((entry) => entry.viableLandSampleCount > 0)).toBe(
      true,
    );
    expect(
      statistics.filter((entry) => entry.viableLandRoadCoverageRatio > 0.7),
    ).toHaveLength(REPRESENTATIVE_SEEDS.length);
    expect(statistics.every((entry) => entry.roadExtentRatio > 0.45)).toBe(true);
    expect(meanBlockExtent).toBeGreaterThan(0.38);
    expect(
      worlds.every(
        (world) =>
          getRoadStatistics(world.roads).connectedComponentCount === 1,
      ),
    ).toBe(true);
    expect(statistics.every((entry) => entry.longArterialEdgeCount === 0)).toBe(
      true,
    );
  });
});
