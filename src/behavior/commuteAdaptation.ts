import type { CommuteBehaviorConfig } from './config';
import { clampUnit, COMMUTE_BEHAVIOR_CONFIG } from './config';
import type {
  CommuteAdaptationDecision,
  CommuteBehavior,
  CommuteBehaviorEvent,
} from './types';

function clampOffset(
  value: number,
  config: CommuteBehaviorConfig,
): number {
  return Math.min(
    0,
    Math.max(-config.maximumEarlierDepartureMinutes, Math.round(value)),
  );
}

export function calculateCommuteAdaptation(
  behavior: CommuteBehavior,
  event: CommuteBehaviorEvent,
  config: CommuteBehaviorConfig = COMMUTE_BEHAVIOR_CONFIG,
): CommuteAdaptationDecision {
  const expected = Math.max(
    config.minimumExpectedTravelTime,
    event.estimatedTravelTime,
  );
  const unexpectedDelayScore = clampUnit(
    Math.max(0, event.actualTravelTime - event.estimatedTravelTime) /
      expected /
      config.unexpectedDelayLimit,
  );
  const queueFrictionScore = clampUnit(
    event.queueWaitTime / config.queueWaitReference,
  );
  const chronicBurdenScore = clampUnit(
    event.estimatedTravelTime / config.chronicTravelTimeReference,
  );
  const tensionElevationScore = clampUnit(
    Math.max(0, event.currentTension - event.initialTension) /
      config.tensionElevationReference,
  );
  const stressElevationScore = clampUnit(
    Math.max(0, event.currentStress - event.initialStress) /
      config.stressElevationReference,
  );
  const contributions = {
    unexpectedDelay:
      unexpectedDelayScore * config.unexpectedDelayWeight,
    queueFriction: queueFrictionScore * config.queueFrictionWeight,
    chronicBurden: chronicBurdenScore * config.chronicBurdenWeight,
    tension: tensionElevationScore * config.tensionWeight,
    stress: stressElevationScore * config.stressWeight,
  };
  const adaptationPressure = clampUnit(
    contributions.unexpectedDelay +
      contributions.queueFriction +
      contributions.chronicBurden +
      contributions.tension +
      contributions.stress,
  );
  const frictionScore = clampUnit(
    unexpectedDelayScore *
      (config.unexpectedDelayWeight /
        (config.unexpectedDelayWeight + config.queueFrictionWeight)) +
      queueFrictionScore *
        (config.queueFrictionWeight /
          (config.unexpectedDelayWeight + config.queueFrictionWeight)),
  );
  const previousOffsetMinutes = behavior.departureOffsetMinutes;
  const targetOffsetMinutes = clampOffset(
    -Math.round(
      adaptationPressure * config.maximumEarlierDepartureMinutes,
    ),
    config,
  );
  let nextOffsetMinutes = previousOffsetMinutes;
  let direction: CommuteAdaptationDecision['direction'] = 'stable';

  if (
    adaptationPressure >= config.adaptationPressureThreshold &&
    targetOffsetMinutes < previousOffsetMinutes
  ) {
    const learnedChange = Math.max(
      -config.maximumEarlierChangePerRound,
      Math.floor(
        (targetOffsetMinutes - previousOffsetMinutes) *
          config.adaptationLearningRate,
      ),
    );
    nextOffsetMinutes = clampOffset(
      previousOffsetMinutes + Math.min(-1, learnedChange),
      config,
    );
    direction = 'earlier';
  } else if (
    adaptationPressure <= config.recoveryPressureThreshold &&
    previousOffsetMinutes < 0
  ) {
    nextOffsetMinutes = clampOffset(
      Math.min(
        0,
        previousOffsetMinutes + config.recoveryMinutesPerSmoothRound,
      ),
      config,
    );
    direction = 'recovering';
  }

  return {
    eventId: event.eventId,
    roundIndex: event.roundIndex,
    estimatedTravelTime: event.estimatedTravelTime,
    actualTravelTime: event.actualTravelTime,
    queueWaitTime: event.queueWaitTime,
    unexpectedDelayScore,
    queueFrictionScore,
    chronicBurdenScore,
    tensionElevationScore,
    stressElevationScore,
    frictionScore,
    contributions,
    adaptationPressure,
    previousOffsetMinutes,
    targetOffsetMinutes,
    nextOffsetMinutes,
    direction,
  };
}

