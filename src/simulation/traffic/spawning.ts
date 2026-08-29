import { createSeededRng } from '../../core/rng';
import type { World } from '../../world/types';
import type { TrafficSimulationConfig } from './config';
import { TRAFFIC_CONFIG } from './config';
import { findTrafficRoute } from './routing';
import type {
  TrafficNetwork,
  TrafficSimulationState,
  Vehicle,
} from './types';

const TRAFFIC_SEED_SEPARATOR = '\u001e';

export function deriveTrafficSimulationSeed(
  world: World,
  config: TrafficSimulationConfig = TRAFFIC_CONFIG,
): string {
  return [
    world.metadata.generatorVersion,
    world.metadata.seed,
    `traffic/${config.simulationVersion}`,
  ].join(TRAFFIC_SEED_SEPARATOR);
}

function normalizeVehicleCount(
  count: number,
  config: TrafficSimulationConfig,
): number {
  return Math.min(
    config.maxVehicleCount,
    Math.max(0, Number.isFinite(count) ? Math.round(count) : 0),
  );
}

function hasSpawnClearance(
  routeFirstArcId: string,
  originNodeId: string,
  vehicles: readonly Vehicle[],
  config: TrafficSimulationConfig,
): boolean {
  return !vehicles.some(
    (vehicle) =>
      (vehicle.originNodeId === originNodeId &&
        vehicle.distanceTravelled < config.minimumFollowingDistance) ||
      (vehicle.route.arcIds[vehicle.routeArcIndex] === routeFirstArcId &&
        vehicle.progressOnArc < config.minimumFollowingDistance * 1.5),
  );
}

function createVehicle(
  state: TrafficSimulationState,
  network: TrafficNetwork,
  config: TrafficSimulationConfig,
): Vehicle | undefined {
  const candidates = network.developedNodeIds;
  if (candidates.length < 2) return undefined;
  const serial = state.nextVehicleSerial;
  const vehicleRng = createSeededRng(state.simulationSeed).fork(
    `vehicle-${serial.toString().padStart(6, '0')}`,
  );

  for (let attempt = 0; attempt < config.spawnAttemptLimit; attempt += 1) {
    const attemptRng = vehicleRng.fork(
      `trip-attempt-${attempt.toString().padStart(2, '0')}`,
    );
    const originNodeId = candidates[attemptRng.int(0, candidates.length)];
    const destinationNodeId =
      candidates[attemptRng.int(0, candidates.length)];
    if (originNodeId === destinationNodeId) continue;
    const route = findTrafficRoute(network, originNodeId, destinationNodeId);
    const firstArcId = route?.arcIds[0];
    if (
      !route ||
      !firstArcId ||
      route.totalLength < config.minimumTripDistance ||
      !hasSpawnClearance(firstArcId, originNodeId, state.vehicles, config)
    ) {
      continue;
    }
    const firstArc = network.arcsById.get(firstArcId);
    if (!firstArc) continue;

    return {
      id: `vehicle-${serial.toString().padStart(5, '0')}`,
      originNodeId,
      destinationNodeId,
      route,
      routeArcIndex: 0,
      progressOnArc: 0,
      currentSpeed: 0,
      desiredSpeed: firstArc.nominalSpeed,
      movementState: 'moving',
      elapsedTripSeconds: 0,
      distanceTravelled: 0,
    };
  }

  return undefined;
}

function trySpawnNextVehicle(
  state: TrafficSimulationState,
  network: TrafficNetwork,
  config: TrafficSimulationConfig,
): TrafficSimulationState {
  const vehicle = createVehicle(state, network, config);
  return {
    ...state,
    vehicles: vehicle
      ? [...state.vehicles, vehicle].sort((first, second) =>
          first.id.localeCompare(second.id),
        )
      : state.vehicles,
    nextVehicleSerial: state.nextVehicleSerial + 1,
  };
}

export function fillTrafficPopulation(
  state: TrafficSimulationState,
  network: TrafficNetwork,
  config: TrafficSimulationConfig = TRAFFIC_CONFIG,
): TrafficSimulationState {
  let nextState = state;
  const missingVehicles = Math.max(
    0,
    state.targetVehicleCount - state.vehicles.length,
  );
  const serialBudget = Math.max(
    1,
    missingVehicles * config.initialSpawnSerialMultiplier,
  );
  for (
    let attempt = 0;
    attempt < serialBudget &&
    nextState.vehicles.length < nextState.targetVehicleCount;
    attempt += 1
  ) {
    nextState = trySpawnNextVehicle(nextState, network, config);
  }
  return nextState;
}

export function createInitialTrafficState(
  world: World,
  network: TrafficNetwork,
  targetVehicleCount = TRAFFIC_CONFIG.defaultVehicleCount,
  config: TrafficSimulationConfig = TRAFFIC_CONFIG,
): TrafficSimulationState {
  const state: TrafficSimulationState = {
    simulationVersion: config.simulationVersion,
    simulationSeed: deriveTrafficSimulationSeed(world, config),
    tick: 0,
    elapsedSeconds: 0,
    vehicles: [],
    targetVehicleCount: normalizeVehicleCount(targetVehicleCount, config),
    nextVehicleSerial: 0,
    completedTrips: 0,
    totalCompletedTravelTime: 0,
  };
  return fillTrafficPopulation(state, network, config);
}

export function setTrafficTargetVehicleCount(
  state: TrafficSimulationState,
  network: TrafficNetwork,
  targetVehicleCount: number,
  config: TrafficSimulationConfig = TRAFFIC_CONFIG,
): TrafficSimulationState {
  const target = normalizeVehicleCount(targetVehicleCount, config);
  const reducedVehicles =
    state.vehicles.length > target ? state.vehicles.slice(0, target) : state.vehicles;
  return fillTrafficPopulation(
    {
      ...state,
      targetVehicleCount: target,
      vehicles: reducedVehicles,
    },
    network,
    config,
  );
}
