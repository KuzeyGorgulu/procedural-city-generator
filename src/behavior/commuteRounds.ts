import { createTrafficDemandCatalog } from '../mobility/trafficDemand';
import type { CommutePurpose, MobilityState } from '../mobility/types';
import type { TrafficDemandCatalog } from '../simulation/traffic/types';
import type { CommuteBehaviorConfig } from './config';
import { COMMUTE_BEHAVIOR_CONFIG } from './config';
import type {
  BehaviorRoundSummary,
  BehaviorState,
  CommuteBehavior,
} from './types';

const MINUTE_MINIMUM = 0;
const MINUTE_MAXIMUM = 1_439;

function behaviorKey(citizenId: string, purpose: CommutePurpose): string {
  return `${citizenId}\u001f${purpose}`;
}

export function getEffectiveDepartureMinute(
  plannedDepartureMinute: number,
  citizenId: string,
  purpose: CommutePurpose,
  state: BehaviorState,
  useNextOffset = false,
): number {
  const behavior = state.commuteBehaviors.find(
    (candidate) =>
      candidate.citizenId === citizenId && candidate.purpose === purpose,
  );
  const offset =
    state.behaviorEnabled && behavior
      ? useNextOffset
        ? behavior.nextDepartureOffsetMinutes
        : behavior.departureOffsetMinutes
      : 0;
  return Math.min(
    MINUTE_MAXIMUM,
    Math.max(MINUTE_MINIMUM, Math.round(plannedDepartureMinute + offset)),
  );
}

/** Freezes plain effective departures once for the current commute rounds. */
export function createBehaviorTrafficDemandCatalog(
  mobility: MobilityState,
  state: BehaviorState,
): TrafficDemandCatalog {
  const catalog = createTrafficDemandCatalog(mobility);
  const offsets = new Map(
    state.commuteBehaviors.map((behavior) => [
      behaviorKey(behavior.citizenId, behavior.purpose),
      state.behaviorEnabled ? behavior.departureOffsetMinutes : 0,
    ]),
  );
  const effectiveMinute = (
    plannedDepartureMinute: number,
    citizenId: string,
    purpose: CommutePurpose,
  ) =>
    Math.min(
      MINUTE_MAXIMUM,
      Math.max(
        MINUTE_MINIMUM,
        Math.round(
          plannedDepartureMinute +
            (offsets.get(behaviorKey(citizenId, purpose)) ?? 0),
        ),
      ),
    );
  return {
    ...catalog,
    trips: catalog.trips.map((trip) => ({
      ...trip,
      effectiveDepartureMinute: effectiveMinute(
        trip.plannedDepartureMinute,
        trip.citizenId,
        trip.purpose,
      ),
    })),
    unreachableTrips: catalog.unreachableTrips.map((trip) => ({
      ...trip,
      effectiveDepartureMinute: effectiveMinute(
        trip.plannedDepartureMinute,
        trip.citizenId,
        trip.purpose,
      ),
    })),
  };
}

function summarizeRound(
  state: BehaviorState,
  purpose: CommutePurpose,
): BehaviorRoundSummary {
  const roundIndex = state.roundByPurpose[purpose];
  const decisions = state.commuteBehaviors
    .filter(
      (behavior) =>
        behavior.purpose === purpose &&
        behavior.lastDecision?.roundIndex === roundIndex,
    )
    .map((behavior) => ({ behavior, decision: behavior.lastDecision! }));
  const count = decisions.length;
  const total = <T>(read: (entry: T) => number, entries: readonly T[]) =>
    entries.reduce((sum, entry) => sum + read(entry), 0);
  return {
    purpose,
    roundIndex,
    completedCommutes: count,
    averageActualTravelTime:
      count === 0 ? 0 : total((entry) => entry.decision.actualTravelTime, decisions) / count,
    averageQueueWaitTime:
      count === 0 ? 0 : total((entry) => entry.decision.queueWaitTime, decisions) / count,
    averageFrictionScore:
      count === 0 ? 0 : total((entry) => entry.decision.frictionScore, decisions) / count,
    averageTensionContribution:
      count === 0 ? 0 : total((entry) => entry.decision.contributions.tension, decisions) / count,
    adaptedForNextRoundCount: decisions.filter(
      ({ behavior }) => behavior.nextDepartureOffsetMinutes !== 0,
    ).length,
    averageNextDepartureOffsetMinutes:
      count === 0
        ? 0
        : total(
            (entry) => entry.behavior.nextDepartureOffsetMinutes,
            decisions,
          ) / count,
  };
}

export function advanceCommuteRound(
  state: BehaviorState,
  purpose: CommutePurpose,
): BehaviorState {
  const summary = summarizeRound(state, purpose);
  return {
    ...state,
    roundByPurpose: {
      ...state.roundByPurpose,
      [purpose]: state.roundByPurpose[purpose] + 1,
    },
    commuteBehaviors: state.commuteBehaviors.map((behavior) =>
      behavior.purpose === purpose
        ? {
            ...behavior,
            departureOffsetMinutes: behavior.nextDepartureOffsetMinutes,
          }
        : behavior,
    ),
    roundSummaries: [...state.roundSummaries, summary],
  };
}

export function setBehaviorEnabled(
  state: BehaviorState,
  behaviorEnabled: boolean,
): BehaviorState {
  return state.behaviorEnabled === behaviorEnabled
    ? state
    : { ...state, behaviorEnabled };
}

export function isAtAdaptationCap(
  behavior: CommuteBehavior,
  config: CommuteBehaviorConfig = COMMUTE_BEHAVIOR_CONFIG,
): boolean {
  return (
    behavior.departureOffsetMinutes <=
    -config.maximumEarlierDepartureMinutes
  );
}

