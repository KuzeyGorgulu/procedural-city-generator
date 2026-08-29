import type {
  SegmentOccupancy,
  TrafficMetrics,
  TrafficNetwork,
  TrafficSimulationState,
} from './types';
import { getVehicleTripProgress } from './vehicleQueries';

export function getTrafficMetrics(
  state: TrafficSimulationState,
  network: TrafficNetwork,
): TrafficMetrics {
  let totalSpeed = 0;
  let totalProgress = 0;
  const occupancyCounts = new Map<string, number>();
  for (const vehicle of state.vehicles) {
    totalSpeed += vehicle.currentSpeed;
    totalProgress += getVehicleTripProgress(vehicle);
    const arcId = vehicle.route.arcIds[vehicle.routeArcIndex];
    if (arcId) {
      occupancyCounts.set(arcId, (occupancyCounts.get(arcId) ?? 0) + 1);
    }
  }

  const segmentOccupancy: SegmentOccupancy[] = [];
  for (const [arcId, vehicleCount] of occupancyCounts) {
    const arc = network.arcsById.get(arcId);
    if (!arc) continue;
    segmentOccupancy.push({
      arcId,
      sourceEdgeId: arc.sourceEdgeId,
      vehicleCount,
    });
  }
  segmentOccupancy.sort((first, second) => first.arcId.localeCompare(second.arcId));

  return {
    activeVehicleCount: state.vehicles.length,
    completedTrips: state.completedTrips,
    averageCurrentSpeed:
      state.vehicles.length === 0 ? 0 : totalSpeed / state.vehicles.length,
    averageTripProgress:
      state.vehicles.length === 0 ? 0 : totalProgress / state.vehicles.length,
    averageCompletedTravelTime:
      state.completedTrips === 0
        ? 0
        : state.totalCompletedTravelTime / state.completedTrips,
    segmentOccupancy,
  };
}
