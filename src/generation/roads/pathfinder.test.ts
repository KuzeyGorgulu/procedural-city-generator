import { describe, expect, it } from 'vitest';
import type { TerrainData, WorldBounds } from '../../world/types';
import { findTerrainPath, getTerrainTraversalCost } from './pathfinder';

const BOUNDS: WorldBounds = { x: 0, y: 0, width: 300, height: 200 };

function createTerrain(slope: readonly number[]): TerrainData {
  return {
    origin: { x: 0, y: 0 },
    width: 300,
    height: 200,
    columns: 7,
    rows: 5,
    cellSize: 50,
    seaLevel: 0.2,
    slopeNormalization: 0.14,
    elevation: Array(35).fill(0.8),
    slope,
  };
}

describe('terrain-aware road pathfinding', () => {
  it('treats water and excessive slope as impassable', () => {
    const waterTerrain = {
      ...createTerrain(Array(35).fill(0)),
      elevation: Array(35).fill(0.1),
    };
    expect(
      getTerrainTraversalCost(
        waterTerrain,
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { maxSlope: 0.8, slopePenalty: 5, sampleStep: 25 },
      ),
    ).toBe(Number.POSITIVE_INFINITY);

    const steepTerrain = createTerrain(Array(35).fill(0.9));
    expect(
      getTerrainTraversalCost(
        steepTerrain,
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { maxSlope: 0.8, slopePenalty: 5, sampleStep: 25 },
      ),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('routes around a high-cost slope instead of taking the straight line', () => {
    const slope = Array(35).fill(0);
    slope[2 * 7 + 3] = 0.8;
    const path = findTerrainPath({
      terrain: createTerrain(slope),
      bounds: BOUNDS,
      start: { x: 0, y: 100 },
      goal: { x: 300, y: 100 },
      routingStep: 50,
      terrainSampleStep: 25,
      boundaryMargin: 0,
      maxSlope: 1,
      slopePenalty: 100,
      turnPenalty: 0,
      maxSearchStates: 5_000,
    });

    expect(path).toBeDefined();
    expect(path?.some((point) => point.y !== 100)).toBe(true);
    expect(path).not.toContainEqual({ x: 150, y: 100 });
  });

  it('resolves equal-cost searches reproducibly', () => {
    const options = {
      terrain: createTerrain(Array(35).fill(0)),
      bounds: BOUNDS,
      start: { x: 0, y: 100 },
      goal: { x: 300, y: 100 },
      routingStep: 50,
      terrainSampleStep: 25,
      boundaryMargin: 0,
      maxSlope: 1,
      slopePenalty: 0,
      turnPenalty: 0,
      maxSearchStates: 5_000,
    } as const;

    expect(findTerrainPath(options)).toEqual(findTerrainPath(options));
  });
});
