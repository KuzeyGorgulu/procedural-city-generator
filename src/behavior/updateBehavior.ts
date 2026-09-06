import type { CommuteBehaviorConfig } from './config';
import { COMMUTE_BEHAVIOR_CONFIG } from './config';
import { calculateCommuteAdaptation } from './commuteAdaptation';
import type {
  BehaviorState,
  CommuteBehaviorEvent,
} from './types';

function behaviorKey(citizenId: string, purpose: string): string {
  return `${citizenId}\u001f${purpose}`;
}

export function applyCommuteBehaviorEvents(
  state: BehaviorState,
  events: readonly CommuteBehaviorEvent[],
  config: CommuteBehaviorConfig = COMMUTE_BEHAVIOR_CONFIG,
): BehaviorState {
  if (!state.behaviorEnabled || events.length === 0) return state;
  const processed = new Set(state.processedEventIds);
  const indexByKey = new Map(
    state.commuteBehaviors.map((behavior, index) => [
      behaviorKey(behavior.citizenId, behavior.purpose),
      index,
    ]),
  );
  const behaviors = [...state.commuteBehaviors];
  let changed = false;

  for (const event of events) {
    if (
      event.behaviorSeed !== state.behaviorSeed ||
      event.roundIndex !== state.roundByPurpose[event.purpose] ||
      processed.has(event.eventId)
    ) {
      continue;
    }
    const index = indexByKey.get(behaviorKey(event.citizenId, event.purpose));
    if (index === undefined) continue;
    const behavior = behaviors[index];
    const decision = calculateCommuteAdaptation(behavior, event, config);
    behaviors[index] = {
      ...behavior,
      nextDepartureOffsetMinutes: decision.nextOffsetMinutes,
      completedAdaptationCount:
        behavior.completedAdaptationCount +
        (decision.nextOffsetMinutes === behavior.departureOffsetMinutes ? 0 : 1),
      lastEventId: event.eventId,
      lastFrictionScore: decision.frictionScore,
      lastDecision: decision,
    };
    processed.add(event.eventId);
    changed = true;
  }

  return changed
    ? {
        ...state,
        commuteBehaviors: behaviors,
        processedEventIds: [...processed].sort(),
      }
    : state;
}

