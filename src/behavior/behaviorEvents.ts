import type { MobilityState } from '../mobility/types';
import type { TrafficSimulationState } from '../simulation/traffic/types';
import { collectCompletedCommuteEvents } from '../wellbeing/commuteImpact';
import type { WellbeingState } from '../wellbeing/types';
import type {
  BehaviorState,
  CommuteBehaviorEvent,
} from './types';

function createBehaviorEventId(
  state: BehaviorState,
  purpose: CommuteBehaviorEvent['purpose'],
  roundIndex: number,
  tripId: string,
): string {
  return [
    'behavior',
    state.behaviorSeed,
    purpose,
    `round-${roundIndex.toString().padStart(4, '0')}`,
    tripId,
    'completed',
  ].join('/');
}

/**
 * Converts completed population trips into stable Phase 9 events. Synthetic
 * traffic has no commute provenance and therefore always returns no events.
 */
export function collectCommuteBehaviorEvents(
  traffic: TrafficSimulationState,
  mobility: MobilityState,
  wellbeing: WellbeingState,
  behavior: BehaviorState,
): readonly CommuteBehaviorEvent[] {
  if (traffic.demandMode === 'synthetic' || !behavior.behaviorEnabled) {
    return [];
  }
  const wellbeingByCitizenId = new Map(
    wellbeing.citizens.map((citizen) => [citizen.citizenId, citizen]),
  );
  const events: CommuteBehaviorEvent[] = [];
  for (const commuteEvent of collectCompletedCommuteEvents(traffic, mobility)) {
    const citizen = wellbeingByCitizenId.get(commuteEvent.citizenId);
    if (!citizen) continue;
    const roundIndex = behavior.roundByPurpose[commuteEvent.purpose];
    events.push({
      eventId: createBehaviorEventId(
        behavior,
        commuteEvent.purpose,
        roundIndex,
        commuteEvent.tripId,
      ),
      commuteEventId: commuteEvent.eventId,
      behaviorSeed: behavior.behaviorSeed,
      roundIndex,
      tripId: commuteEvent.tripId,
      citizenId: commuteEvent.citizenId,
      purpose: commuteEvent.purpose,
      estimatedTravelTime: commuteEvent.estimatedTravelTime,
      actualTravelTime: commuteEvent.actualTravelTime,
      queueWaitTime: commuteEvent.queueWaitTime,
      initialTension: citizen.initialScores.tension,
      currentTension: citizen.scores.tension,
      initialStress: citizen.initialScores.stress,
      currentStress: citizen.scores.stress,
    });
  }
  return events.sort((first, second) => first.eventId.localeCompare(second.eventId));
}

