import type { MobilityState } from '../mobility/types';
import type { PopulationState } from '../population/types';
import type { WellbeingConfig } from './config';
import {
  clampWellbeingScore,
  WELLBEING_CONFIG,
  WELLBEING_DIMENSIONS,
} from './config';
import { getDensityPressure } from './environmentalExposure';
import {
  addWellbeingScores,
  calculateWellbeingMetrics,
  mapWellbeingScores,
  zeroWellbeingScores,
} from './metrics';
import type {
  CitizenWellbeing,
  EnvironmentalExposureState,
  StaticWellbeingFactors,
  WellbeingScores,
  WellbeingState,
} from './types';

const WELLBEING_SEED_SEPARATOR = '\u001e';

function multiplyScores(
  weights: WellbeingScores,
  exposure: number,
): WellbeingScores {
  return mapWellbeingScores(weights, (value) => value * exposure);
}

function sumFactors(factors: StaticWellbeingFactors): WellbeingScores {
  let total = zeroWellbeingScores();
  for (const factor of Object.values(factors)) {
    total = addWellbeingScores(total, factor);
  }
  return total;
}

function buildCitizenWellbeing(
  exposure: EnvironmentalExposureState['citizenProfiles'][number],
  config: WellbeingConfig,
): CitizenWellbeing {
  const workplace = exposure.workplace;
  const factors: StaticWellbeingFactors = {
    homeGreen: multiplyScores(
      config.staticWeights.homeGreen,
      exposure.home.greenAccess,
    ),
    homeDensityPressure: multiplyScores(
      config.staticWeights.homeDensityPressure,
      getDensityPressure(exposure.home.localDensity, config),
    ),
    homeRoadNoise: multiplyScores(
      config.staticWeights.homeRoadNoise,
      exposure.home.roadNoiseProxy,
    ),
    homeCrowding: multiplyScores(
      config.staticWeights.homeCrowding,
      exposure.homeCrowding,
    ),
    workplaceGreen: multiplyScores(
      config.staticWeights.workplaceGreen,
      workplace?.greenAccess ?? 0,
    ),
    workplaceDensityPressure: multiplyScores(
      config.staticWeights.workplaceDensityPressure,
      getDensityPressure(workplace?.localDensity ?? 0, config),
    ),
    workplaceRoadNoise: multiplyScores(
      config.staticWeights.workplaceRoadNoise,
      workplace?.roadNoiseProxy ?? 0,
    ),
  };
  const staticTotal = sumFactors(factors);
  const initialScores = { ...config.initialBaseline };
  for (const dimension of WELLBEING_DIMENSIONS) {
    initialScores[dimension] = clampWellbeingScore(
      initialScores[dimension] + staticTotal[dimension],
      config,
    );
  }
  return {
    citizenId: exposure.citizenId,
    initialScores,
    scores: { ...initialScores },
    staticFactors: factors,
    cumulativeCommuteImpact: zeroWellbeingScores(),
    processedCommuteCount: 0,
  };
}

export function deriveWellbeingSeed(
  exposure: EnvironmentalExposureState,
  population: PopulationState,
  mobility: MobilityState,
  config: WellbeingConfig = WELLBEING_CONFIG,
): string {
  return [
    exposure.exposureSeed,
    population.populationSeed,
    mobility.mobilitySeed,
    config.wellbeingVersion,
  ].join(WELLBEING_SEED_SEPARATOR);
}

export function initializeWellbeing(
  exposure: EnvironmentalExposureState,
  population: PopulationState,
  mobility: MobilityState,
  config: WellbeingConfig = WELLBEING_CONFIG,
): WellbeingState {
  const citizens = exposure.citizenProfiles.map((profile) =>
    buildCitizenWellbeing(profile, config),
  );
  return {
    wellbeingVersion: config.wellbeingVersion,
    wellbeingSeed: deriveWellbeingSeed(
      exposure,
      population,
      mobility,
      config,
    ),
    scenarioSimulationSeed: '',
    citizens,
    processedEventIds: [],
    metrics: calculateWellbeingMetrics(citizens),
  };
}

export function resetWellbeingForScenario(
  baseline: WellbeingState,
  scenarioSimulationSeed: string,
): WellbeingState {
  const citizens = baseline.citizens.map((citizen) => ({
    citizenId: citizen.citizenId,
    initialScores: citizen.initialScores,
    scores: { ...citizen.initialScores },
    staticFactors: citizen.staticFactors,
    cumulativeCommuteImpact: zeroWellbeingScores(),
    processedCommuteCount: 0,
  }));
  return {
    wellbeingVersion: baseline.wellbeingVersion,
    wellbeingSeed: baseline.wellbeingSeed,
    scenarioSimulationSeed,
    citizens,
    processedEventIds: [],
    metrics: calculateWellbeingMetrics(citizens),
  };
}
