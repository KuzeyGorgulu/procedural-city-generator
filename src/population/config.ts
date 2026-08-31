import type { WorkplaceUse } from './types';

export interface HouseholdSizeWeight {
  readonly size: number;
  readonly weight: number;
}

export interface PopulationConfig {
  readonly populationVersion: string;
  readonly averageDwellingArea: number;
  readonly residentCapacityPerDwelling: number;
  readonly mixedUseResidentialShare: number;
  readonly mixedUseEmploymentShare: number;
  readonly housingOccupancyRange: readonly [number, number];
  readonly householdSizeDistribution: readonly HouseholdSizeWeight[];
  readonly employmentParticipationRate: number;
  readonly employmentCandidateLimit: number;
  readonly employmentCostJitterRange: readonly [number, number];
  readonly areaPerWorkerByUse: Readonly<Record<WorkplaceUse, number>>;
}

export const POPULATION_CONFIG: PopulationConfig = {
  populationVersion: 'phase-6.0',
  averageDwellingArea: 95,
  residentCapacityPerDwelling: 5,
  mixedUseResidentialShare: 0.55,
  mixedUseEmploymentShare: 0.45,
  housingOccupancyRange: [0.76, 0.91],
  householdSizeDistribution: [
    { size: 1, weight: 0.22 },
    { size: 2, weight: 0.32 },
    { size: 3, weight: 0.21 },
    { size: 4, weight: 0.2 },
    { size: 5, weight: 0.05 },
  ],
  employmentParticipationRate: 0.82,
  employmentCandidateLimit: 6,
  employmentCostJitterRange: [0.86, 1.18],
  areaPerWorkerByUse: {
    commercial: 55,
    industrial: 125,
    'mixed-use': 70,
    civic: 65,
  },
};
