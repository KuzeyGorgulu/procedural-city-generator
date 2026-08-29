import type { TrafficArc, TrafficNetwork, Vehicle, VehiclePose } from './types';

export function getVehicleCurrentArc(
  vehicle: Vehicle,
  network: TrafficNetwork,
): TrafficArc | undefined {
  const arcId = vehicle.route.arcIds[vehicle.routeArcIndex];
  return arcId ? network.arcsById.get(arcId) : undefined;
}

export function getVehiclePose(
  vehicle: Vehicle,
  network: TrafficNetwork,
): VehiclePose | undefined {
  const arc = getVehicleCurrentArc(vehicle, network);
  if (!arc || !Number.isFinite(arc.length) || arc.length <= 0) return undefined;
  const from = network.nodesById.get(arc.from);
  const to = network.nodesById.get(arc.to);
  if (!from || !to) return undefined;
  const amount = Math.min(1, Math.max(0, vehicle.progressOnArc / arc.length));
  return {
    position: {
      x: from.position.x + (to.position.x - from.position.x) * amount,
      y: from.position.y + (to.position.y - from.position.y) * amount,
    },
    angle: Math.atan2(
      to.position.y - from.position.y,
      to.position.x - from.position.x,
    ),
    arcId: arc.id,
  };
}

export function getVehicleTripProgress(vehicle: Vehicle): number {
  return vehicle.route.totalLength <= 0
    ? 1
    : Math.min(1, Math.max(0, vehicle.distanceTravelled / vehicle.route.totalLength));
}
