import type {
  BuildingUse,
  DevelopmentIntensity,
} from '../../world/types';

export interface BuildingSetbacks {
  readonly front: number;
  readonly side: number;
  readonly rear: number;
}

export interface BuildingGenerationConfig {
  readonly geometryEpsilon: number;
  readonly minimumFootprintArea: number;
  readonly containmentSampleSpacing: number;
  readonly terrainSampleSpacing: number;
  readonly maxFootprintMeanSlope: number;
  readonly floorHeightMeters: number;
  readonly setbacksByUse: Readonly<Record<BuildingUse, BuildingSetbacks>>;
  readonly coverageRangeByUse: Readonly<
    Record<BuildingUse, readonly [number, number]>
  >;
  readonly floorsByUseAndIntensity: Readonly<
    Record<
      BuildingUse,
      Readonly<Record<DevelopmentIntensity, readonly [number, number]>>
    >
  >;
  readonly usableAreaRatioByUse: Readonly<Record<BuildingUse, number>>;
}

export const BUILDING_CONFIG: BuildingGenerationConfig = {
  geometryEpsilon: 1e-7,
  minimumFootprintArea: 180,
  containmentSampleSpacing: 4,
  terrainSampleSpacing: 10,
  maxFootprintMeanSlope: 0.5,
  floorHeightMeters: 3.2,
  setbacksByUse: {
    residential: { front: 6, side: 4.5, rear: 5 },
    commercial: { front: 2.5, side: 2.5, rear: 3.5 },
    industrial: { front: 8, side: 6, rear: 7 },
    'mixed-use': { front: 3.5, side: 3, rear: 4 },
    civic: { front: 6, side: 5, rear: 5 },
  },
  coverageRangeByUse: {
    residential: [0.28, 0.44],
    commercial: [0.46, 0.66],
    industrial: [0.48, 0.7],
    'mixed-use': [0.42, 0.62],
    civic: [0.34, 0.56],
  },
  floorsByUseAndIntensity: {
    residential: { low: [1, 2], medium: [2, 4], high: [3, 6] },
    commercial: { low: [2, 3], medium: [3, 6], high: [5, 9] },
    industrial: { low: [1, 2], medium: [1, 2], high: [2, 3] },
    'mixed-use': { low: [2, 3], medium: [3, 5], high: [4, 8] },
    civic: { low: [1, 2], medium: [2, 4], high: [3, 5] },
  },
  usableAreaRatioByUse: {
    residential: 0.82,
    commercial: 0.78,
    industrial: 0.86,
    'mixed-use': 0.8,
    civic: 0.74,
  },
};
