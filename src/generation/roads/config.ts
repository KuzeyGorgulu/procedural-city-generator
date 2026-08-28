export interface RoadGenerationConfig {
  readonly routingStep: number;
  readonly terrainSampleStep: number;
  readonly boundaryMargin: number;
  readonly arterialAnchorCount: number;
  readonly anchorRegionColumns: number;
  readonly anchorRegionRows: number;
  readonly anchorCandidateStep: number;
  readonly minimumAnchorSeparation: number;
  readonly anchorMaxSlope: number;
  readonly maxRoadSlope: number;
  readonly arterialSlopePenalty: number;
  readonly secondarySlopePenalty: number;
  readonly arterialTurnPenalty: number;
  readonly secondaryTurnPenalty: number;
  readonly secondaryLoopCount: number;
  readonly secondaryAttachmentSpacing: number;
  readonly secondaryPairMinDistance: number;
  readonly secondaryPairMaxDistance: number;
  readonly secondaryOffsetMin: number;
  readonly secondaryOffsetMax: number;
  readonly secondaryLoopSpacing: number;
  readonly secondaryCandidateAttemptLimit: number;
  readonly secondaryCoverageJitter: number;
  readonly maxStraightEdgeLength: number;
  readonly arterialCurveMinLength: number;
  readonly secondaryCurveMinLength: number;
  readonly arterialCurveOffset: number;
  readonly secondaryCurveOffset: number;
  readonly arterialCornerRadius: number;
  readonly secondaryCornerRadius: number;
  readonly cornerSampleCount: number;
  readonly snapDistance: number;
  readonly intersectionTolerance: number;
  readonly minSegmentLength: number;
  readonly maxSearchStates: number;
}

/** Constants are part of the phase-3.5 deterministic generation behavior. */
export const ROAD_CONFIG: RoadGenerationConfig = {
  routingStep: 50,
  terrainSampleStep: 25,
  boundaryMargin: 150,
  arterialAnchorCount: 9,
  anchorRegionColumns: 3,
  anchorRegionRows: 2,
  anchorCandidateStep: 100,
  minimumAnchorSeparation: 300,
  anchorMaxSlope: 0.5,
  maxRoadSlope: 0.82,
  arterialSlopePenalty: 12,
  secondarySlopePenalty: 7,
  arterialTurnPenalty: 14,
  secondaryTurnPenalty: 6,
  secondaryLoopCount: 14,
  secondaryAttachmentSpacing: 160,
  secondaryPairMinDistance: 200,
  secondaryPairMaxDistance: 520,
  secondaryOffsetMin: 105,
  secondaryOffsetMax: 205,
  secondaryLoopSpacing: 190,
  secondaryCandidateAttemptLimit: 180,
  secondaryCoverageJitter: 70,
  maxStraightEdgeLength: 180,
  arterialCurveMinLength: 230,
  secondaryCurveMinLength: 190,
  arterialCurveOffset: 34,
  secondaryCurveOffset: 24,
  arterialCornerRadius: 42,
  secondaryCornerRadius: 30,
  cornerSampleCount: 2,
  snapDistance: 8,
  intersectionTolerance: 1e-7,
  minSegmentLength: 2,
  maxSearchStates: 30_000,
};
