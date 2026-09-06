import type { MobilityState } from '../mobility/types';
import type { CommuteBehaviorConfig } from './config';
import { COMMUTE_BEHAVIOR_CONFIG } from './config';
import type { BehaviorState, CommuteBehavior } from './types';

const BEHAVIOR_SEED_SEPARATOR = '\u001e';

export function deriveBehaviorSeed(
  mobility: MobilityState,
  config: CommuteBehaviorConfig = COMMUTE_BEHAVIOR_CONFIG,
): string {
  return [
    mobility.mobilityVersion,
    mobility.mobilitySeed,
    config.behaviorVersion,
  ].join(BEHAVIOR_SEED_SEPARATOR);
}

export function initializeBehavior(
  mobility: MobilityState,
  behaviorEnabled = true,
  config: CommuteBehaviorConfig = COMMUTE_BEHAVIOR_CONFIG,
): BehaviorState {
  const byCitizenAndPurpose = new Map<string, CommuteBehavior>();
  for (const trip of mobility.commuteTrips) {
    const key = `${trip.citizenId}\u001f${trip.purpose}`;
    if (byCitizenAndPurpose.has(key)) continue;
    byCitizenAndPurpose.set(key, {
      citizenId: trip.citizenId,
      purpose: trip.purpose,
      departureOffsetMinutes: 0,
      nextDepartureOffsetMinutes: 0,
      completedAdaptationCount: 0,
    });
  }
  const commuteBehaviors = [...byCitizenAndPurpose.values()].sort(
    (first, second) =>
      first.citizenId.localeCompare(second.citizenId) ||
      first.purpose.localeCompare(second.purpose),
  );
  return {
    behaviorVersion: config.behaviorVersion,
    behaviorSeed: deriveBehaviorSeed(mobility, config),
    behaviorEnabled,
    roundByPurpose: {
      'commute-to-work': 0,
      'commute-home': 0,
    },
    commuteBehaviors,
    processedEventIds: [],
    roundSummaries: [],
  };
}

