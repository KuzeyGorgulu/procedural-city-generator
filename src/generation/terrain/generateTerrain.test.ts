import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../core/rng';
import type { WorldBounds } from '../../world/types';
import { TERRAIN_CONFIG } from './config';
import { deriveSlopes, generateTerrain } from './generateTerrain';

const BOUNDS: WorldBounds = { x: 0, y: 0, width: 2_400, height: 1_600 };

function terrainFor(seed: string) {
  return generateTerrain({
    bounds: BOUNDS,
    rng: createSeededRng(seed).fork('terrain/v1'),
    config: TERRAIN_CONFIG,
  });
}

describe('generateTerrain', () => {
  it('reproduces identical terrain for the same terrain stream', () => {
    expect(terrainFor('same-seed')).toEqual(terrainFor('same-seed'));
  });

  it('produces different elevation for different terrain streams', () => {
    expect(terrainFor('seed-a').elevation).not.toEqual(
      terrainFor('seed-b').elevation,
    );
  });

  it('has dimensions that exactly span the world bounds', () => {
    const terrain = terrainFor('dimensions');
    expect(terrain.columns).toBe(BOUNDS.width / TERRAIN_CONFIG.cellSize + 1);
    expect(terrain.rows).toBe(BOUNDS.height / TERRAIN_CONFIG.cellSize + 1);
    expect(terrain.elevation).toHaveLength(terrain.columns * terrain.rows);
    expect(terrain.slope).toHaveLength(terrain.columns * terrain.rows);
    expect((terrain.columns - 1) * terrain.cellSize).toBe(terrain.width);
    expect((terrain.rows - 1) * terrain.cellSize).toBe(terrain.height);
  });

  it('keeps every elevation and slope finite and normalized', () => {
    const terrain = terrainFor('finite-values');
    for (const elevation of terrain.elevation) {
      expect(Number.isFinite(elevation)).toBe(true);
      expect(elevation).toBeGreaterThanOrEqual(0);
      expect(elevation).toBeLessThanOrEqual(1);
    }
    for (const slope of terrain.slope) {
      expect(Number.isFinite(slope)).toBe(true);
      expect(slope).toBeGreaterThanOrEqual(0);
      expect(slope).toBeLessThanOrEqual(1);
    }
  });

  it('produces a useful land and water mix for representative seeds', () => {
    for (const seed of ['phase-zero', 'istanbul-1453', 'terrain-check']) {
      const terrain = terrainFor(seed);
      const waterSamples = terrain.elevation.filter(
        (elevation) => elevation <= terrain.seaLevel,
      ).length;
      const waterRatio = waterSamples / terrain.elevation.length;
      expect(waterRatio).toBeGreaterThan(0.08);
      expect(waterRatio).toBeLessThan(0.92);
    }
  });

  it('isolates terrain from unrelated RNG consumption', () => {
    const consumedRoot = createSeededRng('isolation');
    consumedRoot.fork('unrelated-system').next();

    const afterUnrelatedUse = generateTerrain({
      bounds: BOUNDS,
      rng: consumedRoot.fork('terrain/v1'),
      config: TERRAIN_CONFIG,
    });
    const fresh = generateTerrain({
      bounds: BOUNDS,
      rng: createSeededRng('isolation').fork('terrain/v1'),
      config: TERRAIN_CONFIG,
    });

    expect(afterUnrelatedUse).toEqual(fresh);
  });
});

describe('deriveSlopes', () => {
  it('derives zero slope from a flat field', () => {
    expect(deriveSlopes(Array(9).fill(0.5), 3, 3, 0.1)).toEqual(
      Array(9).fill(0),
    );
  });

  it('derives slope from neighboring elevation change', () => {
    const eastwardRise = [0, 0.1, 0.2, 0, 0.1, 0.2, 0, 0.1, 0.2];
    const slopes = deriveSlopes(eastwardRise, 3, 3, 0.2);
    expect(slopes[4]).toBeCloseTo(0.5);
  });
});
