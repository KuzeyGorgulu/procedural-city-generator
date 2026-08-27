import { describe, expect, it } from 'vitest';
import { GENERATOR_VERSION } from '../core/generatorVersion';
import { generateWorld } from './generateWorld';

describe('generateWorld', () => {
  it('returns deeply identical worlds for the same seed and version', () => {
    const input = { seed: 'istanbul-1453', generatorVersion: GENERATOR_VERSION };
    expect(generateWorld(input)).toEqual(generateWorld(input));
  });

  it('produces different terrain data for different seeds', () => {
    const first = generateWorld({ seed: 'alpha' });
    const second = generateWorld({ seed: 'beta' });
    expect(first.terrain.elevation).not.toEqual(second.terrain.elevation);
  });

  it('does not leak state between sequential calls', () => {
    const before = generateWorld({ seed: 'repeatable' });
    generateWorld({ seed: 'interleaved' });
    const after = generateWorld({ seed: 'repeatable' });
    expect(after).toEqual(before);
  });

  it('stores normalized seed and generator version in metadata', () => {
    const world = generateWorld({ seed: '  stable-seed  ', generatorVersion: 'test-v7' });
    expect(world.metadata).toEqual({
      seed: 'stable-seed',
      generatorVersion: 'test-v7',
    });
  });

  it('allows generator versions to define different deterministic worlds', () => {
    const first = generateWorld({ seed: 'same-seed', generatorVersion: 'version-a' });
    const second = generateWorld({ seed: 'same-seed', generatorVersion: 'version-b' });
    expect(first.terrain.elevation).not.toEqual(second.terrain.elevation);
  });

  it('is JSON serializable without changing its data', () => {
    const world = generateWorld({ seed: 'serializable' });
    expect(JSON.parse(JSON.stringify(world))).toEqual(world);
  });
});
