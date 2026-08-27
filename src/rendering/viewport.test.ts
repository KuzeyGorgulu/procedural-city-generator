import { describe, expect, it } from 'vitest';
import { screenToWorld, worldToScreen, zoomCameraAtPoint, type Camera } from './viewport';

const viewport = { width: 1_000, height: 700 };
const camera: Camera = { center: { x: 800, y: 500 }, zoom: 0.75 };

describe('viewport transforms', () => {
  it('round-trips between world and screen coordinates', () => {
    const worldPoint = { x: 1_234.5, y: 678.25 };
    const roundTrip = screenToWorld(worldToScreen(worldPoint, camera, viewport), camera, viewport);
    expect(roundTrip.x).toBeCloseTo(worldPoint.x);
    expect(roundTrip.y).toBeCloseTo(worldPoint.y);
  });

  it('keeps the cursor world position fixed while zooming', () => {
    const cursor = { x: 240, y: 180 };
    const anchorBefore = screenToWorld(cursor, camera, viewport);
    const zoomedCamera = zoomCameraAtPoint(camera, cursor, viewport, 1.8);
    const anchorAfter = screenToWorld(cursor, zoomedCamera, viewport);
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y);
  });
});
