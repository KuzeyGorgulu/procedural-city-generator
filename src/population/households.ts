import type { SeededRng } from '../core/rng';
import type { PopulationAccessIndex } from './accessibility';
import type { BuildingCapacityProfile } from './capacity';
import type { PopulationConfig } from './config';
import { POPULATION_CONFIG } from './config';
import type {
  BuildingOccupancy,
  Citizen,
  Household,
  LifeStage,
} from './types';

export interface HouseholdGenerationResult {
  readonly households: readonly Household[];
  readonly citizens: readonly Citizen[];
  readonly buildingOccupancy: readonly BuildingOccupancy[];
}

function chooseHouseholdSize(
  rng: SeededRng,
  config: PopulationConfig,
): number {
  const totalWeight = config.householdSizeDistribution.reduce(
    (total, entry) => total + entry.weight,
    0,
  );
  let roll = rng.next() * totalWeight;
  for (const entry of config.householdSizeDistribution) {
    roll -= entry.weight;
    if (roll < 0) return entry.size;
  }
  return config.householdSizeDistribution.at(-1)?.size ?? 1;
}

function ageInRange(rng: SeededRng, minimum: number, maximum: number): number {
  return rng.int(minimum, maximum + 1);
}

function dependentAge(rng: SeededRng): number {
  return rng.fork('stage').next() < 0.64
    ? ageInRange(rng.fork('child-age'), 1, 12)
    : ageInRange(rng.fork('teen-age'), 13, 17);
}

function createHouseholdAges(size: number, rng: SeededRng): number[] {
  if (size <= 1) {
    return [
      rng.fork('single-stage').next() < 0.2
        ? ageInRange(rng.fork('single-older-age'), 65, 88)
        : ageInRange(rng.fork('single-adult-age'), 20, 64),
    ];
  }

  const composition = rng.fork('composition').next();
  if (size === 2 && composition < 0.14) {
    return [
      ageInRange(rng.fork('older-0'), 65, 86),
      ageInRange(rng.fork('older-1'), 65, 88),
    ];
  }
  if (size === 2 && composition < 0.32) {
    return [
      ageInRange(rng.fork('parent-0'), 24, 58),
      dependentAge(rng.fork('dependent-1')),
    ];
  }
  if (size === 2) {
    return [
      ageInRange(rng.fork('adult-0'), 20, 64),
      ageInRange(rng.fork('adult-1'), 20, 64),
    ];
  }

  const multigenerational = size >= 4 && composition < 0.08;
  const adultCount = Math.min(size, composition < 0.24 ? 1 : 2);
  const ages: number[] = [];
  for (let index = 0; index < adultCount; index += 1) {
    ages.push(ageInRange(rng.fork(`adult-${index}`), 24, 58));
  }
  if (multigenerational && ages.length < size) {
    ages.push(ageInRange(rng.fork('older-relative'), 65, 88));
  }
  while (ages.length < size) {
    ages.push(dependentAge(rng.fork(`dependent-${ages.length}`)));
  }
  return ages;
}

export function getLifeStage(age: number): LifeStage {
  if (age <= 12) return 'child';
  if (age <= 17) return 'teen';
  if (age <= 64) return 'working-age';
  return 'older-adult';
}

export function generateHouseholdsAndCitizens(
  capacities: readonly BuildingCapacityProfile[],
  accessIndex: PopulationAccessIndex,
  householdRng: SeededRng,
  citizenRng: SeededRng,
  config: PopulationConfig = POPULATION_CONFIG,
): HouseholdGenerationResult {
  const households: Household[] = [];
  const citizens: Citizen[] = [];
  const buildingOccupancy: BuildingOccupancy[] = [];
  const [minimumOccupancy, maximumOccupancy] = config.housingOccupancyRange;

  for (const capacity of capacities) {
    const access = accessIndex.buildingAccessById.get(capacity.buildingId);
    const occupancyRate = householdRng
      .fork(`building/${capacity.buildingId}/occupancy`)
      .float(minimumOccupancy, maximumOccupancy);
    const occupiedDwellings = Math.min(
      capacity.dwellingCapacity,
      Math.max(0, Math.round(capacity.dwellingCapacity * occupancyRate)),
    );
    const buildingHouseholdIds: string[] = [];
    let residentCount = 0;

    for (let dwellingIndex = 0; dwellingIndex < occupiedDwellings; dwellingIndex += 1) {
      const dwellingKey = dwellingIndex.toString().padStart(4, '0');
      const householdId = `household-${capacity.buildingId}-${dwellingKey}`;
      const householdSize = chooseHouseholdSize(
        householdRng.fork(
          `building/${capacity.buildingId}/dwelling/${dwellingKey}/size`,
        ),
        config,
      );
      const ages = createHouseholdAges(
        householdSize,
        citizenRng.fork(`household/${householdId}/composition`),
      );
      const memberCitizenIds = ages.map(
        (_, memberIndex) =>
          `citizen-${householdId}-${memberIndex.toString().padStart(2, '0')}`,
      );
      households.push({
        id: householdId,
        homeBuildingId: capacity.buildingId,
        memberCitizenIds,
        householdSize,
      });
      buildingHouseholdIds.push(householdId);
      residentCount += householdSize;

      for (let memberIndex = 0; memberIndex < ages.length; memberIndex += 1) {
        const age = ages[memberIndex];
        const lifeStage = getLifeStage(age);
        const workforceEligible = lifeStage === 'working-age';
        citizens.push({
          id: memberCitizenIds[memberIndex],
          householdId,
          homeBuildingId: capacity.buildingId,
          age,
          lifeStage,
          workforceEligible,
          laborForceParticipant: false,
          employmentStatus: workforceEligible
            ? 'not-in-labor-force'
            : 'not-working-age',
        });
      }
    }

    buildingOccupancy.push({
      buildingId: capacity.buildingId,
      buildingUse: capacity.buildingUse,
      residentialUsableArea: capacity.residentialUsableArea,
      employmentUsableArea: capacity.employmentUsableArea,
      dwellingCapacity: capacity.dwellingCapacity,
      residentCapacity: capacity.residentCapacity,
      occupiedDwellings,
      residentCount,
      housingOccupancyRatio:
        capacity.dwellingCapacity === 0
          ? 0
          : occupiedDwellings / capacity.dwellingCapacity,
      householdIds: buildingHouseholdIds,
      jobCapacity: capacity.jobCapacity,
      filledJobs: 0,
      employmentOccupancyRatio: 0,
      accessNodeId: access?.accessNodeId,
      roadComponentId: access?.roadComponentId,
    });
  }

  return {
    households: households.sort((first, second) => first.id.localeCompare(second.id)),
    citizens: citizens.sort((first, second) => first.id.localeCompare(second.id)),
    buildingOccupancy: buildingOccupancy.sort((first, second) =>
      first.buildingId.localeCompare(second.buildingId),
    ),
  };
}
