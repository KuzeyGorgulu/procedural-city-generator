import type { BuildingUse, ZoneType } from '../world/types';
import type {
  BuildingOccupancy,
  Citizen,
  Household,
  PopulationMetrics,
  Workplace,
} from './types';

const EMPTY_ZONE_COUNTS: Record<ZoneType, number> = {
  residential: 0,
  commercial: 0,
  industrial: 0,
  'mixed-use': 0,
  civic: 0,
  green: 0,
};

const EMPTY_USE_COUNTS: Record<BuildingUse, number> = {
  residential: 0,
  commercial: 0,
  industrial: 0,
  'mixed-use': 0,
  civic: 0,
};

export function calculatePopulationMetrics(
  households: readonly Household[],
  citizens: readonly Citizen[],
  workplaces: readonly Workplace[],
  occupancy: readonly BuildingOccupancy[],
): PopulationMetrics {
  const dwellingCapacity = occupancy.reduce(
    (total, entry) => total + entry.dwellingCapacity,
    0,
  );
  const occupiedDwellings = occupancy.reduce(
    (total, entry) => total + entry.occupiedDwellings,
    0,
  );
  const residentCapacity = occupancy.reduce(
    (total, entry) => total + entry.residentCapacity,
    0,
  );
  const totalJobCapacity = workplaces.reduce(
    (total, workplace) => total + workplace.jobCapacity,
    0,
  );
  const filledJobs = workplaces.reduce(
    (total, workplace) => total + workplace.filledJobs,
    0,
  );
  const workingAgePopulation = citizens.filter(
    (citizen) => citizen.workforceEligible,
  ).length;
  const laborForcePopulation = citizens.filter(
    (citizen) => citizen.laborForceParticipant,
  ).length;
  const employedPopulation = citizens.filter(
    (citizen) => citizen.employmentStatus === 'employed',
  ).length;
  const unemployedPopulation = citizens.filter(
    (citizen) => citizen.employmentStatus === 'unemployed',
  ).length;
  const notInLaborForcePopulation = citizens.filter(
    (citizen) => citizen.employmentStatus === 'not-in-labor-force',
  ).length;
  const residentsByZone = { ...EMPTY_ZONE_COUNTS };
  const jobsByBuildingUse = { ...EMPTY_USE_COUNTS };
  for (const entry of occupancy) {
    residentsByZone[entry.buildingUse] += entry.residentCount;
  }
  for (const workplace of workplaces) {
    jobsByBuildingUse[workplace.use] += workplace.filledJobs;
  }

  return {
    totalPopulation: citizens.length,
    householdCount: households.length,
    averageHouseholdSize:
      households.length === 0 ? 0 : citizens.length / households.length,
    residentialBuildingsUsed: occupancy.filter(
      (entry) => entry.residentCount > 0,
    ).length,
    dwellingCapacity,
    occupiedDwellings,
    residentCapacity,
    housingOccupancyRatio:
      dwellingCapacity === 0 ? 0 : occupiedDwellings / dwellingCapacity,
    workingAgePopulation,
    laborForcePopulation,
    employedPopulation,
    unemployedPopulation,
    notInLaborForcePopulation,
    notWorkingAgePopulation: citizens.length - workingAgePopulation,
    laborForceParticipationRate:
      workingAgePopulation === 0
        ? 0
        : laborForcePopulation / workingAgePopulation,
    employmentRate:
      laborForcePopulation === 0
        ? 0
        : employedPopulation / laborForcePopulation,
    unemploymentRate:
      laborForcePopulation === 0
        ? 0
        : unemployedPopulation / laborForcePopulation,
    totalJobCapacity,
    filledJobs,
    vacantJobs: totalJobCapacity - filledJobs,
    residentsByZone,
    jobsByBuildingUse,
  };
}
