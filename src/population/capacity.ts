import type { Building, BuildingUse, World } from '../world/types';
import type { PopulationConfig } from './config';
import { POPULATION_CONFIG } from './config';
import type {
  ResidentialBuildingUse,
  WorkplaceUse,
} from './types';

export interface BuildingCapacityProfile {
  readonly buildingId: string;
  readonly buildingUse: BuildingUse;
  readonly residentialUsableArea: number;
  readonly employmentUsableArea: number;
  readonly dwellingCapacity: number;
  readonly residentCapacity: number;
  readonly jobCapacity: number;
}

function isResidentialUse(
  use: BuildingUse,
): use is ResidentialBuildingUse {
  return use === 'residential' || use === 'mixed-use';
}

function isWorkplaceUse(use: BuildingUse): use is WorkplaceUse {
  return (
    use === 'commercial' ||
    use === 'industrial' ||
    use === 'mixed-use' ||
    use === 'civic'
  );
}

export function deriveBuildingCapacity(
  building: Building,
  config: PopulationConfig = POPULATION_CONFIG,
): BuildingCapacityProfile {
  const residentialUsableArea =
    building.use === 'residential'
      ? building.usableFloorArea
      : building.use === 'mixed-use'
        ? building.usableFloorArea * config.mixedUseResidentialShare
        : 0;
  const employmentUsableArea =
    building.use === 'mixed-use'
      ? building.usableFloorArea * config.mixedUseEmploymentShare
      : isWorkplaceUse(building.use)
        ? building.usableFloorArea
        : 0;
  const dwellingCapacity = isResidentialUse(building.use)
    ? Math.max(0, Math.floor(residentialUsableArea / config.averageDwellingArea))
    : 0;
  const jobCapacity = isWorkplaceUse(building.use)
    ? Math.max(
        0,
        Math.floor(
          employmentUsableArea / config.areaPerWorkerByUse[building.use],
        ),
      )
    : 0;
  return {
    buildingId: building.id,
    buildingUse: building.use,
    residentialUsableArea,
    employmentUsableArea,
    dwellingCapacity,
    residentCapacity:
      dwellingCapacity * config.residentCapacityPerDwelling,
    jobCapacity,
  };
}

export function deriveBuildingCapacities(
  world: World,
  config: PopulationConfig = POPULATION_CONFIG,
): BuildingCapacityProfile[] {
  return [...world.urban.buildings]
    .sort((first, second) => first.id.localeCompare(second.id))
    .map((building) => deriveBuildingCapacity(building, config));
}
