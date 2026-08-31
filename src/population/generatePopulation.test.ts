import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generateWorld';
import { buildTrafficNetwork } from '../simulation/traffic/trafficNetwork';
import { createInitialTrafficState } from '../simulation/traffic/spawning';
import { POPULATION_CONFIG } from './config';
import { generatePopulation } from './generatePopulation';
import { createDisconnectedPopulationWorld } from './populationTestFixtures';
import {
  getBuildingOccupancy,
  getCitizen,
  getHousehold,
  getResidentsForBuilding,
  getWorkersForBuilding,
  getWorkplace,
} from './queries';

function expectUnique(values: readonly string[]): void {
  expect(new Set(values).size).toBe(values.length);
}

describe('generatePopulation', () => {
  it('is deterministic with stable parent-derived IDs and seed diversity', () => {
    const world = generateWorld({ seed: 'population-repeatability' });
    const first = generatePopulation(world);
    const repeated = generatePopulation(world);
    const different = generatePopulation(
      generateWorld({ seed: 'population-diversity' }),
    );

    expect(repeated).toEqual(first);
    expect(different).not.toEqual(first);
    expect(first.populationVersion).toBe('phase-6.0');
    expect(world.metadata.generatorVersion).toBe('phase-5.0');
    expect(repeated.households.map((entry) => entry.id)).toEqual(
      first.households.map((entry) => entry.id),
    );
    expect(repeated.citizens.map((entry) => entry.id)).toEqual(
      first.citizens.map((entry) => entry.id),
    );
    expect(repeated.workplaces.map((entry) => entry.id)).toEqual(
      first.workplaces.map((entry) => entry.id),
    );
  });

  it.each([
    { seed: 'phase-zero', unemployed: 0, notInLaborForce: 475 },
    { seed: 'memleket', unemployed: 0, notInLaborForce: 987 },
    { seed: 'coast', unemployed: 0, notInLaborForce: 527 },
    { seed: 'mountain', unemployed: 0, notInLaborForce: 622 },
    { seed: 'şehir 🚗', unemployed: 634, notInLaborForce: 1_069 },
  ])(
    'satisfies household, citizen, capacity, employment, and metric invariants for $seed',
    ({ seed, unemployed, notInLaborForce }) => {
      const world = generateWorld({ seed });
      const population = generatePopulation(world);
      const buildingsById = new Map(
        world.urban.buildings.map((building) => [building.id, building]),
      );
      const occupancyByBuildingId = new Map(
        population.buildingOccupancy.map((entry) => [entry.buildingId, entry]),
      );
      const householdsById = new Map(
        population.households.map((household) => [household.id, household]),
      );
      const citizensById = new Map(
        population.citizens.map((citizen) => [citizen.id, citizen]),
      );
      const workplacesById = new Map(
        population.workplaces.map((workplace) => [workplace.id, workplace]),
      );

      expectUnique(population.households.map((entry) => entry.id));
      expectUnique(population.citizens.map((entry) => entry.id));
      expectUnique(population.workplaces.map((entry) => entry.id));
      expect(population.buildingOccupancy).toHaveLength(
        world.urban.buildings.length,
      );
      expect(population.metrics.totalPopulation).toBeGreaterThan(0);
      expect(population.metrics.housingOccupancyRatio).toBeGreaterThan(0.7);
      expect(population.metrics.housingOccupancyRatio).toBeLessThan(1);
      expect(population.metrics.laborForceParticipationRate).toBeGreaterThan(0);
      expect(population.metrics.laborForceParticipationRate).toBeLessThan(1);
      expect(population.metrics.employmentRate).toBeGreaterThan(0.5);
      expect(population.metrics.employmentRate).toBeLessThanOrEqual(1);
      expect(population.metrics.unemploymentRate).toBeGreaterThanOrEqual(0);
      expect(population.metrics.unemploymentRate).toBeLessThan(1);
      expect(population.metrics.unemployedPopulation).toBe(unemployed);
      expect(population.metrics.notInLaborForcePopulation).toBe(
        notInLaborForce,
      );

      for (const occupancy of population.buildingOccupancy) {
        const building = buildingsById.get(occupancy.buildingId);
        expect(building).toBeDefined();
        expect(
          [
            occupancy.residentialUsableArea,
            occupancy.employmentUsableArea,
            occupancy.dwellingCapacity,
            occupancy.residentCapacity,
            occupancy.occupiedDwellings,
            occupancy.residentCount,
            occupancy.jobCapacity,
            occupancy.filledJobs,
          ].every((value) => Number.isFinite(value) && value >= 0),
        ).toBe(true);
        expect(occupancy.occupiedDwellings).toBeLessThanOrEqual(
          occupancy.dwellingCapacity,
        );
        expect(occupancy.residentCount).toBeLessThanOrEqual(
          occupancy.residentCapacity,
        );
        expect(occupancy.filledJobs).toBeLessThanOrEqual(occupancy.jobCapacity);
        if (occupancy.buildingUse === 'commercial' || occupancy.buildingUse === 'industrial') {
          expect(occupancy.residentCount).toBe(0);
          expect(occupancy.dwellingCapacity).toBe(0);
        }
        if (occupancy.buildingUse === 'residential') {
          expect(occupancy.jobCapacity).toBe(0);
          expect(occupancy.filledJobs).toBe(0);
        }
        if (occupancy.buildingUse === 'mixed-use' && building) {
          expect(
            occupancy.residentialUsableArea + occupancy.employmentUsableArea,
          ).toBeCloseTo(building.usableFloorArea);
        }
      }

      const membershipCount = new Map<string, number>();
      for (const household of population.households) {
        const home = occupancyByBuildingId.get(household.homeBuildingId);
        expect(household.id.startsWith(`household-${household.homeBuildingId}-`)).toBe(
          true,
        );
        expect(household.householdSize).toBeGreaterThanOrEqual(1);
        expect(household.householdSize).toBeLessThanOrEqual(5);
        expect(household.memberCitizenIds).toHaveLength(household.householdSize);
        expect(home?.dwellingCapacity).toBeGreaterThan(0);
        expect(['residential', 'mixed-use']).toContain(home?.buildingUse);
        for (const citizenId of household.memberCitizenIds) {
          expect(citizensById.has(citizenId)).toBe(true);
          membershipCount.set(citizenId, (membershipCount.get(citizenId) ?? 0) + 1);
        }
      }

      for (const citizen of population.citizens) {
        const household = householdsById.get(citizen.householdId);
        const home = occupancyByBuildingId.get(citizen.homeBuildingId);
        expect(citizen.id.startsWith(`citizen-${citizen.householdId}-`)).toBe(
          true,
        );
        expect(household?.homeBuildingId).toBe(citizen.homeBuildingId);
        expect(household?.memberCitizenIds).toContain(citizen.id);
        expect(membershipCount.get(citizen.id)).toBe(1);
        expect(home?.residentCount).toBeGreaterThan(0);
        if (citizen.employmentStatus === 'employed') {
          const workplace = citizen.workplaceId
            ? workplacesById.get(citizen.workplaceId)
            : undefined;
          const work = citizen.workBuildingId
            ? occupancyByBuildingId.get(citizen.workBuildingId)
            : undefined;
          expect(citizen.workforceEligible).toBe(true);
          expect(citizen.lifeStage).toBe('working-age');
          expect(citizen.laborForceParticipant).toBe(true);
          expect(workplace?.buildingId).toBe(citizen.workBuildingId);
          expect(workplace?.workerIds).toContain(citizen.id);
          expect(work?.roadComponentId).toBe(home?.roadComponentId);
        } else if (citizen.employmentStatus === 'unemployed') {
          expect(citizen.workforceEligible).toBe(true);
          expect(citizen.lifeStage).toBe('working-age');
          expect(citizen.laborForceParticipant).toBe(true);
          expect(citizen.workplaceId).toBeUndefined();
          expect(citizen.workBuildingId).toBeUndefined();
        } else if (citizen.employmentStatus === 'not-in-labor-force') {
          expect(citizen.workforceEligible).toBe(true);
          expect(citizen.lifeStage).toBe('working-age');
          expect(citizen.laborForceParticipant).toBe(false);
          expect(citizen.workplaceId).toBeUndefined();
          expect(citizen.workBuildingId).toBeUndefined();
        } else {
          expect(citizen.workforceEligible).toBe(false);
          expect(citizen.lifeStage).not.toBe('working-age');
          expect(citizen.laborForceParticipant).toBe(false);
          expect(citizen.workplaceId).toBeUndefined();
          expect(citizen.workBuildingId).toBeUndefined();
        }
      }

      for (const workplace of population.workplaces) {
        const building = buildingsById.get(workplace.buildingId);
        expect(building).toBeDefined();
        expect(workplace.id).toBe(`workplace-${workplace.buildingId}`);
        expect(['commercial', 'industrial', 'mixed-use', 'civic']).toContain(
          workplace.use,
        );
        expect(workplace.workerIds).toHaveLength(workplace.filledJobs);
        expect(workplace.filledJobs).toBeLessThanOrEqual(workplace.jobCapacity);
        expectUnique(workplace.workerIds);
      }

      expect(
        population.buildingOccupancy.reduce(
          (total, entry) => total + entry.residentCount,
          0,
        ),
      ).toBe(population.metrics.totalPopulation);
      expect(
        population.households.reduce(
          (total, household) => total + household.memberCitizenIds.length,
          0,
        ),
      ).toBe(population.metrics.totalPopulation);
      expect(population.metrics.householdCount).toBe(
        population.households.length,
      );
      expect(population.metrics.laborForcePopulation).toBe(
        population.metrics.employedPopulation +
          population.metrics.unemployedPopulation,
      );
      expect(population.metrics.workingAgePopulation).toBe(
        population.metrics.laborForcePopulation +
          population.metrics.notInLaborForcePopulation,
      );
      expect(population.metrics.notWorkingAgePopulation).toBe(
        population.metrics.totalPopulation -
          population.metrics.workingAgePopulation,
      );
      expect(population.metrics.laborForceParticipationRate).toBeCloseTo(
        population.metrics.laborForcePopulation /
          population.metrics.workingAgePopulation,
      );
      expect(population.metrics.employmentRate).toBeCloseTo(
        population.metrics.employedPopulation /
          population.metrics.laborForcePopulation,
      );
      expect(population.metrics.unemploymentRate).toBeCloseTo(
        population.metrics.unemployedPopulation /
          population.metrics.laborForcePopulation,
      );
      expect(population.metrics.filledJobs).toBe(
        population.metrics.employedPopulation,
      );
      expect(population.metrics.vacantJobs).toBe(
        population.metrics.totalJobCapacity - population.metrics.filledJobs,
      );
      expect(
        Math.max(
          ...population.buildingOccupancy.map((entry) => entry.residentCount),
        ),
      ).toBeLessThan(population.metrics.totalPopulation * 0.2);
    },
  );

  it('leaves workers unassigned when jobs are in another road component', () => {
    const world = createDisconnectedPopulationWorld();
    const population = generatePopulation(world, {
      ...POPULATION_CONFIG,
      averageDwellingArea: 950,
      employmentParticipationRate: 1,
    });

    expect(population.metrics.workingAgePopulation).toBeGreaterThan(0);
    expect(population.metrics.totalJobCapacity).toBeGreaterThan(0);
    expect(population.metrics.employedPopulation).toBe(0);
    expect(population.metrics.filledJobs).toBe(0);
    expect(population.metrics.notInLaborForcePopulation).toBe(0);
    expect(population.metrics.laborForcePopulation).toBe(
      population.metrics.workingAgePopulation,
    );
    expect(
      population.citizens
        .filter((citizen) => citizen.workforceEligible)
        .every(
          (citizen) =>
            citizen.laborForceParticipant &&
            citizen.employmentStatus === 'unemployed' &&
            citizen.workplaceId === undefined &&
            citizen.workBuildingId === undefined,
        ),
    ).toBe(true);
  });

  it('does not mutate the world or independent traffic state', () => {
    const world = generateWorld({ seed: 'population-immutability' });
    const traffic = createInitialTrafficState(world, buildTrafficNetwork(world));
    const worldBefore = JSON.stringify(world);
    const trafficBefore = JSON.stringify(traffic);

    generatePopulation(world);

    expect(JSON.stringify(world)).toBe(worldBefore);
    expect(JSON.stringify(traffic)).toBe(trafficBefore);
    expect(generateWorld({ seed: 'population-immutability' })).toEqual(world);
  });

  it('provides stable code-level entity and building queries', () => {
    const population = generatePopulation(generateWorld({ seed: 'population-queries' }));
    const citizen = population.citizens[0];
    const household = population.households[0];
    const workplace = population.workplaces[0];
    const occupancy = population.buildingOccupancy.find(
      (entry) => entry.residentCount > 0,
    );

    expect(getCitizen(population, citizen.id)).toBe(citizen);
    expect(getHousehold(population, household.id)).toBe(household);
    expect(getWorkplace(population, workplace.id)).toBe(workplace);
    expect(getBuildingOccupancy(population, occupancy!.buildingId)).toBe(occupancy);
    expect(getResidentsForBuilding(population, occupancy!.buildingId).length).toBe(
      occupancy!.residentCount,
    );
    expect(getWorkersForBuilding(population, workplace.buildingId).length).toBe(
      workplace.filledJobs,
    );
  });
});
