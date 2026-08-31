import { createSeededRng } from '../core/rng';
import type { World } from '../world/types';
import { buildPopulationAccessIndex } from './accessibility';
import { deriveBuildingCapacities } from './capacity';
import type { PopulationConfig } from './config';
import { POPULATION_CONFIG } from './config';
import { assignEmployment } from './employment';
import { generateHouseholdsAndCitizens } from './households';
import { calculatePopulationMetrics } from './metrics';
import type { PopulationState } from './types';

const POPULATION_SEED_SEPARATOR = '\u001e';

export function derivePopulationSeed(
  world: World,
  config: PopulationConfig = POPULATION_CONFIG,
): string {
  return [
    world.metadata.generatorVersion,
    world.metadata.seed,
    `population/${config.populationVersion}`,
  ].join(POPULATION_SEED_SEPARATOR);
}

/** Pure population initialization over an immutable generated world. */
export function generatePopulation(
  world: World,
  config: PopulationConfig = POPULATION_CONFIG,
): PopulationState {
  const populationSeed = derivePopulationSeed(world, config);
  const rootRng = createSeededRng(populationSeed);
  const capacities = deriveBuildingCapacities(world, config);
  const accessIndex = buildPopulationAccessIndex(world);
  const households = generateHouseholdsAndCitizens(
    capacities,
    accessIndex,
    rootRng.fork('households'),
    rootRng.fork('citizens'),
    config,
  );
  const employment = assignEmployment(
    households.citizens,
    households.buildingOccupancy,
    accessIndex,
    rootRng.fork('employment'),
    config,
  );
  const metrics = calculatePopulationMetrics(
    households.households,
    employment.citizens,
    employment.workplaces,
    employment.buildingOccupancy,
  );

  return {
    populationVersion: config.populationVersion,
    populationSeed,
    households: households.households,
    citizens: employment.citizens,
    workplaces: employment.workplaces,
    buildingOccupancy: employment.buildingOccupancy,
    metrics,
  };
}
