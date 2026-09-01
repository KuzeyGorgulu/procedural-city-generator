import type {
  TrafficNetwork,
  TrafficSimulationState,
  Vehicle,
} from '../simulation/traffic/types';
import { getVehiclePose } from '../simulation/traffic/vehicleQueries';
import type { Camera, ViewportSize } from './viewport';
import { worldToScreen } from './viewport';

export interface TrafficRenderInput {
  readonly network: TrafficNetwork;
  readonly state: TrafficSimulationState;
  readonly selectedVehicleId?: string;
}

function drawSelectedRoute(
  context: CanvasRenderingContext2D,
  vehicle: Vehicle,
  network: TrafficNetwork,
  camera: Camera,
  viewport: ViewportSize,
): void {
  context.save();
  context.beginPath();
  for (const arcId of vehicle.route.arcIds) {
    const arc = network.arcsById.get(arcId);
    const from = arc && network.nodesById.get(arc.from);
    const to = arc && network.nodesById.get(arc.to);
    if (!from || !to) continue;
    const start = worldToScreen(from.position, camera, viewport);
    const end = worldToScreen(to.position, camera, viewport);
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  }
  context.strokeStyle = 'rgba(214, 104, 255, 0.78)';
  context.lineWidth = 5;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
  context.restore();
}

function drawVehicle(
  context: CanvasRenderingContext2D,
  vehicle: Vehicle,
  network: TrafficNetwork,
  camera: Camera,
  viewport: ViewportSize,
  selected: boolean,
): void {
  const pose = getVehiclePose(vehicle, network);
  if (!pose) return;
  const screen = worldToScreen(pose.position, camera, viewport);
  const length = selected ? 10 : 8;
  const width = selected ? 6 : 4.5;

  context.save();
  context.translate(screen.x, screen.y);
  context.rotate(pose.angle);
  context.beginPath();
  context.moveTo(length / 2, 0);
  context.lineTo(-length / 2, -width / 2);
  context.lineTo(-length / 2, width / 2);
  context.closePath();
  context.fillStyle = selected
    ? '#f36dff'
    : vehicle.movementState === 'queued'
      ? '#ff8a65'
      : vehicle.source === 'population'
        ? '#ffe082'
        : '#69f3ff';
  context.fill();
  context.strokeStyle = '#071018';
  context.lineWidth = 1.25;
  context.stroke();
  context.restore();
}

export function drawTraffic(
  context: CanvasRenderingContext2D,
  traffic: TrafficRenderInput,
  camera: Camera,
  viewport: ViewportSize,
): void {
  const selected = traffic.selectedVehicleId
    ? traffic.state.vehicles.find(
        (vehicle) => vehicle.id === traffic.selectedVehicleId,
      )
    : undefined;
  if (selected) {
    drawSelectedRoute(context, selected, traffic.network, camera, viewport);
  }
  for (const vehicle of traffic.state.vehicles) {
    drawVehicle(
      context,
      vehicle,
      traffic.network,
      camera,
      viewport,
      vehicle.id === traffic.selectedVehicleId,
    );
  }
}
