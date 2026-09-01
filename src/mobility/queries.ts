import type { CitizenId } from '../population/types';
import type {
  CitizenDailyPlan,
  CommuteTrip,
  CommuteTripId,
  MobilityState,
} from './types';

export interface MobilityIndex {
  readonly dailyPlanByCitizenId: ReadonlyMap<CitizenId, CitizenDailyPlan>;
  readonly tripById: ReadonlyMap<CommuteTripId, CommuteTrip>;
  readonly tripsByCitizenId: ReadonlyMap<CitizenId, readonly CommuteTrip[]>;
}

export function buildMobilityIndex(mobility: MobilityState): MobilityIndex {
  const tripsByCitizenId = new Map<CitizenId, CommuteTrip[]>();
  for (const trip of mobility.commuteTrips) {
    const trips = tripsByCitizenId.get(trip.citizenId) ?? [];
    trips.push(trip);
    tripsByCitizenId.set(trip.citizenId, trips);
  }
  for (const trips of tripsByCitizenId.values()) {
    trips.sort(
      (first, second) =>
        first.plannedDepartureMinute - second.plannedDepartureMinute ||
        first.id.localeCompare(second.id),
    );
  }
  return {
    dailyPlanByCitizenId: new Map(
      mobility.dailyPlans.map((plan) => [plan.citizenId, plan]),
    ),
    tripById: new Map(mobility.commuteTrips.map((trip) => [trip.id, trip])),
    tripsByCitizenId,
  };
}

export function getDailyPlanForCitizen(
  index: MobilityIndex,
  citizenId: CitizenId,
): CitizenDailyPlan | undefined {
  return index.dailyPlanByCitizenId.get(citizenId);
}

export function getTripsForCitizen(
  index: MobilityIndex,
  citizenId: CitizenId,
): readonly CommuteTrip[] {
  return index.tripsByCitizenId.get(citizenId) ?? [];
}

export function getTripById(
  index: MobilityIndex,
  tripId: CommuteTripId,
): CommuteTrip | undefined {
  return index.tripById.get(tripId);
}

