import type { WellbeingDimension, WellbeingScores } from './types';

export interface ExposureConfig {
  readonly greenSearchRadius: number;
  readonly greenAreaReference: number;
  readonly greenStrongestContributionWeight: number;
  readonly greenSurroundingContributionWeight: number;
  readonly densitySearchRadius: number;
  readonly densityFloorAreaReference: number;
  readonly densityComfortThreshold: number;
  readonly roadNoiseSearchRadius: number;
  readonly roadLengthReference: number;
  readonly roadNoiseSaturation: number;
  readonly roadBaseLengthWeight: number;
  readonly roadScaledLengthWeight: number;
  readonly arterialNoiseWeight: number;
  readonly secondaryNoiseWeight: number;
  readonly environmentalQualityBaseline: number;
  readonly environmentalQualityGreenWeight: number;
  readonly environmentalQualityDensityWeight: number;
  readonly environmentalQualityRoadWeight: number;
  readonly householdCrowdingWeight: number;
  readonly householdSizeCrowdingReference: number;
  readonly residentOccupancyWeight: number;
  readonly dwellingOccupancyWeight: number;
  readonly missingLocationEnvironmentalQuality: number;
}

export interface StaticFactorWeights {
  readonly homeGreen: WellbeingScores;
  readonly homeDensityPressure: WellbeingScores;
  readonly homeRoadNoise: WellbeingScores;
  readonly homeCrowding: WellbeingScores;
  readonly workplaceGreen: WellbeingScores;
  readonly workplaceDensityPressure: WellbeingScores;
  readonly workplaceRoadNoise: WellbeingScores;
}

export interface CommuteImpactWeights {
  readonly minimumExpectedTravelTime: number;
  readonly chronicTravelTimeReference: number;
  readonly queueWaitReference: number;
  readonly unexpectedDelayLimit: number;
  readonly unexpectedDelayWeight: number;
  readonly queueFrictionWeight: number;
  readonly chronicByDimension: WellbeingScores;
  readonly frictionByDimension: WellbeingScores;
  readonly queueAcuteTensionWeight: number;
}

export interface WellbeingConfig {
  readonly wellbeingVersion: string;
  readonly scoreMinimum: number;
  readonly scoreMaximum: number;
  readonly initialBaseline: WellbeingScores;
  readonly exposure: ExposureConfig;
  readonly staticWeights: StaticFactorWeights;
  readonly commute: CommuteImpactWeights;
  readonly explanationContributionThreshold: number;
  readonly maximumDominantStressors: number;
}

const scores = (
  stress: number,
  tension: number,
  calm: number,
  happiness: number,
): WellbeingScores => ({ stress, tension, calm, happiness });

export const WELLBEING_DIMENSIONS: readonly WellbeingDimension[] = [
  'stress',
  'tension',
  'calm',
  'happiness',
];

export const WELLBEING_CONFIG: WellbeingConfig = {
  wellbeingVersion: 'phase-8.0',
  scoreMinimum: 0,
  scoreMaximum: 100,
  initialBaseline: scores(42, 34, 50, 54),
  exposure: {
    greenSearchRadius: 650,
    greenAreaReference: 30_000,
    greenStrongestContributionWeight: 0.75,
    greenSurroundingContributionWeight: 0.25,
    densitySearchRadius: 450,
    densityFloorAreaReference: 70_000,
    densityComfortThreshold: 0.48,
    roadNoiseSearchRadius: 420,
    roadLengthReference: 180,
    roadNoiseSaturation: 1.25,
    roadBaseLengthWeight: 0.3,
    roadScaledLengthWeight: 0.7,
    arterialNoiseWeight: 1,
    secondaryNoiseWeight: 0.42,
    environmentalQualityBaseline: 0.58,
    environmentalQualityGreenWeight: 0.34,
    environmentalQualityDensityWeight: 0.16,
    environmentalQualityRoadWeight: 0.28,
    householdCrowdingWeight: 0.42,
    householdSizeCrowdingReference: 5,
    residentOccupancyWeight: 0.38,
    dwellingOccupancyWeight: 0.2,
    missingLocationEnvironmentalQuality: 0.5,
  },
  staticWeights: {
    homeGreen: scores(-9, -2, 14, 8),
    homeDensityPressure: scores(8, 3, -7, -3),
    homeRoadNoise: scores(11, 5, -13, -6),
    homeCrowding: scores(6, 2, -5, -4),
    workplaceGreen: scores(-3, -0.5, 4, 2),
    workplaceDensityPressure: scores(3, 1, -2, -1),
    workplaceRoadNoise: scores(4, 2, -4, -2),
  },
  commute: {
    minimumExpectedTravelTime: 15,
    chronicTravelTimeReference: 180,
    queueWaitReference: 180,
    unexpectedDelayLimit: 2,
    unexpectedDelayWeight: 0.68,
    queueFrictionWeight: 0.32,
    chronicByDimension: scores(1.5, 0.5, -1, -0.7),
    frictionByDimension: scores(4.5, 12, -5, -1.8),
    queueAcuteTensionWeight: 3,
  },
  explanationContributionThreshold: 1,
  maximumDominantStressors: 3,
};

export function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export function clampWellbeingScore(
  value: number,
  config: WellbeingConfig = WELLBEING_CONFIG,
): number {
  return Number.isFinite(value)
    ? Math.min(config.scoreMaximum, Math.max(config.scoreMinimum, value))
    : config.scoreMinimum;
}
