import type { SeededRng } from '../../core/rng';
import type { TerrainData, WorldBounds } from '../../world/types';
import type { TerrainGenerationConfig } from './config';
import { createNoiseDomain, sampleFbm } from './noise';

export interface GenerateTerrainInput {
  readonly bounds: WorldBounds;
  readonly rng: SeededRng;
  readonly config: TerrainGenerationConfig;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(start: number, end: number, value: number): number {
  const normalized = clamp01((value - start) / (end - start));
  return normalized * normalized * (3 - 2 * normalized);
}

export function deriveSlopes(
  elevation: readonly number[],
  columns: number,
  rows: number,
  slopeNormalization: number,
): number[] {
  return elevation.map((_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const leftColumn = Math.max(0, column - 1);
    const rightColumn = Math.min(columns - 1, column + 1);
    const topRow = Math.max(0, row - 1);
    const bottomRow = Math.min(rows - 1, row + 1);

    const horizontalSpan = Math.max(1, rightColumn - leftColumn);
    const verticalSpan = Math.max(1, bottomRow - topRow);
    const horizontalChange =
      (elevation[row * columns + rightColumn] -
        elevation[row * columns + leftColumn]) /
      horizontalSpan;
    const verticalChange =
      (elevation[bottomRow * columns + column] -
        elevation[topRow * columns + column]) /
      verticalSpan;

    return clamp01(
      Math.hypot(horizontalChange, verticalChange) / slopeNormalization,
    );
  });
}

export function generateTerrain({
  bounds,
  rng,
  config,
}: GenerateTerrainInput): TerrainData {
  const columnCount = bounds.width / config.cellSize;
  const rowCount = bounds.height / config.cellSize;

  if (!Number.isInteger(columnCount) || !Number.isInteger(rowCount)) {
    throw new Error('Terrain cell size must divide the world dimensions exactly.');
  }

  const columns = columnCount + 1;
  const rows = rowCount + 1;
  const detailDomain = createNoiseDomain(
    rng.fork('elevation/fbm-v1'),
    config.octaves,
  );
  const regionalDomain = createNoiseDomain(
    rng.fork('elevation/regional-v1'),
    2,
  );

  const elevation = Array.from({ length: columns * rows }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const worldX = bounds.x + column * config.cellSize;
    const worldY = bounds.y + row * config.cellSize;
    const detail = sampleFbm(
      detailDomain,
      worldX / config.baseNoiseScale,
      worldY / config.baseNoiseScale,
      config.persistence,
      config.lacunarity,
    );
    const regional = sampleFbm(
      regionalDomain,
      worldX / config.regionalNoiseScale,
      worldY / config.regionalNoiseScale,
      config.persistence,
      config.lacunarity,
    );

    const normalizedX = (worldX - (bounds.x + bounds.width / 2)) / (bounds.width / 2);
    const normalizedY = (worldY - (bounds.y + bounds.height / 2)) / (bounds.height / 2);
    const distanceFromCenter = Math.hypot(normalizedX, normalizedY);
    const landmass = 1 - smoothstep(0.45, 1.2, distanceFromCenter);

    return clamp01(
      detail * 0.56 +
        regional * 0.22 +
        landmass * config.islandWeight -
        0.06,
    );
  });
  const slope = deriveSlopes(
    elevation,
    columns,
    rows,
    config.slopeNormalization,
  );

  return {
    origin: { x: bounds.x, y: bounds.y },
    width: bounds.width,
    height: bounds.height,
    columns,
    rows,
    cellSize: config.cellSize,
    seaLevel: config.seaLevel,
    slopeNormalization: config.slopeNormalization,
    elevation,
    slope,
  };
}
