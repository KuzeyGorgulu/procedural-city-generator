import type {
  BuildingId,
  BuildingUse,
  RoadNodeId,
  ZoneType,
} from '../world/types';

export type HouseholdId = string;
export type CitizenId = string;
export type WorkplaceId = string;

export type LifeStage = 'child' | 'teen' | 'working-age' | 'older-adult';
export type EmploymentStatus =
  | 'not-working-age'
  | 'not-in-labor-force'
  | 'unemployed'
  | 'employed';
export type ResidentialBuildingUse = Extract<
  BuildingUse,
  'residential' | 'mixed-use'
>;
export type WorkplaceUse = Extract<
  BuildingUse,
  'commercial' | 'industrial' | 'mixed-use' | 'civic'
>;

export interface Household {
  readonly id: HouseholdId;
  readonly homeBuildingId: BuildingId;
  readonly memberCitizenIds: readonly CitizenId[];
  readonly householdSize: number;
}

export interface Citizen {
  readonly id: CitizenId;
  readonly householdId: HouseholdId;
  readonly homeBuildingId: BuildingId;
  readonly age: number;
  readonly lifeStage: LifeStage;
  readonly workforceEligible: boolean;
  readonly laborForceParticipant: boolean;
  readonly employmentStatus: EmploymentStatus;
  readonly workplaceId?: WorkplaceId;
  readonly workBuildingId?: BuildingId;
}

export interface Workplace {
  readonly id: WorkplaceId;
  readonly buildingId: BuildingId;
  readonly use: WorkplaceUse;
  readonly jobCapacity: number;
  readonly filledJobs: number;
  readonly workerIds: readonly CitizenId[];
  readonly accessNodeId?: RoadNodeId;
  readonly roadComponentId?: string;
}

export interface BuildingOccupancy {
  readonly buildingId: BuildingId;
  readonly buildingUse: BuildingUse;
  readonly residentialUsableArea: number;
  readonly employmentUsableArea: number;
  readonly dwellingCapacity: number;
  readonly residentCapacity: number;
  readonly occupiedDwellings: number;
  readonly residentCount: number;
  readonly housingOccupancyRatio: number;
  readonly householdIds: readonly HouseholdId[];
  readonly jobCapacity: number;
  readonly filledJobs: number;
  readonly employmentOccupancyRatio: number;
  readonly accessNodeId?: RoadNodeId;
  readonly roadComponentId?: string;
}

export interface PopulationMetrics {
  readonly totalPopulation: number;
  readonly householdCount: number;
  readonly averageHouseholdSize: number;
  readonly residentialBuildingsUsed: number;
  readonly dwellingCapacity: number;
  readonly occupiedDwellings: number;
  readonly residentCapacity: number;
  readonly housingOccupancyRatio: number;
  readonly workingAgePopulation: number;
  readonly laborForcePopulation: number;
  readonly employedPopulation: number;
  readonly unemployedPopulation: number;
  readonly notInLaborForcePopulation: number;
  readonly notWorkingAgePopulation: number;
  readonly laborForceParticipationRate: number;
  readonly employmentRate: number;
  readonly unemploymentRate: number;
  readonly totalJobCapacity: number;
  readonly filledJobs: number;
  readonly vacantJobs: number;
  readonly residentsByZone: Readonly<Record<ZoneType, number>>;
  readonly jobsByBuildingUse: Readonly<Record<BuildingUse, number>>;
}

export interface PopulationState {
  readonly populationVersion: string;
  readonly populationSeed: string;
  readonly households: readonly Household[];
  readonly citizens: readonly Citizen[];
  readonly workplaces: readonly Workplace[];
  readonly buildingOccupancy: readonly BuildingOccupancy[];
  readonly metrics: PopulationMetrics;
}
