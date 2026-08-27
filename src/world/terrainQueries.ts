import type { TerrainData } from './types';

export interface TerrainSample {
  readonly elevation: number;
  readonly slope: number;
  readonly water: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sampleField(
  terrain: TerrainData,
  field: readonly number[],
  worldX: number,
  worldY: number,
): number {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    throw new RangeError('Terrain sample coordinates must be finite.');
  }

  const gridX = clamp(
    (worldX - terrain.origin.x) / terrain.cellSize,
    0,
    terrain.columns - 1,
  );
  const gridY = clamp(
    (worldY - terrain.origin.y) / terrain.cellSize,
    0,
    terrain.rows - 1,
  );
  const left = Math.floor(gridX);
  const top = Math.floor(gridY);
  const right = Math.min(terrain.columns - 1, left + 1);
  const bottom = Math.min(terrain.rows - 1, top + 1);
  const xBlend = gridX - left;
  const yBlend = gridY - top;
  const topLeft = field[top * terrain.columns + left];
  const topRight = field[top * terrain.columns + right];
  const bottomLeft = field[bottom * terrain.columns + left];
  const bottomRight = field[bottom * terrain.columns + right];
  const topValue = topLeft + (topRight - topLeft) * xBlend;
  const bottomValue = bottomLeft + (bottomRight - bottomLeft) * xBlend;

  return topValue + (bottomValue - topValue) * yBlend;
}

/** Samples normalized elevation with bilinear interpolation and edge clamping. */
export function sampleElevation(
  terrain: TerrainData,
  worldX: number,
  worldY: number,
): number {
  return sampleField(terrain, terrain.elevation, worldX, worldY);
}

/** Samples normalized derived slope with bilinear interpolation and edge clamping. */
export function sampleSlope(
  terrain: TerrainData,
  worldX: number,
  worldY: number,
): number {
  return sampleField(terrain, terrain.slope, worldX, worldY);
}

export function isWater(
  terrain: TerrainData,
  worldX: number,
  worldY: number,
): boolean {
  return sampleElevation(terrain, worldX, worldY) <= terrain.seaLevel;
}

export function sampleTerrain(
  terrain: TerrainData,
  worldX: number,
  worldY: number,
): TerrainSample {
  const elevation = sampleElevation(terrain, worldX, worldY);
  return {
    elevation,
    slope: sampleSlope(terrain, worldX, worldY),
    water: elevation <= terrain.seaLevel,
  };
}
