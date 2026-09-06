export interface CommuteBehaviorConfig {
  readonly behaviorVersion: string;
  readonly maximumEarlierDepartureMinutes: number;
  readonly maximumEarlierChangePerRound: number;
  readonly adaptationLearningRate: number;
  readonly recoveryMinutesPerSmoothRound: number;
  readonly adaptationPressureThreshold: number;
  readonly recoveryPressureThreshold: number;
  readonly minimumExpectedTravelTime: number;
  readonly chronicTravelTimeReference: number;
  readonly unexpectedDelayLimit: number;
  readonly queueWaitReference: number;
  readonly tensionElevationReference: number;
  readonly stressElevationReference: number;
  readonly unexpectedDelayWeight: number;
  readonly queueFrictionWeight: number;
  readonly chronicBurdenWeight: number;
  readonly tensionWeight: number;
  readonly stressWeight: number;
}

/** Centralized, deterministic Phase 9 departure-adaptation coefficients. */
export const COMMUTE_BEHAVIOR_CONFIG: CommuteBehaviorConfig = {
  behaviorVersion: 'phase-9.0',
  maximumEarlierDepartureMinutes: 25,
  maximumEarlierChangePerRound: 6,
  adaptationLearningRate: 0.45,
  recoveryMinutesPerSmoothRound: 3,
  adaptationPressureThreshold: 0.18,
  recoveryPressureThreshold: 0.08,
  minimumExpectedTravelTime: 15,
  chronicTravelTimeReference: 240,
  unexpectedDelayLimit: 2,
  queueWaitReference: 180,
  tensionElevationReference: 15,
  stressElevationReference: 20,
  unexpectedDelayWeight: 0.52,
  queueFrictionWeight: 0.23,
  chronicBurdenWeight: 0.08,
  tensionWeight: 0.11,
  stressWeight: 0.06,
};

export function clampUnit(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

