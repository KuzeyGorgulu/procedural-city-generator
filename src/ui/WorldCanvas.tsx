import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { renderWorld, type WorldViewMode } from '../rendering/canvasRenderer';
import type { TrafficSimulationController } from '../simulation/traffic/trafficController';
import { getVehiclePose } from '../simulation/traffic/vehicleQueries';
import { pointDistance } from '../world/roadGeometry';
import {
  fitCameraToBounds,
  panCamera,
  screenToWorld,
  zoomCameraAtPoint,
  type Camera,
  type ViewportSize,
} from '../rendering/viewport';
import type { Point, World } from '../world/types';

interface WorldCanvasProps {
  readonly world: World;
  readonly viewMode: WorldViewMode;
  readonly trafficController: TrafficSimulationController;
  readonly selectedVehicleId?: string;
  readonly onSelectVehicle: (vehicleId?: string) => void;
}

const INITIAL_VIEWPORT: ViewportSize = { width: 960, height: 640 };

export function WorldCanvas({
  world,
  viewMode,
  trafficController,
  selectedVehicleId,
  onSelectVehicle,
}: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragPositionRef = useRef<Point | null>(null);
  const dragDistanceRef = useRef(0);
  const [viewport, setViewport] = useState<ViewportSize>(INITIAL_VIEWPORT);
  const [camera, setCamera] = useState<Camera>(() =>
    fitCameraToBounds(world.bounds, INITIAL_VIEWPORT),
  );
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = () => {
      const rect = canvas.getBoundingClientRect();
      const nextViewport = {
        width: Math.max(1, Math.round(rect.width)),
        height: Math.max(1, Math.round(rect.height)),
      };
      const pixelRatio = window.devicePixelRatio || 1;

      canvas.width = Math.round(nextViewport.width * pixelRatio);
      canvas.height = Math.round(nextViewport.height * pixelRatio);
      setViewport(nextViewport);
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setCamera(fitCameraToBounds(world.bounds, viewport));
  }, [world, viewport]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    const draw = () =>
      renderWorld(
        context,
        world,
        camera,
        viewport,
        window.devicePixelRatio || 1,
        viewMode,
        {
          network: trafficController.network,
          state: trafficController.state,
          selectedVehicleId,
        },
      );
    draw();
    return trafficController.subscribe(draw);
  }, [world, camera, viewport, viewMode, trafficController, selectedVehicleId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const screenPoint = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      const zoomFactor = Math.exp(-event.deltaY * 0.0015);
      setCamera((current) =>
        zoomCameraAtPoint(current, screenPoint, viewport, zoomFactor),
      );
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [viewport]);

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragPositionRef.current = { x: event.clientX, y: event.clientY };
    dragDistanceRef.current = 0;
    setIsDragging(true);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    const previous = dragPositionRef.current;
    if (!previous) return;

    const next = { x: event.clientX, y: event.clientY };
    dragDistanceRef.current += pointDistance(previous, next);
    setCamera((current) =>
      panCamera(current, { x: next.x - previous.x, y: next.y - previous.y }),
    );
    dragPositionRef.current = next;
  }

  function releasePointer(
    event: PointerEvent<HTMLCanvasElement>,
    selectVehicle: boolean,
  ) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (selectVehicle && dragDistanceRef.current <= 4) {
      const rect = event.currentTarget.getBoundingClientRect();
      const worldPoint = screenToWorld(
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        camera,
        viewport,
      );
      const selectionRadius = 16 / camera.zoom;
      const nearest = trafficController.state.vehicles
        .map((vehicle) => ({
          vehicle,
          pose: getVehiclePose(vehicle, trafficController.network),
        }))
        .filter((entry) => entry.pose !== undefined)
        .map((entry) => ({
          id: entry.vehicle.id,
          distance: pointDistance(worldPoint, entry.pose!.position),
        }))
        .filter((entry) => entry.distance <= selectionRadius)
        .sort(
          (first, second) =>
            first.distance - second.distance || first.id.localeCompare(second.id),
        )[0];
      onSelectVehicle(nearest?.id);
    }
    dragPositionRef.current = null;
    dragDistanceRef.current = 0;
    setIsDragging(false);
  }

  function handlePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    releasePointer(event, true);
  }

  function handlePointerCancel(event: PointerEvent<HTMLCanvasElement>) {
    releasePointer(event, false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>) {
    const panStep = 32;
    const deltas: Partial<Record<string, Point>> = {
      ArrowUp: { x: 0, y: panStep },
      ArrowDown: { x: 0, y: -panStep },
      ArrowLeft: { x: panStep, y: 0 },
      ArrowRight: { x: -panStep, y: 0 },
    };
    const delta = deltas[event.key];

    if (delta) {
      event.preventDefault();
      setCamera((current) => panCamera(current, delta));
    } else if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      setCamera((current) =>
        zoomCameraAtPoint(
          current,
          { x: viewport.width / 2, y: viewport.height / 2 },
          viewport,
          1.2,
        ),
      );
    } else if (event.key === '-') {
      event.preventDefault();
      setCamera((current) =>
        zoomCameraAtPoint(
          current,
          { x: viewport.width / 2, y: viewport.height / 2 },
          viewport,
          1 / 1.2,
        ),
      );
    }
  }

  return (
    <canvas
      aria-label="Generated city and traffic viewport. Drag or use arrow keys to pan; scroll or use plus and minus to zoom; click a vehicle to inspect its route."
      className={isDragging ? 'world-canvas is-dragging' : 'world-canvas'}
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      ref={canvasRef}
      role="img"
      tabIndex={0}
    />
  );
}
