import type { RoadType } from '../../world/types';

export type TrafficSpeedMultiplier = 0.5 | 1 | 2 | 4;

export interface TrafficSimulationConfig {
  readonly simulationVersion: string;
  readonly fixedTimeStepSeconds: number;
  readonly maxFrameDeltaSeconds: number;
  readonly maxTicksPerAdvance: number;
  readonly defaultVehicleCount: number;
  readonly maxVehicleCount: number;
  readonly spawnAttemptLimit: number;
  readonly initialSpawnSerialMultiplier: number;
  readonly minimumTripDistance: number;
  readonly acceleration: number;
  readonly braking: number;
  readonly minimumFollowingDistance: number;
  readonly followingTimeGapSeconds: number;
  readonly intersectionStopDistance: number;
  readonly nominalSpeedByRoadType: Readonly<Record<RoadType, number>>;
}

export const TRAFFIC_SPEED_MULTIPLIERS: readonly TrafficSpeedMultiplier[] = [
  0.5, 1, 2, 4,
];

export const TRAFFIC_VEHICLE_LEVELS = [12, 24, 36] as const;

export const TRAFFIC_CONFIG: TrafficSimulationConfig = {
  simulationVersion: 'phase-4.0',
  fixedTimeStepSeconds: 0.05,
  maxFrameDeltaSeconds: 0.25,
  maxTicksPerAdvance: 40,
  defaultVehicleCount: 24,
  maxVehicleCount: 48,
  spawnAttemptLimit: 16,
  initialSpawnSerialMultiplier: 5,
  minimumTripDistance: 280,
  acceleration: 28,
  braking: 70,
  minimumFollowingDistance: 12,
  followingTimeGapSeconds: 0.55,
  intersectionStopDistance: 3,
  nominalSpeedByRoadType: {
    arterial: 60,
    secondary: 38,
  },
};
