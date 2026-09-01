import type { PopulationState } from '../population/types';
import type {
  BuildingWellbeingSummary,
  CitizenWellbeing,
  EnvironmentalExposureProfile,
  EnvironmentalExposureState,
  WellbeingExplanation,
  WellbeingScores,
  WellbeingState,
} from './types';
import { zeroWellbeingScores } from './metrics';
import type { WellbeingConfig } from './config';
import { WELLBEING_CONFIG } from './config';

export function buildCitizenWellbeingIndex(
  state: WellbeingState,
): ReadonlyMap<string, CitizenWellbeing> {
  return new Map(state.citizens.map((citizen) => [citizen.citizenId, citizen]));
}

export function buildExposureProfileIndex(
  exposure: EnvironmentalExposureState,
): ReadonlyMap<string, EnvironmentalExposureProfile> {
  return new Map(
    exposure.citizenProfiles.map((profile) => [profile.citizenId, profile]),
  );
}

export function aggregateWellbeingByHomeBuilding(
  state: WellbeingState,
  population: PopulationState,
): readonly BuildingWellbeingSummary[] {
  const wellbeingByCitizenId = buildCitizenWellbeingIndex(state);
  const totalsByBuildingId = new Map<
    string,
    {
      residentCount: number;
      scores: Record<keyof WellbeingScores, number>;
    }
  >();
  for (const citizen of population.citizens) {
    const wellbeing = wellbeingByCitizenId.get(citizen.id);
    if (!wellbeing) continue;
    const aggregate = totalsByBuildingId.get(citizen.homeBuildingId) ?? {
      residentCount: 0,
      scores: { ...zeroWellbeingScores() },
    };
    aggregate.residentCount += 1;
    aggregate.scores.stress += wellbeing.scores.stress;
    aggregate.scores.tension += wellbeing.scores.tension;
    aggregate.scores.calm += wellbeing.scores.calm;
    aggregate.scores.happiness += wellbeing.scores.happiness;
    totalsByBuildingId.set(citizen.homeBuildingId, aggregate);
  }
  return [...totalsByBuildingId.entries()]
    .map(([buildingId, aggregate]) => ({
      buildingId,
      residentCount: aggregate.residentCount,
      averageScores: {
        stress: aggregate.scores.stress / aggregate.residentCount,
        tension: aggregate.scores.tension / aggregate.residentCount,
        calm: aggregate.scores.calm / aggregate.residentCount,
        happiness: aggregate.scores.happiness / aggregate.residentCount,
      },
    }))
    .sort((first, second) => first.buildingId.localeCompare(second.buildingId));
}

export function explainCitizenWellbeing(
  citizenId: string | undefined,
  state: WellbeingState,
  exposureState: EnvironmentalExposureState,
  config: WellbeingConfig = WELLBEING_CONFIG,
): WellbeingExplanation | undefined {
  if (!citizenId) return undefined;
  const citizen = state.citizens.find((entry) => entry.citizenId === citizenId);
  const exposure = exposureState.citizenProfiles.find(
    (entry) => entry.citizenId === citizenId,
  );
  if (!citizen || !exposure) return undefined;
  const staticStressors = [
    ['road noise near home', citizen.staticFactors.homeRoadNoise.stress],
    ['dense home surroundings', citizen.staticFactors.homeDensityPressure.stress],
    ['home crowding', citizen.staticFactors.homeCrowding.stress],
    ['road noise near work', citizen.staticFactors.workplaceRoadNoise.stress],
    ['dense work surroundings', citizen.staticFactors.workplaceDensityPressure.stress],
  ] as const;
  const restorative = [
    ['green access near home', citizen.staticFactors.homeGreen.calm],
    ['green access near work', citizen.staticFactors.workplaceGreen.calm],
  ] as const;
  return {
    citizen,
    exposure,
    dominantStaticStressors: staticStressors
      .filter(
        ([, contribution]) =>
          contribution >= config.explanationContributionThreshold,
      )
      .sort((first, second) => second[1] - first[1])
      .slice(0, config.maximumDominantStressors)
      .map(([label]) => label),
    restorativeFactors: restorative
      .filter(
        ([, contribution]) =>
          contribution >= config.explanationContributionThreshold,
      )
      .sort((first, second) => second[1] - first[1])
      .map(([label]) => label),
  };
}
