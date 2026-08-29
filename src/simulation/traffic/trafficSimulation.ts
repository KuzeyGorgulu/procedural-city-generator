import type { RoadNodeId } from '../../world/types';
import type { TrafficSimulationConfig } from './config';
import { TRAFFIC_CONFIG } from './config';
import { fillTrafficPopulation } from './spawning';
import type {
  TrafficNetwork,
  TrafficSimulationState,
  Vehicle,
} from './types';
import { getVehicleCurrentArc } from './vehicleQueries';

const MOVEMENT_EPSILON = 1e-9;

interface IntersectionRequest {
  readonly vehicleId: string;
  readonly nodeId: RoadNodeId;
  readonly nextArcId: string;
  readonly distanceToStop: number;
}

interface MovementProposal {
  readonly vehicle: Vehicle;
  readonly nextSpeed: number;
  readonly travelDistance: number;
  readonly request?: IntersectionRequest;
}

interface AdvanceResult {
  readonly vehicle?: Vehicle;
  readonly completed: boolean;
  readonly completedTravelTime: number;
}

function buildVehiclesByArc(
  vehicles: readonly Vehicle[],
): Map<string, Vehicle[]> {
  const byArc = new Map<string, Vehicle[]>();
  for (const vehicle of vehicles) {
    const arcId = vehicle.route.arcIds[vehicle.routeArcIndex];
    if (!arcId) continue;
    const occupants = byArc.get(arcId) ?? [];
    occupants.push(vehicle);
    byArc.set(arcId, occupants);
  }
  for (const occupants of byArc.values()) {
    occupants.sort(
      (first, second) =>
        second.progressOnArc - first.progressOnArc ||
        first.id.localeCompare(second.id),
    );
  }
  return byArc;
}

function getFollowingLimit(
  vehicle: Vehicle,
  vehiclesByArc: ReadonlyMap<string, readonly Vehicle[]>,
  config: TrafficSimulationConfig,
): { readonly targetSpeed: number; readonly maxTravelDistance: number } {
  const arcId = vehicle.route.arcIds[vehicle.routeArcIndex];
  const occupants = arcId ? vehiclesByArc.get(arcId) ?? [] : [];
  const index = occupants.findIndex((candidate) => candidate.id === vehicle.id);
  const leader = index > 0 ? occupants[index - 1] : undefined;
  if (!leader) {
    return {
      targetSpeed: vehicle.desiredSpeed,
      maxTravelDistance: Number.POSITIVE_INFINITY,
    };
  }
  const availableDistance = Math.max(
    0,
    leader.progressOnArc -
      vehicle.progressOnArc -
      config.minimumFollowingDistance,
  );
  return {
    targetSpeed: Math.min(
      vehicle.desiredSpeed,
      availableDistance / config.followingTimeGapSeconds,
    ),
    maxTravelDistance: availableDistance,
  };
}

function approachSpeed(
  currentSpeed: number,
  targetSpeed: number,
  deltaSeconds: number,
  config: TrafficSimulationConfig,
): number {
  return currentSpeed <= targetSpeed
    ? Math.min(targetSpeed, currentSpeed + config.acceleration * deltaSeconds)
    : Math.max(targetSpeed, currentSpeed - config.braking * deltaSeconds);
}

function findIntersectionRequest(
  vehicle: Vehicle,
  travelDistance: number,
  network: TrafficNetwork,
  config: TrafficSimulationConfig,
): IntersectionRequest | undefined {
  let routeArcIndex = vehicle.routeArcIndex;
  let progress = vehicle.progressOnArc;
  let distanceBeforeArc = 0;

  while (routeArcIndex < vehicle.route.arcIds.length) {
    const arc = network.arcsById.get(vehicle.route.arcIds[routeArcIndex]);
    if (!arc) return undefined;
    const remainingOnArc = Math.max(0, arc.length - progress);
    const nextArcId = vehicle.route.arcIds[routeArcIndex + 1];
    if (nextArcId && network.intersectionNodeIds.has(arc.to)) {
      const distanceToStop = Math.max(
        0,
        distanceBeforeArc +
          remainingOnArc -
          config.intersectionStopDistance,
      );
      if (travelDistance + MOVEMENT_EPSILON >= distanceToStop) {
        return {
          vehicleId: vehicle.id,
          nodeId: arc.to,
          nextArcId,
          distanceToStop,
        };
      }
      return undefined;
    }
    if (travelDistance < distanceBeforeArc + remainingOnArc) return undefined;
    distanceBeforeArc += remainingOnArc;
    routeArcIndex += 1;
    progress = 0;
  }
  return undefined;
}

function nextArcHasClearance(
  request: IntersectionRequest,
  vehiclesByArc: ReadonlyMap<string, readonly Vehicle[]>,
  config: TrafficSimulationConfig,
): boolean {
  return !(vehiclesByArc.get(request.nextArcId) ?? []).some(
    (vehicle) =>
      vehicle.id !== request.vehicleId &&
      vehicle.progressOnArc < config.minimumFollowingDistance,
  );
}

function selectIntersectionWinners(
  proposals: readonly MovementProposal[],
  vehiclesByArc: ReadonlyMap<string, readonly Vehicle[]>,
  config: TrafficSimulationConfig,
): Set<string> {
  const requestsByNode = new Map<RoadNodeId, IntersectionRequest[]>();
  for (const proposal of proposals) {
    const request = proposal.request;
    if (!request) continue;
    const requests = requestsByNode.get(request.nodeId) ?? [];
    requests.push(request);
    requestsByNode.set(request.nodeId, requests);
  }

  const winners = new Set<string>();
  for (const requests of requestsByNode.values()) {
    requests.sort((first, second) => first.vehicleId.localeCompare(second.vehicleId));
    const winner = requests.find((request) =>
      nextArcHasClearance(request, vehiclesByArc, config),
    );
    if (winner) winners.add(winner.vehicleId);
  }
  return winners;
}

function advanceVehicle(
  vehicle: Vehicle,
  travelDistance: number,
  nextSpeed: number,
  queued: boolean,
  network: TrafficNetwork,
  deltaSeconds: number,
): AdvanceResult {
  let routeArcIndex = vehicle.routeArcIndex;
  let progressOnArc = vehicle.progressOnArc;
  let remainingDistance = Math.max(0, travelDistance);
  let travelled = 0;

  while (routeArcIndex < vehicle.route.arcIds.length) {
    const arc = network.arcsById.get(vehicle.route.arcIds[routeArcIndex]);
    if (!arc) {
      return { completed: false, completedTravelTime: 0 };
    }
    const available = Math.max(0, arc.length - progressOnArc);
    if (remainingDistance < available - MOVEMENT_EPSILON) {
      progressOnArc += remainingDistance;
      travelled += remainingDistance;
      remainingDistance = 0;
      break;
    }
    travelled += available;
    remainingDistance = Math.max(0, remainingDistance - available);
    routeArcIndex += 1;
    progressOnArc = 0;
    if (routeArcIndex >= vehicle.route.arcIds.length) {
      return {
        completed: true,
        completedTravelTime: vehicle.elapsedTripSeconds + deltaSeconds,
      };
    }
  }

  const currentArc = network.arcsById.get(vehicle.route.arcIds[routeArcIndex]);
  if (!currentArc) return { completed: false, completedTravelTime: 0 };
  return {
    completed: false,
    completedTravelTime: 0,
    vehicle: {
      ...vehicle,
      routeArcIndex,
      progressOnArc,
      currentSpeed: queued ? 0 : nextSpeed,
      desiredSpeed: currentArc.nominalSpeed,
      movementState: queued ? 'queued' : 'moving',
      elapsedTripSeconds: vehicle.elapsedTripSeconds + deltaSeconds,
      distanceTravelled: Math.min(
        vehicle.route.totalLength,
        vehicle.distanceTravelled + travelled,
      ),
    },
  };
}

export function stepTrafficSimulation(
  state: TrafficSimulationState,
  network: TrafficNetwork,
  config: TrafficSimulationConfig = TRAFFIC_CONFIG,
): TrafficSimulationState {
  const deltaSeconds = config.fixedTimeStepSeconds;
  const vehiclesByArc = buildVehiclesByArc(state.vehicles);
  const proposals: MovementProposal[] = [];

  for (const vehicle of state.vehicles) {
    const arc = getVehicleCurrentArc(vehicle, network);
    if (!arc) continue;
    const following = getFollowingLimit(vehicle, vehiclesByArc, config);
    const nextSpeed = approachSpeed(
      vehicle.currentSpeed,
      following.targetSpeed,
      deltaSeconds,
      config,
    );
    const unconstrainedDistance =
      ((vehicle.currentSpeed + nextSpeed) / 2) * deltaSeconds;
    const travelDistance = Math.min(
      unconstrainedDistance,
      following.maxTravelDistance,
    );
    proposals.push({
      vehicle,
      nextSpeed,
      travelDistance,
      request: findIntersectionRequest(
        vehicle,
        travelDistance,
        network,
        config,
      ),
    });
  }

  const winners = selectIntersectionWinners(
    proposals,
    vehiclesByArc,
    config,
  );
  const nextVehicles: Vehicle[] = [];
  let completedTrips = state.completedTrips;
  let totalCompletedTravelTime = state.totalCompletedTravelTime;
  for (const proposal of proposals) {
    const queued =
      proposal.request !== undefined && !winners.has(proposal.vehicle.id);
    const travelDistance = queued
      ? Math.min(proposal.travelDistance, proposal.request?.distanceToStop ?? 0)
      : proposal.travelDistance;
    const result = advanceVehicle(
      proposal.vehicle,
      travelDistance,
      proposal.nextSpeed,
      queued,
      network,
      deltaSeconds,
    );
    if (result.completed) {
      completedTrips += 1;
      totalCompletedTravelTime += result.completedTravelTime;
    } else if (result.vehicle) {
      nextVehicles.push(result.vehicle);
    }
  }
  nextVehicles.sort((first, second) => first.id.localeCompare(second.id));

  return fillTrafficPopulation(
    {
      ...state,
      tick: state.tick + 1,
      elapsedSeconds: state.elapsedSeconds + deltaSeconds,
      vehicles: nextVehicles,
      completedTrips,
      totalCompletedTravelTime,
    },
    network,
    config,
  );
}
