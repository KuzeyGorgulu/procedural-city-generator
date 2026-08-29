import { describe, expect, it } from 'vitest';
import { generateWorld } from '../../generation/generateWorld';
import { projectPointToSegment } from '../../world/roadGeometry';
import { TRAFFIC_CONFIG } from './config';
import { findTrafficRoute } from './routing';
import { createInitialTrafficState } from './spawning';
import { getTrafficMetrics } from './trafficMetrics';
import { stepTrafficSimulation } from './trafficSimulation';
import { TrafficSimulationController } from './trafficController';
import { buildTrafficNetwork } from './trafficNetwork';
import {
  createCrossRoadWorld,
  createVehicleForRoute,
} from './trafficTestFixtures';
import type { TrafficSimulationState } from './types';
import { getVehiclePose } from './vehicleQueries';

function runTicks(
  state: TrafficSimulationState,
  tickCount: number,
  controller: TrafficSimulationController,
): TrafficSimulationState {
  let next = state;
  for (let tick = 0; tick < tickCount; tick += 1) {
    next = stepTrafficSimulation(next, controller.network, controller.config);
  }
  return next;
}

describe('traffic simulation', () => {
  it('reproduces the same complete state for the same seed and tick count', () => {
    const world = generateWorld({ seed: 'traffic-repeatability' });
    const firstController = new TrafficSimulationController(world);
    const secondController = new TrafficSimulationController(world);

    expect(
      runTicks(firstController.state, 300, firstController),
    ).toEqual(runTicks(secondController.state, 300, secondController));
  });

  it('keeps representative-seed traffic poses finite and reproducible', () => {
    const finalStates: TrafficSimulationState[] = [];
    for (const seed of ['phase-zero', 'istanbul', 'memleket', '!']) {
      const world = generateWorld({ seed });
      const firstController = new TrafficSimulationController(world);
      const secondController = new TrafficSimulationController(world);
      const first = runTicks(firstController.state, 120, firstController);
      const second = runTicks(secondController.state, 120, secondController);
      expect(first).toEqual(second);
      for (const vehicle of first.vehicles) {
        const pose = getVehiclePose(vehicle, firstController.network);
        expect(pose).toBeDefined();
        expect(Number.isFinite(pose?.position.x)).toBe(true);
        expect(Number.isFinite(pose?.position.y)).toBe(true);
        expect(Number.isFinite(pose?.angle)).toBe(true);
      }
      finalStates.push(first);
    }
    expect(new Set(finalStates.map((state) => state.simulationSeed)).size).toBe(
      finalStates.length,
    );
  });

  it('advances vehicles along source road geometry and exposes metrics', () => {
    const world = generateWorld({ seed: 'traffic-progression' });
    const controller = new TrafficSimulationController(world);
    const initialDistances = new Map(
      controller.state.vehicles.map((vehicle) => [
        vehicle.id,
        vehicle.distanceTravelled,
      ]),
    );
    const advanced = runTicks(controller.state, 120, controller);
    expect(
      advanced.vehicles.some(
        (vehicle) =>
          vehicle.distanceTravelled > (initialDistances.get(vehicle.id) ?? -1),
      ),
    ).toBe(true);

    const edgesById = new Map(world.roads.edges.map((edge) => [edge.id, edge]));
    const nodesById = new Map(world.roads.nodes.map((node) => [node.id, node]));
    for (const vehicle of advanced.vehicles) {
      const pose = getVehiclePose(vehicle, controller.network);
      const arc = pose && controller.network.arcsById.get(pose.arcId);
      const edge = arc && edgesById.get(arc.sourceEdgeId);
      expect(pose).toBeDefined();
      expect(edge).toBeDefined();
      if (!pose || !edge) continue;
      const from = nodesById.get(edge.from)!;
      const to = nodesById.get(edge.to)!;
      expect(
        projectPointToSegment(pose.position, from.position, to.position).distance,
      ).toBeLessThan(1e-7);
    }

    const metrics = getTrafficMetrics(advanced, controller.network);
    expect(metrics.activeVehicleCount).toBe(advanced.vehicles.length);
    expect(
      metrics.segmentOccupancy.reduce(
        (total, occupancy) => total + occupancy.vehicleCount,
        0,
      ),
    ).toBe(advanced.vehicles.length);
  });

  it('reset restores the exact initial deterministic state', () => {
    const controller = new TrafficSimulationController(
      generateWorld({ seed: 'traffic-reset' }),
    );
    const initial = controller.state;
    controller.play();
    controller.advanceRealTime(0.25);
    expect(controller.state).not.toEqual(initial);
    controller.reset();
    expect(controller.state).toEqual(initial);
    expect(controller.isPlaying).toBe(false);
  });

  it('produces the same state under different render-frame schedules', () => {
    const world = generateWorld({ seed: 'fixed-timestep' });
    const sixtyFps = new TrafficSimulationController(world);
    const tenFps = new TrafficSimulationController(world);
    sixtyFps.play();
    tenFps.play();
    for (let frame = 0; frame < 60; frame += 1) {
      sixtyFps.advanceRealTime(1 / 60);
    }
    for (let frame = 0; frame < 10; frame += 1) {
      tenFps.advanceRealTime(0.1);
    }
    expect(sixtyFps.state).toEqual(tenFps.state);
  });

  it('honors play, pause, and simulation speed without render-owned updates', () => {
    const controller = new TrafficSimulationController(
      generateWorld({ seed: 'traffic-controls' }),
    );
    controller.advanceRealTime(0.1);
    expect(controller.state.tick).toBe(0);

    controller.setSpeedMultiplier(2);
    controller.play();
    expect(controller.advanceRealTime(0.1)).toBe(4);
    expect(controller.state.tick).toBe(4);

    controller.pause();
    controller.advanceRealTime(0.2);
    expect(controller.state.tick).toBe(4);
  });

  it('does not mutate generated world data while routing or simulating', () => {
    const world = generateWorld({ seed: 'immutable-traffic-world' });
    const serializedBefore = JSON.stringify(world);
    const controller = new TrafficSimulationController(world);
    runTicks(controller.state, 200, controller);
    expect(JSON.stringify(world)).toBe(serializedBefore);
  });

  it('maintains same-arc headway without quadratic pair scanning', () => {
    const world = createCrossRoadWorld();
    const network = buildTrafficNetwork(world);
    const route = findTrafficRoute(network, 'west', 'east')!;
    const state: TrafficSimulationState = {
      simulationVersion: TRAFFIC_CONFIG.simulationVersion,
      simulationSeed: 'headway-test',
      tick: 0,
      elapsedSeconds: 0,
      vehicles: [
        createVehicleForRoute('vehicle-00000', route, 40),
        createVehicleForRoute('vehicle-00001', route, 35),
      ],
      targetVehicleCount: 0,
      nextVehicleSerial: 2,
      completedTrips: 0,
      totalCompletedTravelTime: 0,
    };

    const next = stepTrafficSimulation(state, network);
    const follower = next.vehicles.find(
      (vehicle) => vehicle.id === 'vehicle-00001',
    )!;
    expect(follower.progressOnArc).toBe(35);
    expect(follower.currentSpeed).toBeLessThan(20);
  });

  it('grants deterministic single-vehicle intersection priority', () => {
    const world = createCrossRoadWorld();
    const network = buildTrafficNetwork(world);
    const westRoute = findTrafficRoute(network, 'west', 'east')!;
    const northRoute = findTrafficRoute(network, 'north', 'south')!;
    const state = createInitialTrafficState(world, network, 0);
    const next = stepTrafficSimulation(
      {
        ...state,
        vehicles: [
          createVehicleForRoute('vehicle-00000', westRoute, 97),
          createVehicleForRoute('vehicle-00001', northRoute, 97),
        ],
        nextVehicleSerial: 2,
      },
      network,
    );

    expect(next.vehicles.find(({ id }) => id === 'vehicle-00000')?.movementState).toBe(
      'moving',
    );
    expect(next.vehicles.find(({ id }) => id === 'vehicle-00001')?.movementState).toBe(
      'queued',
    );
  });
});
