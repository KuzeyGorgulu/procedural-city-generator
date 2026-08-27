import type { Point, WorldBounds } from '../world/types';

export interface Camera {
  readonly center: Point;
  readonly zoom: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 12;

export function worldToScreen(
  point: Point,
  camera: Camera,
  viewport: ViewportSize,
): Point {
  return {
    x: (point.x - camera.center.x) * camera.zoom + viewport.width / 2,
    y: (point.y - camera.center.y) * camera.zoom + viewport.height / 2,
  };
}

export function screenToWorld(
  point: Point,
  camera: Camera,
  viewport: ViewportSize,
): Point {
  return {
    x: (point.x - viewport.width / 2) / camera.zoom + camera.center.x,
    y: (point.y - viewport.height / 2) / camera.zoom + camera.center.y,
  };
}

export function panCamera(camera: Camera, screenDelta: Point): Camera {
  return {
    ...camera,
    center: {
      x: camera.center.x - screenDelta.x / camera.zoom,
      y: camera.center.y - screenDelta.y / camera.zoom,
    },
  };
}

export function zoomCameraAtPoint(
  camera: Camera,
  screenPoint: Point,
  viewport: ViewportSize,
  zoomFactor: number,
): Camera {
  const anchorBeforeZoom = screenToWorld(screenPoint, camera, viewport);
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * zoomFactor));

  return {
    zoom,
    center: {
      x: anchorBeforeZoom.x - (screenPoint.x - viewport.width / 2) / zoom,
      y: anchorBeforeZoom.y - (screenPoint.y - viewport.height / 2) / zoom,
    },
  };
}

export function fitCameraToBounds(
  bounds: WorldBounds,
  viewport: ViewportSize,
  padding = 48,
): Camera {
  const availableWidth = Math.max(1, viewport.width - padding * 2);
  const availableHeight = Math.max(1, viewport.height - padding * 2);

  return {
    center: {
      x: bounds.x + bounds.width / 2,
      y: bounds.y + bounds.height / 2,
    },
    zoom: Math.min(
      MAX_ZOOM,
      Math.max(MIN_ZOOM, Math.min(availableWidth / bounds.width, availableHeight / bounds.height)),
    ),
  };
}
