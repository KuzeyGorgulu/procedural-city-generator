import type { SeededRng } from '../../core/rng';

const UINT32_RANGE = 0x1_0000_0000;

export interface NoiseDomain {
  readonly seeds: readonly number[];
  readonly offsetX: number;
  readonly offsetY: number;
}

export function createNoiseDomain(rng: SeededRng, octaves: number): NoiseDomain {
  return {
    seeds: Array.from({ length: octaves }, () => rng.int(0, 0x7fff_ffff)),
    offsetX: rng.float(-4_096, 4_096),
    offsetY: rng.float(-4_096, 4_096),
  };
}

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function latticeValue(x: number, y: number, seed: number): number {
  let value = seed ^ Math.imul(x, 0x1f123bb5) ^ Math.imul(y, 0x5f356495);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / UINT32_RANGE;
}

function valueNoise2d(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const xBlend = fade(x - x0);
  const yBlend = fade(y - y0);

  const top = lerp(
    latticeValue(x0, y0, seed),
    latticeValue(x0 + 1, y0, seed),
    xBlend,
  );
  const bottom = lerp(
    latticeValue(x0, y0 + 1, seed),
    latticeValue(x0 + 1, y0 + 1, seed),
    xBlend,
  );

  return lerp(top, bottom, yBlend);
}

export function sampleFbm(
  domain: NoiseDomain,
  x: number,
  y: number,
  persistence: number,
  lacunarity: number,
): number {
  let amplitude = 1;
  let frequency = 1;
  let weightedValue = 0;
  let totalAmplitude = 0;

  for (const seed of domain.seeds) {
    weightedValue +=
      valueNoise2d(
        (x + domain.offsetX) * frequency,
        (y + domain.offsetY) * frequency,
        seed,
      ) * amplitude;
    totalAmplitude += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }

  return weightedValue / totalAmplitude;
}
