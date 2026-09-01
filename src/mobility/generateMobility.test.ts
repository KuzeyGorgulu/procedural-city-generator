import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generateWorld';
import { generatePopulation } from '../population/generatePopulation';
import type { Citizen, PopulationState } from '../population/types';
import { buildTrafficNetwork } from '../simulation/traffic/trafficNetwork';
import { generateMobility } from './generateMobility';
import {
  buildMobilityIndex,
  getDailyPlanForCitizen,
  getTripById,
  getTripsForCitizen,
} from './queries';

function expectFiniteNonNegative(values: readonly number[]): void {
  expect(
    values.every((value) => Number.isFinite(value) && value >= 0),
  ).toBe(true);
}

describe('generateMobility', () => {
  it('is deeply deterministic, versioned, and seed-diverse', () => {
    const world = generateWorld({ seed: 'mobility-repeatability' });
    const population = generatePopulation(world);
    const first = generateMobility(world, population);
    const repeated = generateMobility(world, population);
    const differentWorld = generateWorld({ seed: 'mobility-diversity' });
    const different = generateMobility(
      differentWorld,
      generatePopulation(differentWorld),
    );

    expect(repeated).toEqual(first);
    expect(first.mobilityVersion).toBe('phase-7.0');
    expect(different).not.toEqual(first);
  });

  it('isolates each citizen RNG domain from unrelated citizens', () => {
    const world = generateWorld({ seed: 'mobility-rng-isolation' });
    const population = generatePopulation(world);
    const baseline = generateMobility(world, population);
    const template = population.citizens[0];
    expect(template).toBeDefined();
    const unrelatedCitizen: Citizen = {
      ...template!,
      id: 'citizen-unrelated-rng-probe',
      workforceEligible: false,
      laborForceParticipant: false,
      employmentStatus: 'not-working-age',
      workplaceId: undefined,
      workBuildingId: undefined,
    };
    const extendedPopulation: PopulationState = {
      ...population,
      citizens: [...population.citizens, unrelatedCitizen],
    };
    const extended = generateMobility(world, extendedPopulation);

    expect(
      extended.dailyPlans.filter(
        (plan) => plan.citizenId !== unrelatedCitizen.id,
      ),
    ).toEqual(baseline.dailyPlans);
    expect(extended.commuteTrips).toEqual(baseline.commuteTrips);
  });

  it('creates coherent schedules, stable references, and valid routes', () => {
    const world = generateWorld({ seed: 'phase-zero' });
    const population = generatePopulation(world);
    const beforeWorld = JSON.stringify(world);
    const beforePopulation = JSON.stringify(population);
    const mobility = generateMobility(world, population);
    const network = buildTrafficNetwork(world);
    const citizensById = new Map(
      population.citizens.map((citizen) => [citizen.id, citizen]),
    );
    const buildingIds = new Set(
      world.urban.buildings.map((building) => building.id),
    );
    const tripIds = new Set(mobility.commuteTrips.map((trip) => trip.id));

    expect(mobility.dailyPlans).toHaveLength(population.citizens.length);
    expect(tripIds.size).toBe(mobility.commuteTrips.length);
    expect(mobility.metrics.employedCommuters).toBe(
      population.metrics.employedPopulation,
    );
    expect(mobility.metrics.plannedCommuteTrips).toBe(
      population.metrics.employedPopulation * 2,
    );
    const workStartMinutes: number[] = [];

    for (const plan of mobility.dailyPlans) {
      const citizen = citizensById.get(plan.citizenId);
      expect(citizen).toBeDefined();
      expect(plan.activities[0]?.startMinute).toBe(0);
      expect(plan.activities.at(-1)?.endMinute).toBe(1_440);
      for (let index = 0; index < plan.activities.length; index += 1) {
        const activity = plan.activities[index];
        expect(activity.startMinute).toBeGreaterThanOrEqual(0);
        expect(activity.startMinute).toBeLessThan(activity.endMinute);
        expect(activity.endMinute).toBeLessThanOrEqual(1_440);
        if (index > 0) {
          expect(activity.startMinute).toBeGreaterThanOrEqual(
            plan.activities[index - 1].endMinute,
          );
        }
      }
      if (citizen?.employmentStatus === 'employed') {
        expect(plan.activities.map((activity) => activity.type)).toEqual([
          'home',
          'commute-to-work',
          'work',
          'commute-home',
          'home',
        ]);
        expect(plan.activities[1].tripId).toBe(`trip/${citizen.id}/work`);
        expect(plan.activities[3].tripId).toBe(`trip/${citizen.id}/home`);
        workStartMinutes.push(plan.activities[2].startMinute);
        expect(plan.activities[2].startMinute).toBeGreaterThanOrEqual(420);
        expect(plan.activities[2].startMinute).toBeLessThanOrEqual(600);
        expect(
          plan.activities[2].endMinute - plan.activities[2].startMinute,
        ).toBeGreaterThanOrEqual(450);
        expect(
          plan.activities[2].endMinute - plan.activities[2].startMinute,
        ).toBeLessThanOrEqual(540);
      } else {
        expect(plan.activities.map((activity) => activity.type)).toEqual([
          'home',
        ]);
      }
    }

    expect(new Set(workStartMinutes).size).toBeGreaterThan(1);
    expect(
      new Set(
        mobility.commuteTrips
          .filter((trip) => trip.purpose === 'commute-to-work')
          .map((trip) => trip.plannedDepartureMinute),
      ).size,
    ).toBeGreaterThan(1);

    for (const trip of mobility.commuteTrips) {
      const citizen = citizensById.get(trip.citizenId);
      expect(citizen?.employmentStatus).toBe('employed');
      expect(trip.id).toBe(
        `trip/${trip.citizenId}/${
          trip.purpose === 'commute-to-work' ? 'work' : 'home'
        }`,
      );
      if (trip.routingStatus !== 'routable' || !citizen) continue;
      expect(buildingIds.has(trip.originBuildingId)).toBe(true);
      expect(buildingIds.has(trip.destinationBuildingId)).toBe(true);
      expect(trip.destinationBuildingId).toBe(
        trip.purpose === 'commute-to-work'
          ? citizen.workBuildingId
          : citizen.homeBuildingId,
      );
      let nodeId = trip.originAccessNodeId;
      for (const arcId of trip.route.arcIds) {
        const arc = network.arcsById.get(arcId);
        expect(arc).toBeDefined();
        expect(arc?.from).toBe(nodeId);
        nodeId = arc?.to ?? nodeId;
      }
      expect(nodeId).toBe(trip.destinationAccessNodeId);
      expect(trip.route.originNodeId).toBe(trip.originAccessNodeId);
      expect(trip.route.destinationNodeId).toBe(trip.destinationAccessNodeId);
      expectFiniteNonNegative([
        trip.estimatedNetworkDistance,
        trip.estimatedNetworkTravelTime,
      ]);
    }

    expect(JSON.stringify(world)).toBe(beforeWorld);
    expect(JSON.stringify(population)).toBe(beforePopulation);
  });

  it('provides indexed citizen and trip queries', () => {
    const world = generateWorld({ seed: 'mobility-queries' });
    const population = generatePopulation(world);
    const mobility = generateMobility(world, population);
    const index = buildMobilityIndex(mobility);
    const employed = population.citizens.find(
      (citizen) => citizen.employmentStatus === 'employed',
    );
    expect(employed).toBeDefined();
    const trips = getTripsForCitizen(index, employed!.id);
    expect(trips.map((trip) => trip.id)).toEqual([
      `trip/${employed!.id}/work`,
      `trip/${employed!.id}/home`,
    ]);
    expect(getDailyPlanForCitizen(index, employed!.id)?.citizenId).toBe(
      employed!.id,
    );
    expect(getTripById(index, trips[0].id)).toBe(trips[0]);
  });

  it.each(['memleket', 'coast', 'mountain', 'şehir 🚗'])(
    'keeps multi-seed commute data valid and finite for %s',
    (seed) => {
      const world = generateWorld({ seed });
      const population = generatePopulation(world);
      const mobility = generateMobility(world, population);
      const metrics = mobility.metrics;
      expect(metrics.employedCommuters).toBe(population.metrics.employedPopulation);
      expect(metrics.plannedCommuteTrips).toBe(metrics.employedCommuters * 2);
      expect(metrics.routableTrips + metrics.unreachableTrips).toBe(
        metrics.plannedCommuteTrips,
      );
      expectFiniteNonNegative([
        metrics.averageEstimatedCommuteDistance,
        metrics.averageEstimatedCommuteTime,
        metrics.morning.averageEstimatedDistance,
        metrics.morning.averageEstimatedTravelTime,
        metrics.evening.averageEstimatedDistance,
        metrics.evening.averageEstimatedTravelTime,
        ...Object.values(metrics).filter(
          (value): value is number => typeof value === 'number',
        ),
        ...Object.values(metrics.morning),
        ...Object.values(metrics.evening),
      ]);
      expect(generateMobility(world, population)).toEqual(mobility);
    },
  );
});
