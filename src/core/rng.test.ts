import { describe, expect, it } from 'vitest';
import { createSeededRng } from './rng';

function sequence(seed: string, length = 12): number[] {
  const rng = createSeededRng(seed);
  return Array.from({ length }, () => rng.next());
}

describe('SeededRng', () => {
  it('produces identical sequences for the same seed', () => {
    expect(sequence('city-42')).toEqual(sequence('city-42'));
  });

  it('produces different sequences for different seeds', () => {
    expect(sequence('city-42')).not.toEqual(sequence('city-43'));
  });

  it('derives substreams independently from parent consumption', () => {
    const consumedRoot = createSeededRng('city-42');
    consumedRoot.next();
    consumedRoot.next();

    const consumedFork = consumedRoot.fork('terrain');
    const freshFork = createSeededRng('city-42').fork('terrain');

    expect(Array.from({ length: 8 }, () => consumedFork.next())).toEqual(
      Array.from({ length: 8 }, () => freshFork.next()),
    );
  });

  it('keeps named substreams distinct', () => {
    const root = createSeededRng('city-42');
    expect(root.fork('terrain').next()).not.toBe(root.fork('roads').next());
  });
});
