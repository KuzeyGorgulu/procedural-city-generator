export interface UrbanGenerationConfig {
  readonly geometryEpsilon: number;
  readonly minBlockArea: number;
  readonly maxBlockArea: number;
  readonly minLandRatio: number;
  readonly terrainSampleSpacing: number;
  readonly minParcelArea: number;
  readonly maxParcelArea: number;
  readonly targetParcelAreaMin: number;
  readonly targetParcelAreaMax: number;
  readonly minParcelAspectRatio: number;
  readonly minFrontageLength: number;
  readonly splitJitter: number;
  readonly maxSplitDepth: number;
  readonly areaToleranceRatio: number;
}

/** Phase 3.0 urban constants remain unchanged by Phase 3.5 morphology work. */
export const URBAN_CONFIG: UrbanGenerationConfig = {
  geometryEpsilon: 1e-7,
  minBlockArea: 3_000,
  maxBlockArea: 600_000,
  minLandRatio: 0.7,
  terrainSampleSpacing: 50,
  minParcelArea: 3_000,
  maxParcelArea: 50_000,
  targetParcelAreaMin: 9_000,
  targetParcelAreaMax: 15_000,
  minParcelAspectRatio: 0.1,
  minFrontageLength: 4,
  splitJitter: 0.12,
  maxSplitDepth: 8,
  areaToleranceRatio: 1e-6,
};
