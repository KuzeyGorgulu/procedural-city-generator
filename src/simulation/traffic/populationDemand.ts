import type { World } from '../../world/types';
import type { TrafficSimulationConfig } from './config';
import { TRAFFIC_CONFIG } from './config';
import { createVehicleForRoute, hasSpawnClearance } from './spawning';
import type {
  MobilityRuntimeMetrics,
  PopulationTripPurpose,
  TrafficDemandCatalog,
  TrafficDemandIndex,
  TrafficDemandMode,
  TrafficDemandTrip,
  TrafficNetwork,
  TrafficSimulationState,
  TripRuntimeState,
} from './types';

const DEMAND_SEED_SEPARATOR = '\u001e';

export interface CompletedPopulationTrip {
  readonly tripId: string;
  readonly travelTime: number;
}

function compareDemandTrips(
  first: { readonly plannedDepartureMinute: number; readonly id: string },
  second: { readonly plannedDepartureMinute: number; readonly id: string },
): number {
  return (
    first.plannedDepartureMinute - second.plannedDepartureMinute ||
    first.id.localeCompare(second.id)
  );
}

function getWavePurpose(mode: TrafficDemandMode): PopulationTripPurpose {
  return mode === 'evening-commute' ? 'commute-home' : 'commute-to-work';
}

function getStartMinute(
  trips: readonly { readonly plannedDepartureMinute: number }[],
): number {
  return trips.length === 0
    ? 0
    : Math.min(...trips.map((trip) => trip.plannedDepartureMinute));
}

export function buildTrafficDemandIndex(
  catalog: TrafficDemandCatalog,
): TrafficDemandIndex {
  const morningTrips = catalog.trips
    .filter((trip) => trip.purpose === 'commute-to-work')
    .sort(compareDemandTrips);
  const eveningTrips = catalog.trips
    .filter((trip) => trip.purpose === 'commute-home')
    .sort(compareDemandTrips);
  const morningUnreachableTrips = catalog.unreachableTrips
    .filter((trip) => trip.purpose === 'commute-to-work')
    .sort(compareDemandTrips);
  const eveningUnreachableTrips = catalog.unreachableTrips
    .filter((trip) => trip.purpose === 'commute-home')
    .sort(compareDemandTrips);
  const morningRuntimeTripIds = [...morningTrips, ...morningUnreachableTrips]
    .sort(compareDemandTrips)
    .map((trip) => trip.id);
  const eveningRuntimeTripIds = [...eveningTrips, ...eveningUnreachableTrips]
    .sort(compareDemandTrips)
    .map((trip) => trip.id);
  return {
    catalog,
    tripsById: new Map(catalog.trips.map((trip) => [trip.id, trip])),
    morningTrips,
    eveningTrips,
    morningUnreachableTrips,
    eveningUnreachableTrips,
    morningRuntimeTripIds,
    eveningRuntimeTripIds,
    morningRuntimeIndexByTripId: new Map(
      morningRuntimeTripIds.map((tripId, runtimeIndex) => [tripId, runtimeIndex]),
    ),
    eveningRuntimeIndexByTripId: new Map(
      eveningRuntimeTripIds.map((tripId, runtimeIndex) => [tripId, runtimeIndex]),
    ),
    morningStartMinute: getStartMinute([
      ...morningTrips,
      ...morningUnreachableTrips,
    ]),
    eveningStartMinute: getStartMinute([
      ...eveningTrips,
      ...eveningUnreachableTrips,
    ]),
  };
}

function getWaveTrips(
  index: TrafficDemandIndex,
  mode: TrafficDemandMode,
): readonly TrafficDemandTrip[] {
  return mode === 'evening-commute'
    ? index.eveningTrips
    : index.morningTrips;
}

function getWaveRuntimeTripIds(
  index: TrafficDemandIndex,
  mode: TrafficDemandMode,
): readonly string[] {
  return mode === 'evening-commute'
    ? index.eveningRuntimeTripIds
    : index.morningRuntimeTripIds;
}

function getWaveRuntimeIndex(
  index: TrafficDemandIndex,
  mode: TrafficDemandMode,
): ReadonlyMap<string, number> {
  return mode === 'evening-commute'
    ? index.eveningRuntimeIndexByTripId
    : index.morningRuntimeIndexByTripId;
}

function getWaveStartMinute(
  index: TrafficDemandIndex,
  mode: TrafficDemandMode,
): number {
  return mode === 'evening-commute'
    ? index.eveningStartMinute
    : index.morningStartMinute;
}

function getEligibilityTime(
  trip: TrafficDemandTrip,
  index: TrafficDemandIndex,
  mode: TrafficDemandMode,
): number {
  return Math.max(
    0,
    (trip.plannedDepartureMinute - getWaveStartMinute(index, mode)) *
      index.catalog.demandSecondsPerPlannedMinute,
  );
}

export function createPopulationTrafficState(
  world: World,
  index: TrafficDemandIndex,
  mode: Exclude<TrafficDemandMode, 'synthetic'>,
  config: TrafficSimulationConfig = TRAFFIC_CONFIG,
): TrafficSimulationState {
  const runtime: TripRuntimeState[] = getWaveRuntimeTripIds(index, mode).map(
    (tripId) => ({
      tripId,
      status: index.tripsById.has(tripId) ? 'scheduled' : 'unreachable',
    }),
  );
  return {
    simulationVersion: config.simulationVersion,
    simulationSeed: [
      world.metadata.generatorVersion,
      world.metadata.seed,
      `traffic/${config.simulationVersion}`,
      `mobility/${index.catalog.mobilityVersion}`,
      mode,
    ].join(DEMAND_SEED_SEPARATOR),
    demandMode: mode,
    tick: 0,
    elapsedSeconds: 0,
    vehicles: [],
    targetVehicleCount: 0,
    nextVehicleSerial: 0,
    completedTrips: 0,
    totalCompletedTravelTime: 0,
    tripRuntime: runtime,
    nextDemandTripIndex: 0,
    queuedTripIds: [],
    nextQueuedTripIndex: 0,
    maximumQueueSize: 0,
  };
}

export function advancePopulationTrafficDemand(
  state: TrafficSimulationState,
  network: TrafficNetwork,
  index: TrafficDemandIndex,
  completedTrips: readonly CompletedPopulationTrip[],
  config: TrafficSimulationConfig = TRAFFIC_CONFIG,
): TrafficSimulationState {
  if (state.demandMode === 'synthetic') return state;
  const runtimeIndexByTripId = getWaveRuntimeIndex(index, state.demandMode);
  let mutableRuntime: TripRuntimeState[] | undefined;
  const readRuntime = (runtimeIndex: number) =>
    mutableRuntime?.[runtimeIndex] ?? state.tripRuntime[runtimeIndex];
  const writeRuntime = (
    runtimeIndex: number,
    runtime: TripRuntimeState,
  ) => {
    mutableRuntime ??= [...state.tripRuntime];
    mutableRuntime[runtimeIndex] = runtime;
  };

  for (const completion of completedTrips) {
    const runtimeIndex = runtimeIndexByTripId.get(completion.tripId);
    const runtime =
      runtimeIndex === undefined ? undefined : readRuntime(runtimeIndex);
    if (runtimeIndex === undefined || !runtime) continue;
    writeRuntime(runtimeIndex, {
      ...runtime,
      status: 'completed',
      actualArrivalTime: state.elapsedSeconds,
      travelTime: completion.travelTime,
    });
  }

  let nextDemandTripIndex = state.nextDemandTripIndex;
  let mutableQueuedTripIds: string[] | undefined;
  const enqueueTrip = (tripId: string) => {
    mutableQueuedTripIds ??= [...state.queuedTripIds];
    mutableQueuedTripIds.push(tripId);
  };
  while (nextDemandTripIndex < state.tripRuntime.length) {
    const runtime = readRuntime(nextDemandTripIndex);
    if (runtime.status !== 'scheduled') {
      nextDemandTripIndex += 1;
      continue;
    }
    const trip = index.tripsById.get(runtime.tripId);
    if (!trip) {
      writeRuntime(nextDemandTripIndex, {
        ...runtime,
        status: 'unreachable',
      });
      nextDemandTripIndex += 1;
      continue;
    }
    if (
      getEligibilityTime(trip, index, state.demandMode) >
      state.elapsedSeconds + 1e-9
    ) {
      break;
    }
    writeRuntime(nextDemandTripIndex, { ...runtime, status: 'queued' });
    enqueueTrip(runtime.tripId);
    nextDemandTripIndex += 1;
  }

  const nextQueuedTripIds = mutableQueuedTripIds ?? state.queuedTripIds;
  const queuedBeforeAdmission =
    nextQueuedTripIds.length - state.nextQueuedTripIndex;
  let localCompletions = 0;
  const nextVehicles = [...state.vehicles];
  let nextQueuedTripIndex = state.nextQueuedTripIndex;
  let admissions = 0;

  while (
    nextQueuedTripIndex < nextQueuedTripIds.length &&
    admissions < config.maxPopulationAdmissionsPerTick &&
    nextVehicles.length < config.maxPopulationActiveVehicles
  ) {
    const tripId = nextQueuedTripIds[nextQueuedTripIndex];
    const runtimeIndex = runtimeIndexByTripId.get(tripId);
    const runtime =
      runtimeIndex === undefined ? undefined : readRuntime(runtimeIndex);
    if (runtimeIndex === undefined || !runtime || runtime.status !== 'queued') {
      nextQueuedTripIndex += 1;
      continue;
    }
    const trip = index.tripsById.get(runtime.tripId);
    if (!trip) {
      writeRuntime(runtimeIndex, { ...runtime, status: 'unreachable' });
      nextQueuedTripIndex += 1;
      continue;
    }
    const eligibilityTime = getEligibilityTime(trip, index, state.demandMode);
    if (trip.route.arcIds.length === 0) {
      writeRuntime(runtimeIndex, {
        ...runtime,
        status: 'completed',
        actualDepartureTime: eligibilityTime,
        actualArrivalTime: eligibilityTime,
        travelTime: 0,
        waitingTime: 0,
      });
      nextQueuedTripIndex += 1;
      localCompletions += 1;
      continue;
    }
    const firstArcId = trip.route.arcIds[0];
    if (!hasSpawnClearance(firstArcId, trip.route.originNodeId, nextVehicles, config)) {
      break;
    }
    const vehicle = createVehicleForRoute(
      `vehicle/${trip.id}`,
      trip.route,
      network,
      {
        source: 'population',
        citizenId: trip.citizenId,
        tripId: trip.id,
        tripPurpose: trip.purpose,
        originBuildingId: trip.originBuildingId,
        destinationBuildingId: trip.destinationBuildingId,
      },
    );
    if (!vehicle) {
      writeRuntime(runtimeIndex, { ...runtime, status: 'unreachable' });
      nextQueuedTripIndex += 1;
      continue;
    }
    nextVehicles.push(vehicle);
    writeRuntime(runtimeIndex, {
      ...runtime,
      status: 'active',
      actualDepartureTime: state.elapsedSeconds,
      waitingTime: Math.max(0, state.elapsedSeconds - eligibilityTime),
    });
    nextQueuedTripIndex += 1;
    admissions += 1;
  }

  nextVehicles.sort((first, second) => first.id.localeCompare(second.id));
  return {
    ...state,
    vehicles: nextVehicles,
    completedTrips: state.completedTrips + localCompletions,
    tripRuntime: mutableRuntime ?? state.tripRuntime,
    nextDemandTripIndex,
    queuedTripIds: nextQueuedTripIds,
    nextQueuedTripIndex,
    maximumQueueSize: Math.max(state.maximumQueueSize, queuedBeforeAdmission),
  };
}

export function getMobilityRuntimeMetrics(
  state: TrafficSimulationState,
  index: TrafficDemandIndex,
): MobilityRuntimeMetrics {
  if (state.demandMode === 'synthetic') {
    return {
      employedCommuters: index.catalog.employedCommuters,
      plannedCommuteTrips: 0,
      eligibleTrips: 0,
      queuedTrips: 0,
      activeTrips: 0,
      completedTrips: 0,
      unreachableTrips: 0,
      averageEstimatedDistance: 0,
      averageEstimatedTravelTime: 0,
      averageCompletedTravelTime: 0,
      averageQueueWaitTime: 0,
      maximumQueueSize: 0,
    };
  }
  const waveTrips = getWaveTrips(index, state.demandMode);
  const totalEstimatedDistance = waveTrips.reduce(
    (total, trip) => total + trip.route.totalLength,
    0,
  );
  const totalEstimatedTime = waveTrips.reduce(
    (total, trip) => total + trip.route.estimatedTravelTime,
    0,
  );
  const completed = state.tripRuntime.filter(
    (runtime) => runtime.status === 'completed',
  );
  const admitted = state.tripRuntime.filter(
    (runtime) => runtime.actualDepartureTime !== undefined,
  );
  const completedTravelTime = completed.reduce(
    (total, runtime) => total + (runtime.travelTime ?? 0),
    0,
  );
  const totalWait = admitted.reduce(
    (total, runtime) => total + (runtime.waitingTime ?? 0),
    0,
  );
  return {
    employedCommuters: index.catalog.employedCommuters,
    plannedCommuteTrips: state.tripRuntime.length,
    eligibleTrips: state.tripRuntime.filter(
      (runtime) =>
        runtime.status === 'queued' ||
        runtime.status === 'active' ||
        runtime.status === 'completed',
    ).length,
    queuedTrips: state.tripRuntime.filter((runtime) => runtime.status === 'queued')
      .length,
    activeTrips: state.tripRuntime.filter((runtime) => runtime.status === 'active')
      .length,
    completedTrips: completed.length,
    unreachableTrips: state.tripRuntime.filter(
      (runtime) => runtime.status === 'unreachable',
    ).length,
    averageEstimatedDistance:
      waveTrips.length === 0 ? 0 : totalEstimatedDistance / waveTrips.length,
    averageEstimatedTravelTime:
      waveTrips.length === 0 ? 0 : totalEstimatedTime / waveTrips.length,
    averageCompletedTravelTime:
      completed.length === 0 ? 0 : completedTravelTime / completed.length,
    averageQueueWaitTime: admitted.length === 0 ? 0 : totalWait / admitted.length,
    maximumQueueSize: state.maximumQueueSize,
  };
}

export function getDemandModePurpose(
  mode: TrafficDemandMode,
): PopulationTripPurpose | undefined {
  return mode === 'synthetic' ? undefined : getWavePurpose(mode);
}
