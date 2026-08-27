export interface TerrainGenerationConfig {
  readonly cellSize: number;
  readonly seaLevel: number;
  readonly baseNoiseScale: number;
  readonly regionalNoiseScale: number;
  readonly octaves: number;
  readonly persistence: number;
  readonly lacunarity: number;
  readonly islandWeight: number;
  readonly slopeNormalization: number;
}

/** Constants are part of the phase-1.0 deterministic generation behavior. */
export const TERRAIN_CONFIG: TerrainGenerationConfig = {
  cellSize: 25,
  seaLevel: 0.46,
  baseNoiseScale: 720,
  regionalNoiseScale: 1_800,
  octaves: 5,
  persistence: 0.5,
  lacunarity: 2,
  islandWeight: 0.34,
  slopeNormalization: 0.14,
};
