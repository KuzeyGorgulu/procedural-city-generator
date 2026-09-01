import { createSeededRng, type SeededRng } from '../core/rng';
import { buildPopulationAccessIndex } from '../population/accessibility';
import type { PopulationState } from '../population/types';
import { findTrafficRoute } from '../simulation/traffic/routing';
import type { TrafficNetwork, TrafficRoute } from '../simulation/traffic/types';
import type { BuildingId, World } from '../world/types';
import type { MobilityConfig } from './config';
import { MOBILITY_CONFIG } from './config';
import { calculateMobilityMetrics } from './metrics';
import type {
  CitizenDailyPlan,
  CommutePurpose,
  CommuteTrip,
  MobilityState,
  RoutableCommuteTrip,
  UnreachableCommuteReason,
} from './types';

const MOBILITY_SEED_SEPARATOR = '\u001e';

function chooseWeightedIndex(
  rng: SeededRng,
  weights: readonly number[],
): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng.next() * total;
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return index;
  }
  return Math.max(0, weights.length - 1);
}

function commuteDurationMinutes(
  route: TrafficRoute | undefined,
  config: MobilityConfig,
): number {
  return route
    ? Math.max(1, Math.ceil(route.estimatedTravelTime / 60))
    : config.unreachableCommuteDurationMinutes;
}

function getCachedRoute(
  network: TrafficNetwork,
  cache: Map<string, TrafficRoute | null>,
  originNodeId: string,
  destinationNodeId: string,
): TrafficRoute | undefined {
  const key = `${originNodeId}\u001f${destinationNodeId}`;
  if (cache.has(key)) return cache.get(key) ?? undefined;
  const route = findTrafficRoute(network, originNodeId, destinationNodeId);
  cache.set(key, route ?? null);
  return route;
}

interface TripInput {
  readonly id: string;
  readonly citizenId: string;
  readonly workplaceId?: string;
  readonly purpose: CommutePurpose;
  readonly originBuildingId?: BuildingId;
  readonly destinationBuildingId?: BuildingId;
  readonly originAccessNodeId?: string;
  readonly destinationAccessNodeId?: string;
  readonly plannedDepartureMinute: number;
  readonly route?: TrafficRoute;
  readonly unreachableReason?: UnreachableCommuteReason;
}

function createTrip(input: TripInput): CommuteTrip {
  if (
    input.originBuildingId &&
    input.destinationBuildingId &&
    input.originAccessNodeId &&
    input.destinationAccessNodeId &&
    input.route
  ) {
    const trip: RoutableCommuteTrip = {
      id: input.id,
      citizenId: input.citizenId,
      workplaceId: input.workplaceId,
      purpose: input.purpose,
      originBuildingId: input.originBuildingId,
      destinationBuildingId: input.destinationBuildingId,
      originAccessNodeId: input.originAccessNodeId,
      destinationAccessNodeId: input.destinationAccessNodeId,
      plannedDepartureMinute: input.plannedDepartureMinute,
      routingStatus: 'routable',
      route: input.route,
      estimatedNetworkDistance: input.route.totalLength,
      estimatedNetworkTravelTime: input.route.estimatedTravelTime,
    };
    return trip;
  }
  return {
    id: input.id,
    citizenId: input.citizenId,
    workplaceId: input.workplaceId,
    purpose: input.purpose,
    originBuildingId: input.originBuildingId,
    destinationBuildingId: input.destinationBuildingId,
    originAccessNodeId: input.originAccessNodeId,
    destinationAccessNodeId: input.destinationAccessNodeId,
    plannedDepartureMinute: input.plannedDepartureMinute,
    routingStatus: 'unreachable',
    unreachableReason: input.unreachableReason ?? 'disconnected-route',
  };
}

function createHomePlan(citizenId: string, homeBuildingId: BuildingId): CitizenDailyPlan {
  return {
    citizenId,
    activities: [
      { type: 'home', startMinute: 0, endMinute: 1_440, buildingId: homeBuildingId },
    ],
  };
}

export function deriveMobilitySeed(
  world: World,
  population: PopulationState,
  config: MobilityConfig = MOBILITY_CONFIG,
): string {
  return [
    world.metadata.generatorVersion,
    world.metadata.seed,
    population.populationVersion,
    population.populationSeed,
    `mobility/${config.mobilityVersion}`,
  ].join(MOBILITY_SEED_SEPARATOR);
}

export function generateMobility(
  world: World,
  population: PopulationState,
  config: MobilityConfig = MOBILITY_CONFIG,
): MobilityState {
  const mobilitySeed = deriveMobilitySeed(world, population, config);
  const rootRng = createSeededRng(mobilitySeed);
  const access = buildPopulationAccessIndex(world);
  const routeCache = new Map<string, TrafficRoute | null>();
  const buildingIds = new Set(world.urban.buildings.map((building) => building.id));
  const dailyPlans: CitizenDailyPlan[] = [];
  const commuteTrips: CommuteTrip[] = [];
  let employedCommuters = 0;

  for (const citizen of [...population.citizens].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    if (
      citizen.employmentStatus !== 'employed' ||
      !citizen.workplaceId ||
      !citizen.workBuildingId
    ) {
      dailyPlans.push(createHomePlan(citizen.id, citizen.homeBuildingId));
      continue;
    }

    employedCommuters += 1;
    const citizenRng = rootRng.fork(`citizen/${citizen.id}`);
    const clusterIndex = chooseWeightedIndex(
      citizenRng.fork('routine/work-start-cluster'),
      config.workStartClusterWeights,
    );
    const cluster = config.workStartClusters[clusterIndex] ?? 510;
    const workStart = Math.min(
      600,
      Math.max(
        420,
        cluster +
          citizenRng
            .fork('routine/work-start')
            .int(-config.workStartJitterMinutes, config.workStartJitterMinutes + 1),
      ),
    );
    const [minimumWorkDuration, maximumWorkDuration] =
      config.workDurationRangeMinutes;
    const workEnd = Math.min(
      1_260,
      workStart +
        citizenRng
          .fork('routine/work-end')
          .int(minimumWorkDuration, maximumWorkDuration + 1),
    );
    const [minimumBuffer, maximumBuffer] = config.departureBufferRangeMinutes;
    const morningBuffer = citizenRng
      .fork('routine/departure-jitter')
      .int(minimumBuffer, maximumBuffer + 1);
    const eveningBuffer = citizenRng
      .fork('routine/return-jitter')
      .int(minimumBuffer, maximumBuffer + 1);

    const homeExists = buildingIds.has(citizen.homeBuildingId);
    const workExists = buildingIds.has(citizen.workBuildingId);
    const homeAccess = access.buildingAccessById.get(citizen.homeBuildingId);
    const workAccess = access.buildingAccessById.get(citizen.workBuildingId);
    const morningRoute =
      homeAccess && workAccess
        ? getCachedRoute(
            access.trafficNetwork,
            routeCache,
            homeAccess.accessNodeId,
            workAccess.accessNodeId,
          )
        : undefined;
    const eveningRoute =
      homeAccess && workAccess
        ? getCachedRoute(
            access.trafficNetwork,
            routeCache,
            workAccess.accessNodeId,
            homeAccess.accessNodeId,
          )
        : undefined;
    const morningDuration = commuteDurationMinutes(morningRoute, config);
    const eveningDuration = commuteDurationMinutes(eveningRoute, config);
    const morningDeparture = Math.max(
      1,
      workStart - morningDuration - morningBuffer,
    );
    const eveningArrival = Math.min(
      1_439,
      workEnd + eveningDuration + eveningBuffer,
    );
    const morningTripId = `trip/${citizen.id}/work`;
    const eveningTripId = `trip/${citizen.id}/home`;
    const commonReason: UnreachableCommuteReason | undefined = !homeExists
      ? 'missing-home-building'
      : !workExists
        ? 'missing-work-building'
        : !homeAccess
          ? 'missing-origin-access'
          : !workAccess
            ? 'missing-destination-access'
            : undefined;

    commuteTrips.push(
      createTrip({
        id: morningTripId,
        citizenId: citizen.id,
        workplaceId: citizen.workplaceId,
        purpose: 'commute-to-work',
        originBuildingId: homeExists ? citizen.homeBuildingId : undefined,
        destinationBuildingId: workExists ? citizen.workBuildingId : undefined,
        originAccessNodeId: homeAccess?.accessNodeId,
        destinationAccessNodeId: workAccess?.accessNodeId,
        plannedDepartureMinute: morningDeparture,
        route: morningRoute,
        unreachableReason: commonReason,
      }),
      createTrip({
        id: eveningTripId,
        citizenId: citizen.id,
        workplaceId: citizen.workplaceId,
        purpose: 'commute-home',
        originBuildingId: workExists ? citizen.workBuildingId : undefined,
        destinationBuildingId: homeExists ? citizen.homeBuildingId : undefined,
        originAccessNodeId: workAccess?.accessNodeId,
        destinationAccessNodeId: homeAccess?.accessNodeId,
        plannedDepartureMinute: workEnd,
        route: eveningRoute,
        unreachableReason: commonReason,
      }),
    );
    dailyPlans.push({
      citizenId: citizen.id,
      activities: [
        {
          type: 'home',
          startMinute: 0,
          endMinute: morningDeparture,
          buildingId: citizen.homeBuildingId,
        },
        {
          type: 'commute-to-work',
          startMinute: morningDeparture,
          endMinute: workStart,
          tripId: morningTripId,
        },
        {
          type: 'work',
          startMinute: workStart,
          endMinute: workEnd,
          buildingId: citizen.workBuildingId,
        },
        {
          type: 'commute-home',
          startMinute: workEnd,
          endMinute: eveningArrival,
          tripId: eveningTripId,
        },
        {
          type: 'home',
          startMinute: eveningArrival,
          endMinute: 1_440,
          buildingId: citizen.homeBuildingId,
        },
      ],
    });
  }

  dailyPlans.sort((first, second) => first.citizenId.localeCompare(second.citizenId));
  commuteTrips.sort(
    (first, second) =>
      first.plannedDepartureMinute - second.plannedDepartureMinute ||
      first.id.localeCompare(second.id),
  );
  return {
    mobilityVersion: config.mobilityVersion,
    mobilitySeed,
    dailyPlans,
    commuteTrips,
    metrics: calculateMobilityMetrics(employedCommuters, commuteTrips),
  };
}

