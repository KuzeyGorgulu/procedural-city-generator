import type {
  TrafficDemandCatalog,
  TrafficDemandTrip,
  UnreachableTrafficDemand,
} from '../simulation/traffic/types';
import type { MobilityConfig } from './config';
import { MOBILITY_CONFIG } from './config';
import type { MobilityState } from './types';

/**
 * Converts immutable Phase 7 plans into the plain demand format consumed by
 * the Phase 4 traffic kernel. Neither side owns or mutates the other.
 */
export function createTrafficDemandCatalog(
  mobility: MobilityState,
  config: MobilityConfig = MOBILITY_CONFIG,
): TrafficDemandCatalog {
  const trips: TrafficDemandTrip[] = [];
  const unreachableTrips: UnreachableTrafficDemand[] = [];

  for (const trip of mobility.commuteTrips) {
    if (trip.routingStatus === 'routable') {
      trips.push({
        id: trip.id,
        citizenId: trip.citizenId,
        purpose: trip.purpose,
        originBuildingId: trip.originBuildingId,
        destinationBuildingId: trip.destinationBuildingId,
        plannedDepartureMinute: trip.plannedDepartureMinute,
        route: trip.route,
      });
    } else {
      unreachableTrips.push({
        id: trip.id,
        citizenId: trip.citizenId,
        purpose: trip.purpose,
        plannedDepartureMinute: trip.plannedDepartureMinute,
      });
    }
  }

  return {
    mobilityVersion: mobility.mobilityVersion,
    employedCommuters: mobility.metrics.employedCommuters,
    demandSecondsPerPlannedMinute: config.demandSecondsPerPlannedMinute,
    trips,
    unreachableTrips,
  };
}
