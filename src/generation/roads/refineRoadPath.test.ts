import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../core/rng';
import { pointDistance } from '../../world/roadGeometry';
import type { TerrainData, WorldBounds } from '../../world/types';
import { ROAD_CONFIG } from './config';
import { refineRoadPath } from './refineRoadPath';

const BOUNDS: WorldBounds = { x: 0, y: 0, width: 1_000, height: 600 };

function createFlatTerrain(): TerrainData {
  const columns = 21;
  const rows = 13;
  return {
    origin: { x: 0, y: 0 },
    width: BOUNDS.width,
    height: BOUNDS.height,
    columns,
    rows,
    cellSize: 50,
    seaLevel: 0.2,
    slopeNormalization: 0.14,
    elevation: Array(columns * rows).fill(0.8),
    slope: Array(columns * rows).fill(0),
  };
}

describe('refineRoadPath', () => {
  it('turns a long straight run into deterministic canonical gentle geometry', () => {
    const input = {
      points: [
        { x: 200, y: 250 },
        { x: 800, y: 250 },
      ],
      roadType: 'arterial' as const,
      terrain: createFlatTerrain(),
      bounds: BOUNDS,
      config: ROAD_CONFIG,
    };
    const first = refineRoadPath({
      ...input,
      rng: createSeededRng('road-refinement'),
    });
    const second = refineRoadPath({
      ...input,
      rng: createSeededRng('road-refinement'),
    });

    expect(first).toEqual(second);
    expect(first[0]).toEqual(input.points[0]);
    expect(first.at(-1)).toEqual(input.points[1]);
    expect(first.some((point) => point.y !== 250)).toBe(true);
    for (let index = 1; index < first.length; index += 1) {
      expect(pointDistance(first[index - 1], first[index])).toBeLessThanOrEqual(
        ROAD_CONFIG.maxStraightEdgeLength,
      );
    }
  });

  it('rounds a right-angle route without changing its endpoints', () => {
    const refined = refineRoadPath({
      points: [
        { x: 200, y: 200 },
        { x: 500, y: 200 },
        { x: 500, y: 400 },
      ],
      roadType: 'secondary',
      terrain: createFlatTerrain(),
      bounds: BOUNDS,
      rng: createSeededRng('rounded-corner'),
      config: ROAD_CONFIG,
    });

    expect(refined[0]).toEqual({ x: 200, y: 200 });
    expect(refined.at(-1)).toEqual({ x: 500, y: 400 });
    expect(refined).not.toContainEqual({ x: 500, y: 200 });
    expect(refined.length).toBeGreaterThan(3);
  });
});
