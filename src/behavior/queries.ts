import type { CommutePurpose } from '../mobility/types';
import type {
  BehaviorState,
  CommuteBehavior,
  CommuteBehaviorExplanation,
} from './types';
import { getEffectiveDepartureMinute } from './commuteRounds';

export function getCommuteBehavior(
  state: BehaviorState,
  citizenId: string | undefined,
  purpose: CommutePurpose | undefined,
): CommuteBehavior | undefined {
  if (!citizenId || !purpose) return undefined;
  return state.commuteBehaviors.find(
    (behavior) =>
      behavior.citizenId === citizenId && behavior.purpose === purpose,
  );
}

export function explainCommuteBehavior(
  state: BehaviorState,
  citizenId: string | undefined,
  purpose: CommutePurpose | undefined,
  plannedDepartureMinute: number | undefined,
): CommuteBehaviorExplanation | undefined {
  if (plannedDepartureMinute === undefined) return undefined;
  const behavior = getCommuteBehavior(state, citizenId, purpose);
  if (!behavior || !purpose) return undefined;
  return {
    behavior,
    plannedDepartureMinute,
    effectiveDepartureMinute: getEffectiveDepartureMinute(
      plannedDepartureMinute,
      behavior.citizenId,
      purpose,
      state,
    ),
    nextEffectiveDepartureMinute: getEffectiveDepartureMinute(
      plannedDepartureMinute,
      behavior.citizenId,
      purpose,
      state,
      true,
    ),
    currentRound: state.roundByPurpose[purpose],
  };
}

