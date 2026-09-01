import { describe, expect, it } from 'vitest';
import { TRAFFIC_CONFIG } from './config';
import {
  buildTrafficDemandIndex,
  createPopulationTrafficState,
  getMobilityRuntimeMetrics,
} from './populationDemand';
import { findTrafficRoute } from './routing';
import { TrafficSimulationController } from './trafficController';
import { buildTrafficNetwork } from './trafficNetwork';
import { createCrossRoadWorld } from './trafficTestFixtures';
import type {
  TrafficDemandCatalog,
  TrafficDemandTrip,
} from './types';

function createCatalog(tripCount = 5): TrafficDemandCatalog {
  const world = createCrossRoadWorld();
  const network = buildTrafficNetwork(world);
  const morningRoute = findTrafficRoute(network, 'west', 'east')!;
  const eveningRoute = findTrafficRoute(network, 'east', 'west')!;
  const trips: TrafficDemandTrip[] = [];
  for (let index = 0; index < tripCount; index += 1) {
    const suffix = index.toString().padStart(3, '0');
    trips.push({
      id: `trip/citizen-${suffix}/work`,
      citizenId: `citizen-${suffix}`,
      purpose: 'commute-to-work',
      originBuildingId: 'home-building',
      destinationBuildingId: 'work-building',
      plannedDepartureMinute: index < 2 ? 480 : 480 + index,
      route: morningRoute,
    });
    trips.push({
      id: `trip/citizen-${suffix}/home`,
      citizenId: `citizen-${suffix}`,
      purpose: 'commute-home',
      originBuildingId: 'work-building',
      destinationBuildingId: 'home-building',
      plannedDepartureMinute: 1_020 + index,
      route: eveningRoute,
    });
  }
  return {
    mobilityVersion: 'phase-7.0-test',
    employedCommuters: tripCount,
    demandSecondsPerPlannedMinute: 0.25,
    trips,
    unreachableTrips: [],
  };
}

function createPopulationController(catalog = createCatalog()) {
  return new TrafficSimulationController(
    createCrossRoadWorld(),
    0,
    {
      ...TRAFFIC_CONFIG,
      maxPopulationActiveVehicles: 1,
      maxPopulationAdmissionsPerTick: 1,
      minimumTripDistance: 10,
    },
    catalog,
  );
}

describe('population traffic demand', () => {
  it('sorts departures by planned minute then stable trip ID', () => {
    const catalog = createCatalog(3);
    const index = buildTrafficDemandIndex({
      ...catalog,
      trips: [...catalog.trips].reverse(),
    });
    expect(index.morningTrips.map((trip) => trip.id)).toEqual([
      'trip/citizen-000/work',
      'trip/citizen-001/work',
      'trip/citizen-002/work',
    ]);
    const state = createPopulationTrafficState(
      createCrossRoadWorld(),
      index,
      'morning-commute',
    );
    expect(state.tripRuntime.map((runtime) => runtime.tripId)).toEqual(
      index.morningTrips.map((trip) => trip.id),
    );
  });

  it('retains excess eligible demand in an observable bounded queue', () => {
    const controller = createPopulationController();
    controller.setDemandMode('morning-commute');
    controller.play();
    controller.advanceRealTime(0.05);

    expect(controller.state.vehicles).toHaveLength(1);
    expect(controller.state.vehicles[0]).toMatchObject({
      source: 'population',
      citizenId: 'citizen-000',
      tripId: 'trip/citizen-000/work',
      tripPurpose: 'commute-to-work',
      originBuildingId: 'home-building',
      destinationBuildingId: 'work-building',
    });
    expect(
      controller.state.tripRuntime.filter(
        (runtime) => runtime.status === 'queued',
      ),
    ).toHaveLength(1);
    expect(
      controller.state.tripRuntime.filter(
        (runtime) => runtime.status === 'scheduled',
      ),
    ).toHaveLength(3);
    expect(controller.state.maximumQueueSize).toBe(2);
    expect(controller.state.tripRuntime).toHaveLength(5);
  });

  it('is deterministic across reset and different render-frame schedules', () => {
    const catalog = createCatalog(3);
    const sixtyFps = createPopulationController(catalog);
    const tenFps = createPopulationController(catalog);
    sixtyFps.setDemandMode('morning-commute');
    tenFps.setDemandMode('morning-commute');
    const initial = sixtyFps.state;
    sixtyFps.play();
    tenFps.play();
    for (let frame = 0; frame < 60; frame += 1) {
      sixtyFps.advanceRealTime(1 / 60);
    }
    for (let frame = 0; frame < 10; frame += 1) {
      tenFps.advanceRealTime(0.1);
    }
    expect(sixtyFps.state).toEqual(tenFps.state);
    expect(sixtyFps.state).not.toEqual(initial);
    sixtyFps.reset();
    expect(sixtyFps.state).toEqual(initial);
    expect(sixtyFps.isPlaying).toBe(false);
  });

  it('honors pause and reverses the evening trip direction', () => {
    const controller = createPopulationController(createCatalog(1));
    controller.setDemandMode('evening-commute');
    expect(controller.state.demandMode).toBe('evening-commute');
    controller.play();
    controller.advanceRealTime(0.05);
    expect(controller.state.vehicles[0]?.originNodeId).toBe('east');
    expect(controller.state.vehicles[0]?.destinationNodeId).toBe('west');
    const tick = controller.state.tick;
    controller.pause();
    controller.advanceRealTime(0.25);
    expect(controller.state.tick).toBe(tick);
  });

  it('reports unreachable demand and finite non-negative runtime metrics', () => {
    const catalog = createCatalog(1);
    const withUnreachable: TrafficDemandCatalog = {
      ...catalog,
      unreachableTrips: [
        {
          id: 'trip/citizen-unreachable/work',
          citizenId: 'citizen-unreachable',
          purpose: 'commute-to-work',
          plannedDepartureMinute: 480,
        },
      ],
    };
    const controller = createPopulationController(withUnreachable);
    controller.setDemandMode('morning-commute');
    const index = buildTrafficDemandIndex(withUnreachable);
    const metrics = getMobilityRuntimeMetrics(controller.state, index);
    expect(metrics.unreachableTrips).toBe(1);
    expect(metrics.plannedCommuteTrips).toBe(2);
    expect(
      Object.values(metrics).every(
        (value) => Number.isFinite(value) && value >= 0,
      ),
    ).toBe(true);
  });

  it('records actual departure, arrival, wait, and completed travel time', () => {
    const world = createCrossRoadWorld();
    const beforeWorld = JSON.stringify(world);
    const catalog = createCatalog(1);
    const beforeCatalog = JSON.stringify(catalog);
    const controller = new TrafficSimulationController(
      world,
      0,
      { ...TRAFFIC_CONFIG, minimumTripDistance: 10 },
      catalog,
    );
    controller.setDemandMode('morning-commute');
    controller.play();
    for (let frame = 0; frame < 100; frame += 1) {
      controller.advanceRealTime(0.25);
    }
    const runtime = controller.state.tripRuntime[0];
    expect(runtime.status).toBe('completed');
    expect(runtime.actualDepartureTime).toBeDefined();
    expect(runtime.actualArrivalTime).toBeGreaterThan(
      runtime.actualDepartureTime!,
    );
    expect(runtime.waitingTime).toBeGreaterThanOrEqual(0);
    expect(runtime.travelTime).toBeGreaterThan(0);
    expect(controller.mobilityRuntimeMetrics?.averageCompletedTravelTime).toBe(
      runtime.travelTime,
    );
    expect(JSON.stringify(world)).toBe(beforeWorld);
    expect(JSON.stringify(catalog)).toBe(beforeCatalog);
  });

  it('preserves the original synthetic demand mode', () => {
    const controller = createPopulationController();
    expect(controller.state.demandMode).toBe('synthetic');
    expect(controller.state.vehicles.length).toBe(0);
    controller.setTargetVehicleCount(12);
    expect(controller.state.vehicles.length).toBeGreaterThan(0);
    expect(
      controller.state.vehicles.every((vehicle) => vehicle.source === 'synthetic'),
    ).toBe(true);
  });
});
