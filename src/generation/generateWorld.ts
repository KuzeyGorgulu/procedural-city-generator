import { GENERATOR_VERSION } from '../core/generatorVersion';
import { createSeededRng } from '../core/rng';
import { normalizeSeed } from '../core/seed';
import type { World, WorldBounds } from '../world/types';
import { ROAD_CONFIG } from './roads/config';
import { generateRoads } from './roads/generateRoads';
import { TERRAIN_CONFIG } from './terrain/config';
import { generateTerrain } from './terrain/generateTerrain';
import { URBAN_CONFIG } from './urban/config';
import { generateUrbanStructure } from './urban/generateUrbanStructure';

export interface GenerateWorldInput {
  readonly seed: string;
  readonly generatorVersion?: string;
}

const WORLD_BOUNDS: WorldBounds = {
  x: 0,
  y: 0,
  width: 2_400,
  height: 1_600,
};

/** Pure deterministic mapping from a seed/version pair to serializable data. */
export function generateWorld({
  seed,
  generatorVersion = GENERATOR_VERSION,
}: GenerateWorldInput): World {
  const normalizedSeed = normalizeSeed(seed);
  const rootRng = createSeededRng(`${generatorVersion}\u001e${normalizedSeed}`);
  const terrain = generateTerrain({
    bounds: WORLD_BOUNDS,
    rng: rootRng.fork('terrain/v1'),
    config: TERRAIN_CONFIG,
  });
  const roads = generateRoads({
    bounds: WORLD_BOUNDS,
    terrain,
    rng: rootRng.fork('roads/v2'),
    config: ROAD_CONFIG,
  });
  const urban = generateUrbanStructure({
    roads,
    terrain,
    rng: rootRng.fork('urban/v1'),
    config: URBAN_CONFIG,
  });

  return {
    metadata: {
      seed: normalizedSeed,
      generatorVersion,
    },
    bounds: WORLD_BOUNDS,
    terrain,
    roads,
    urban,
  };
}
