import type { BuildingId } from '../world/types';
import type {
  BuildingOccupancy,
  Citizen,
  CitizenId,
  Household,
  HouseholdId,
  PopulationState,
  Workplace,
  WorkplaceId,
} from './types';

export function getCitizen(
  population: PopulationState,
  citizenId: CitizenId,
): Citizen | undefined {
  return population.citizens.find((citizen) => citizen.id === citizenId);
}

export function getHousehold(
  population: PopulationState,
  householdId: HouseholdId,
): Household | undefined {
  return population.households.find((household) => household.id === householdId);
}

export function getWorkplace(
  population: PopulationState,
  workplaceId: WorkplaceId,
): Workplace | undefined {
  return population.workplaces.find((workplace) => workplace.id === workplaceId);
}

export function getBuildingOccupancy(
  population: PopulationState,
  buildingId: BuildingId,
): BuildingOccupancy | undefined {
  return population.buildingOccupancy.find(
    (occupancy) => occupancy.buildingId === buildingId,
  );
}

export function getResidentsForBuilding(
  population: PopulationState,
  buildingId: BuildingId,
): Citizen[] {
  return population.citizens.filter(
    (citizen) => citizen.homeBuildingId === buildingId,
  );
}

export function getWorkersForBuilding(
  population: PopulationState,
  buildingId: BuildingId,
): Citizen[] {
  return population.citizens.filter(
    (citizen) => citizen.workBuildingId === buildingId,
  );
}
