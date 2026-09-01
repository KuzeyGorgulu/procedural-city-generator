import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generateWorld';
import { generateMobility } from '../mobility/generateMobility';
import { generatePopulation } from '../population/generatePopulation';
import type { TrafficSimulationState } from '../simulation/traffic/types';
import {
  calculateCommuteWellbeingImpact,
  collectCompletedCommuteEvents,
} from './commuteImpact';
import { WELLBEING_DIMENSIONS } from './config';
import { generateEnvironmentalExposure } from './environmentalExposure';
import {
  initializeWellbeing,
  resetWellbeingForScenario,
} from './initializeWellbeing';
import {
  aggregateWellbeingByHomeBuilding,
  explainCitizenWellbeing,
} from './queries';
import type {
  CompletedCommuteEvent,
  EnvironmentalExposureState,
} from './types';
import {
  applyCompletedCommuteEvents,
  synchronizeWellbeingWithTraffic,
} from './updateWellbeing';

function setup(seed = 'wellbeing-foundation') {
  const world = generateWorld({ seed });
  const population = generatePopulation(world);
  const mobility = generateMobility(world, population);
  const exposure = generateEnvironmentalExposure(world, population);
  const wellbeing = initializeWellbeing(exposure, population, mobility);
  return { world, population, mobility, exposure, wellbeing };
}

function event(
  citizenId: string,
  overrides: Partial<CompletedCommuteEvent> = {},
): CompletedCommuteEvent {
  return {
    eventId: 'commute/scenario/trip-1/completed',
    scenarioSimulationSeed: 'scenario',
    tripId: 'trip-1',
    citizenId,
    purpose: 'commute-to-work',
    estimatedTravelTime: 60,
    actualTravelTime: 60,
    queueWaitTime: 0,
    actualDepartureTime: 10,
    actualArrivalTime: 70,
    ...overrides,
  };
}

function completedTraffic(
  simulationSeed: string,
  tripId: string,
): TrafficSimulationState {
  return {
    simulationVersion: 'phase-4.0-test',
    simulationSeed,
    demandMode: 'morning-commute',
    tick: 100,
    elapsedSeconds: 80,
    vehicles: [],
    targetVehicleCount: 0,
    nextVehicleSerial: 1,
    completedTrips: 1,
    totalCompletedTravelTime: 65,
    tripRuntime: [
      {
        tripId,
        status: 'completed',
        actualDepartureTime: 10,
        actualArrivalTime: 75,
        travelTime: 65,
        waitingTime: 5,
      },
    ],
    nextDemandTripIndex: 1,
    queuedTripIds: [],
    nextQueuedTripIndex: 0,
    maximumQueueSize: 1,
  };
}

describe('wellbeing state', () => {
  it('is deterministic, bounded, distinct, and keeps world layers immutable', () => {
    const { world, population, mobility, exposure, wellbeing } = setup();
    const beforeWorld = JSON.stringify(world);
    const beforePopulation = JSON.stringify(population);
    const beforeMobility = JSON.stringify(mobility);
    const beforeExposure = JSON.stringify(exposure);
    const repeated = initializeWellbeing(exposure, population, mobility);

    expect(repeated).toEqual(wellbeing);
    expect(wellbeing.wellbeingVersion).toBe('phase-8.0');
    expect(wellbeing.citizens).toHaveLength(population.citizens.length);
    for (const citizen of wellbeing.citizens) {
      for (const dimension of WELLBEING_DIMENSIONS) {
        expect(Number.isFinite(citizen.scores[dimension])).toBe(true);
        expect(citizen.scores[dimension]).toBeGreaterThanOrEqual(0);
        expect(citizen.scores[dimension]).toBeLessThanOrEqual(100);
      }
    }
    expect(
      new Set(wellbeing.citizens.map((citizen) => citizen.scores.stress.toFixed(3)))
        .size,
    ).toBeGreaterThan(1);
    expect(wellbeing.metrics.averageScores.stress).not.toBe(
      wellbeing.metrics.averageScores.tension,
    );
    expect(JSON.stringify(world)).toBe(beforeWorld);
    expect(JSON.stringify(population)).toBe(beforePopulation);
    expect(JSON.stringify(mobility)).toBe(beforeMobility);
    expect(JSON.stringify(exposure)).toBe(beforeExposure);
  }, 20_000);

  it('applies controlled static factors in the intended directions', () => {
    const { population, mobility, exposure } = setup('wellbeing-causality');
    const target = exposure.citizenProfiles[0];
    const withProfile = (
      profile: EnvironmentalExposureState['citizenProfiles'][number],
    ): EnvironmentalExposureState => ({
      ...exposure,
      citizenProfiles: [profile, ...exposure.citizenProfiles.slice(1)],
    });
    const neutralHome = {
      ...target.home,
      greenAccess: 0,
      localDensity: 0,
      roadNoiseProxy: 0,
      environmentalQuality: 0.5,
    };
    const neutral = { ...target, home: neutralHome, homeCrowding: 0 };
    const baseline = initializeWellbeing(
      withProfile(neutral),
      population,
      mobility,
    ).citizens[0];
    const green = initializeWellbeing(
      withProfile({
        ...neutral,
        home: { ...neutralHome, greenAccess: 1 },
      }),
      population,
      mobility,
    ).citizens[0];
    const noisy = initializeWellbeing(
      withProfile({
        ...neutral,
        home: { ...neutralHome, roadNoiseProxy: 1 },
      }),
      population,
      mobility,
    ).citizens[0];
    const dense = initializeWellbeing(
      withProfile({
        ...neutral,
        home: { ...neutralHome, localDensity: 1 },
      }),
      population,
      mobility,
    ).citizens[0];
    const comfortableDensity = initializeWellbeing(
      withProfile({
        ...neutral,
        home: { ...neutralHome, localDensity: 0.4 },
      }),
      population,
      mobility,
    ).citizens[0];

    expect(green.scores.calm).toBeGreaterThan(baseline.scores.calm);
    expect(green.scores.happiness).toBeGreaterThan(baseline.scores.happiness);
    expect(green.scores.stress).toBeLessThan(baseline.scores.stress);
    expect(noisy.scores.stress).toBeGreaterThan(baseline.scores.stress);
    expect(noisy.scores.calm).toBeLessThan(baseline.scores.calm);
    expect(dense.scores.stress).toBeGreaterThan(baseline.scores.stress);
    expect(dense.scores.calm).toBeLessThan(baseline.scores.calm);
    expect(comfortableDensity.scores).toEqual(baseline.scores);
  }, 20_000);

  it('makes worse commutes increase acute tension most and happiness slowest', () => {
    const normal = calculateCommuteWellbeingImpact(event('citizen'));
    const delayed = calculateCommuteWellbeingImpact(
      event('citizen', {
        eventId: 'commute/scenario/trip-2/completed',
        actualTravelTime: 180,
        queueWaitTime: 120,
      }),
    );
    expect(delayed.scoreDelta.stress).toBeGreaterThan(normal.scoreDelta.stress);
    expect(delayed.scoreDelta.tension).toBeGreaterThan(
      delayed.scoreDelta.stress,
    );
    expect(delayed.scoreDelta.calm).toBeLessThan(normal.scoreDelta.calm);
    expect(Math.abs(delayed.scoreDelta.happiness)).toBeLessThan(
      Math.abs(delayed.scoreDelta.tension),
    );
    expect(delayed.unexpectedDelay).toBeGreaterThan(0);
    expect(delayed.queueBurden).toBeGreaterThan(0);
  });

  it('applies each completion exactly once and resets reproducibly', () => {
    const { wellbeing } = setup('wellbeing-events');
    const baseline = resetWellbeingForScenario(wellbeing, 'scenario');
    const citizenId = baseline.citizens[0].citizenId;
    const completed = event(citizenId);
    const once = applyCompletedCommuteEvents(baseline, [completed]);
    const twice = applyCompletedCommuteEvents(once, [completed]);
    const reset = resetWellbeingForScenario(once, 'scenario');

    expect(once).not.toBe(baseline);
    expect(twice).toBe(once);
    expect(once.processedEventIds).toEqual([completed.eventId]);
    expect(once.citizens[0].processedCommuteCount).toBe(1);
    expect(reset).toEqual(baseline);
  }, 20_000);

  it('replays an event sequence deterministically and clamps every score', () => {
    const { wellbeing } = setup('wellbeing-bounds');
    const baseline = resetWellbeingForScenario(wellbeing, 'scenario');
    const citizenId = baseline.citizens[0].citizenId;
    const events = Array.from({ length: 80 }, (_, index) =>
      event(citizenId, {
        eventId: `commute/scenario/trip-${index}/completed`,
        tripId: `trip-${index}`,
        actualTravelTime: 600,
        queueWaitTime: 600,
      }),
    );
    const first = applyCompletedCommuteEvents(baseline, events);
    const repeated = applyCompletedCommuteEvents(baseline, events);

    expect(repeated).toEqual(first);
    for (const dimension of WELLBEING_DIMENSIONS) {
      expect(first.citizens[0].scores[dimension]).toBeGreaterThanOrEqual(0);
      expect(first.citizens[0].scores[dimension]).toBeLessThanOrEqual(100);
    }
  }, 20_000);

  it('consumes completed Phase 7 trip runtime without mutating it', () => {
    const { mobility, wellbeing } = setup('wellbeing-runtime');
    const trip = mobility.commuteTrips.find(
      (entry) => entry.routingStatus === 'routable',
    );
    expect(trip).toBeDefined();
    const traffic = completedTraffic('scenario-runtime', trip!.id);
    const beforeTraffic = JSON.stringify(traffic);
    const beforeMobility = JSON.stringify(mobility);
    const events = collectCompletedCommuteEvents(traffic, mobility);
    const updated = synchronizeWellbeingWithTraffic(
      wellbeing,
      wellbeing,
      mobility,
      traffic,
    );

    expect(events).toHaveLength(1);
    expect(events[0].citizenId).toBe(trip!.citizenId);
    expect(updated.processedEventIds).toEqual([events[0].eventId]);
    expect(
      updated.citizens.find((citizen) => citizen.citizenId === trip!.citizenId)
        ?.processedCommuteCount,
    ).toBe(1);
    expect(JSON.stringify(traffic)).toBe(beforeTraffic);
    expect(JSON.stringify(mobility)).toBe(beforeMobility);
  }, 20_000);

  it('provides stable building aggregates and selected-citizen explanations', () => {
    const { population, exposure, wellbeing } = setup('wellbeing-queries');
    const summaries = aggregateWellbeingByHomeBuilding(wellbeing, population);
    const selected = explainCitizenWellbeing(
      population.citizens[0].id,
      wellbeing,
      exposure,
    );
    expect(
      summaries.reduce((total, summary) => total + summary.residentCount, 0),
    ).toBe(population.citizens.length);
    expect(selected?.citizen.citizenId).toBe(population.citizens[0].id);
    expect(selected?.exposure.citizenId).toBe(population.citizens[0].id);
  }, 20_000);

  it.each(['phase-zero', 'coast', 'şehir 🚗'])(
    'keeps representative seed %s finite, bounded, and non-uniform',
    (seed) => {
      const { population, wellbeing } = setup(seed);
      expect(wellbeing.metrics.citizenCount).toBe(
        population.metrics.totalPopulation,
      );
      for (const dimension of WELLBEING_DIMENSIONS) {
        expect(wellbeing.metrics.minimumScores[dimension]).toBeGreaterThanOrEqual(
          0,
        );
        expect(wellbeing.metrics.maximumScores[dimension]).toBeLessThanOrEqual(
          100,
        );
        expect(wellbeing.metrics.maximumScores[dimension]).toBeGreaterThan(
          wellbeing.metrics.minimumScores[dimension],
        );
      }
    },
    30_000,
  );
});
