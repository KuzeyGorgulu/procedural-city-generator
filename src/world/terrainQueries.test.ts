import { describe, expect, it } from 'vitest';
import type { TerrainData } from './types';
import {
  isWater,
  sampleElevation,
  sampleSlope,
  sampleTerrain,
} from './terrainQueries';

const TERRAIN: TerrainData = {
  origin: { x: 100, y: 200 },
  width: 10,
  height: 10,
  columns: 2,
  rows: 2,
  cellSize: 10,
  seaLevel: 0.5,
  slopeNormalization: 0.2,
  elevation: [0, 0.2, 0.8, 1],
  slope: [0, 0.2, 0.4, 0.6],
};

describe('terrain queries', () => {
  it('bilinearly samples elevation and slope in world space', () => {
    expect(sampleElevation(TERRAIN, 105, 205)).toBeCloseTo(0.5);
    expect(sampleSlope(TERRAIN, 105, 205)).toBeCloseTo(0.3);
  });

  it('returns reproducible combined samples', () => {
    const first = sampleTerrain(TERRAIN, 103.25, 207.75);
    expect(sampleTerrain(TERRAIN, 103.25, 207.75)).toEqual(first);
  });

  it('classifies water directly from sampled elevation and sea level', () => {
    expect(isWater(TERRAIN, 100, 200)).toBe(true);
    expect(isWater(TERRAIN, 110, 210)).toBe(false);
    expect(isWater(TERRAIN, 105, 205)).toBe(true);
  });

  it('clamps out-of-bounds samples to the nearest edge', () => {
    expect(sampleElevation(TERRAIN, -1_000, -1_000)).toBe(
      TERRAIN.elevation[0],
    );
    expect(sampleElevation(TERRAIN, 1_000, 1_000)).toBe(
      TERRAIN.elevation[3],
    );
  });

  it('rejects non-finite coordinates', () => {
    expect(() => sampleElevation(TERRAIN, Number.NaN, 205)).toThrow(RangeError);
    expect(() => sampleSlope(TERRAIN, 105, Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });

  it('survives JSON serialization without changing query results', () => {
    const roundTrip = JSON.parse(JSON.stringify(TERRAIN)) as TerrainData;
    expect(sampleTerrain(roundTrip, 106, 204)).toEqual(
      sampleTerrain(TERRAIN, 106, 204),
    );
  });
});
