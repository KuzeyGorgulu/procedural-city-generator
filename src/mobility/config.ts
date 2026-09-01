export interface MobilityConfig {
  readonly mobilityVersion: string;
  readonly workStartClusters: readonly number[];
  readonly workStartClusterWeights: readonly number[];
  readonly workStartJitterMinutes: number;
  readonly workDurationRangeMinutes: readonly [number, number];
  readonly departureBufferRangeMinutes: readonly [number, number];
  readonly unreachableCommuteDurationMinutes: number;
  readonly demandSecondsPerPlannedMinute: number;
}

export const MOBILITY_CONFIG: MobilityConfig = {
  mobilityVersion: 'phase-7.0',
  workStartClusters: [480, 510, 540],
  workStartClusterWeights: [0.2, 0.6, 0.2],
  workStartJitterMinutes: 30,
  workDurationRangeMinutes: [450, 540],
  departureBufferRangeMinutes: [4, 16],
  unreachableCommuteDurationMinutes: 30,
  demandSecondsPerPlannedMinute: 0.25,
};

