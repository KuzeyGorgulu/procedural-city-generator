import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../core/rng';
import { generateWorld } from '../generateWorld';
import { createDevelopmentFixture } from '../development/developmentTestFixtures';
import { SUPPORTED_ZONE_TYPES, generateZoning } from './generateZoning';

describe('generateZoning', () => {
  it('is deterministic, stable, and meaningfully seed-specific', () => {
    const first = generateWorld({ seed: 'zoning-repeatability' }).urban.zoning;
    const repeated = generateWorld({ seed: 'zoning-repeatability' }).urban.zoning;
    const different = generateWorld({ seed: 'zoning-diversity' }).urban.zoning;
    expect(repeated).toEqual(first);
    expect(different).not.toEqual(first);
    expect(repeated.map((entry) => entry.parcelId)).toEqual(
      first.map((entry) => entry.parcelId),
    );
  });

  it('assigns exactly one valid, finite zoning record to every parcel', () => {
    for (const seed of ['phase-zero', 'istanbul', 'memleket', 'şehir 🚗']) {
      const urban = generateWorld({ seed }).urban;
      expect(urban.zoning).toHaveLength(urban.parcels.length);
      expect(new Set(urban.zoning.map((entry) => entry.parcelId)).size).toBe(
        urban.parcels.length,
      );
      expect(urban.zoning.some((entry) => entry.zone === 'green')).toBe(true);
      expect(urban.zoning.some((entry) => entry.zone === 'residential')).toBe(true);
      for (const entry of urban.zoning) {
        expect(SUPPORTED_ZONE_TYPES).toContain(entry.zone);
        expect(['low', 'medium', 'high']).toContain(entry.intensity);
        expect(Number.isFinite(entry.suitability.score)).toBe(true);
        expect(entry.suitability.score).toBeGreaterThanOrEqual(0);
        expect(entry.suitability.score).toBeLessThanOrEqual(1);
        expect(Number.isFinite(entry.suitability.meanSlope)).toBe(true);
        expect(Number.isFinite(entry.suitability.meanElevation)).toBe(true);
        expect(Number.isFinite(entry.suitability.waterProximity)).toBe(true);
        expect(Number.isFinite(entry.suitability.accessibility)).toBe(true);
        expect(Number.isFinite(entry.suitability.centrality)).toBe(true);
      }
    }
  });

  it('marks clearly steep terrain unsuitable instead of forcing development', () => {
    const fixture = createDevelopmentFixture({ slope: Array(9).fill(0.9) });
    const zoning = generateZoning({
      ...fixture,
      rng: createSeededRng('steep-zoning'),
    });
    expect(zoning).toHaveLength(1);
    expect(zoning[0].zone).toBe('green');
    expect(zoning[0].suitability.developable).toBe(false);
    expect(zoning[0].suitability.constraints).toContain('steep');
  });
});
