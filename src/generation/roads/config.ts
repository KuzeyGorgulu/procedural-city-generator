export interface RoadGenerationConfig {
  readonly routingStep: number;
  readonly terrainSampleStep: number;
  readonly boundaryMargin: number;
  readonly arterialAnchorCount: number;
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
  readonly snapDistance: number;
  readonly intersectionTolerance: number;
  readonly minSegmentLength: number;
  readonly maxSearchStates: number;
}

/** Constants are part of the phase-2.0 deterministic generation behavior. */
export const ROAD_CONFIG: RoadGenerationConfig = {
  routingStep: 50,
  terrainSampleStep: 25,
  boundaryMargin: 150,
  arterialAnchorCount: 7,
  anchorCandidateStep: 100,
  minimumAnchorSeparation: 320,
  anchorMaxSlope: 0.5,
  maxRoadSlope: 0.82,
  arterialSlopePenalty: 8,
  secondarySlopePenalty: 5,
  arterialTurnPenalty: 22,
  secondaryTurnPenalty: 8,
  secondaryLoopCount: 10,
  secondaryAttachmentSpacing: 180,
  secondaryPairMinDistance: 220,
  secondaryPairMaxDistance: 480,
  secondaryOffsetMin: 110,
  secondaryOffsetMax: 210,
  secondaryLoopSpacing: 150,
  snapDistance: 8,
  intersectionTolerance: 1e-7,
  minSegmentLength: 2,
  maxSearchStates: 30_000,
};
