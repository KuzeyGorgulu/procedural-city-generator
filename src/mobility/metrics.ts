import type {
  CommutePurpose,
  CommuteTrip,
  MobilityMetrics,
  MobilityWaveMetrics,
} from './types';

function calculateWaveMetrics(
  trips: readonly CommuteTrip[],
  purpose: CommutePurpose,
): MobilityWaveMetrics {
  const waveTrips = trips.filter((trip) => trip.purpose === purpose);
  const routable = waveTrips.filter(
    (trip) => trip.routingStatus === 'routable',
  );
  const totalDistance = routable.reduce(
    (total, trip) => total + trip.estimatedNetworkDistance,
    0,
  );
  const totalTravelTime = routable.reduce(
    (total, trip) => total + trip.estimatedNetworkTravelTime,
    0,
  );
  return {
    plannedTrips: waveTrips.length,
    routableTrips: routable.length,
    unreachableTrips: waveTrips.length - routable.length,
    averageEstimatedDistance:
      routable.length === 0 ? 0 : totalDistance / routable.length,
    averageEstimatedTravelTime:
      routable.length === 0 ? 0 : totalTravelTime / routable.length,
  };
}

export function calculateMobilityMetrics(
  employedCommuters: number,
  trips: readonly CommuteTrip[],
): MobilityMetrics {
  const morning = calculateWaveMetrics(trips, 'commute-to-work');
  const evening = calculateWaveMetrics(trips, 'commute-home');
  const routableTrips = morning.routableTrips + evening.routableTrips;
  const totalDistance =
    morning.averageEstimatedDistance * morning.routableTrips +
    evening.averageEstimatedDistance * evening.routableTrips;
  const totalTime =
    morning.averageEstimatedTravelTime * morning.routableTrips +
    evening.averageEstimatedTravelTime * evening.routableTrips;
  return {
    employedCommuters,
    plannedCommuteTrips: trips.length,
    routableTrips,
    unreachableTrips: trips.length - routableTrips,
    averageEstimatedCommuteDistance:
      routableTrips === 0 ? 0 : totalDistance / routableTrips,
    averageEstimatedCommuteTime:
      routableTrips === 0 ? 0 : totalTime / routableTrips,
    morning,
    evening,
  };
}

