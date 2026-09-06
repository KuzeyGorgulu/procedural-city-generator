import type { CommutePurpose } from '../mobility/types';
import type { CommuteBehaviorConfig } from './config';
import { COMMUTE_BEHAVIOR_CONFIG } from './config';
import type { BehaviorMetrics, BehaviorState } from './types';

export function calculateBehaviorMetrics(
  state: BehaviorState,
  purpose: CommutePurpose,
  config: CommuteBehaviorConfig = COMMUTE_BEHAVIOR_CONFIG,
): BehaviorMetrics {
  const behaviors = state.commuteBehaviors.filter(
    (behavior) => behavior.purpose === purpose,
  );
  const count = behaviors.length;
  const sum = (read: (index: number) => number) => {
    let total = 0;
    for (let index = 0; index < count; index += 1) total += read(index);
    return total;
  };
  const currentOffsets = behaviors.map((behavior) =>
    state.behaviorEnabled ? behavior.departureOffsetMinutes : 0,
  );
  const nextOffsets = behaviors.map((behavior) =>
    state.behaviorEnabled ? behavior.nextDepartureOffsetMinutes : 0,
  );
  const decisions = behaviors.flatMap((behavior) =>
    behavior.lastDecision?.roundIndex === state.roundByPurpose[purpose]
      ? [behavior.lastDecision]
      : [],
  );
  return {
    purpose,
    currentRound: state.roundByPurpose[purpose],
    commuterCount: count,
    processedCommuteCount: decisions.length,
    adaptedCommuterCount: currentOffsets.filter((offset) => offset < 0).length,
    nextRoundAdaptedCommuterCount: nextOffsets.filter((offset) => offset < 0)
      .length,
    averageDepartureShiftMinutes:
      count === 0 ? 0 : sum((index) => currentOffsets[index]) / count,
    averageNextDepartureShiftMinutes:
      count === 0 ? 0 : sum((index) => nextOffsets[index]) / count,
    maximumEarlierShiftMinutes:
      currentOffsets.length === 0 ? 0 : Math.min(...currentOffsets),
    averageCommuteFriction:
      decisions.length === 0
        ? 0
        : decisions.reduce(
            (total, decision) => total + decision.frictionScore,
            0,
          ) / decisions.length,
    citizensAtAdaptationCap: currentOffsets.filter(
      (offset) => offset <= -config.maximumEarlierDepartureMinutes,
    ).length,
    citizensRecovering: decisions.filter(
      (decision) => decision.direction === 'recovering',
    ).length,
  };
}
