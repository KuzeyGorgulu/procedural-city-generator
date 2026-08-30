export interface ZoningGenerationConfig {
  readonly geometryEpsilon: number;
  readonly minimumDevelopableArea: number;
  readonly minimumUsableDimension: number;
  readonly minimumRoadFrontage: number;
  readonly minimumLandRatio: number;
  readonly maxDevelopableMeanSlope: number;
  readonly greenMeanSlope: number;
  readonly waterProbeRadius: number;
  readonly openSpaceBlockChance: number;
  readonly civicBlockChance: number;
}

export const ZONING_CONFIG: ZoningGenerationConfig = {
  geometryEpsilon: 1e-7,
  minimumDevelopableArea: 3_500,
  minimumUsableDimension: 16,
  minimumRoadFrontage: 10,
  minimumLandRatio: 0.72,
  maxDevelopableMeanSlope: 0.55,
  greenMeanSlope: 0.38,
  waterProbeRadius: 90,
  openSpaceBlockChance: 0.07,
  civicBlockChance: 0.065,
};
