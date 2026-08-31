import { describe, expect, it } from 'vitest';
import type { Building, BuildingUse } from '../world/types';
import { deriveBuildingCapacity } from './capacity';
import { POPULATION_CONFIG } from './config';

function createBuilding(use: BuildingUse, usableFloorArea = 9_500): Building {
  return {
    id: `building-${use}`,
    parcelId: `parcel-${use}`,
    blockId: `block-${use}`,
    zone: use,
    use,
    footprint: [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
      { x: 0, y: 20 },
    ],
    footprintArea: 400,
    floorCount: 2,
    height: 6.4,
    grossFloorArea: usableFloorArea / 0.8,
    usableFloorArea,
    primaryFrontageEdgeIndex: 0,
    frontageRoadEdgeId: 'road-edge',
  };
}

describe('population building capacity', () => {
  it('derives housing only from residential-capable buildings', () => {
    const residential = deriveBuildingCapacity(createBuilding('residential'));
    const commercial = deriveBuildingCapacity(createBuilding('commercial'));
    const industrial = deriveBuildingCapacity(createBuilding('industrial'));

    expect(residential.dwellingCapacity).toBe(100);
    expect(residential.residentCapacity).toBe(
      100 * POPULATION_CONFIG.residentCapacityPerDwelling,
    );
    expect(residential.jobCapacity).toBe(0);
    expect(commercial.dwellingCapacity).toBe(0);
    expect(industrial.dwellingCapacity).toBe(0);
  });

  it('partitions mixed-use area once between homes and employment', () => {
    const building = createBuilding('mixed-use', 10_000);
    const before = JSON.stringify(building);
    const capacity = deriveBuildingCapacity(building);

    expect(capacity.residentialUsableArea).toBe(
      10_000 * POPULATION_CONFIG.mixedUseResidentialShare,
    );
    expect(capacity.employmentUsableArea).toBe(
      10_000 * POPULATION_CONFIG.mixedUseEmploymentShare,
    );
    expect(
      capacity.residentialUsableArea + capacity.employmentUsableArea,
    ).toBeCloseTo(building.usableFloorArea);
    expect(capacity.dwellingCapacity).toBeGreaterThan(0);
    expect(capacity.jobCapacity).toBeGreaterThan(0);
    expect(JSON.stringify(building)).toBe(before);
  });

  it('uses distinct transparent worker-density assumptions by use', () => {
    const commercial = deriveBuildingCapacity(createBuilding('commercial'));
    const civic = deriveBuildingCapacity(createBuilding('civic'));
    const industrial = deriveBuildingCapacity(createBuilding('industrial'));

    expect(commercial.jobCapacity).toBeGreaterThan(civic.jobCapacity);
    expect(civic.jobCapacity).toBeGreaterThan(industrial.jobCapacity);
  });
});
