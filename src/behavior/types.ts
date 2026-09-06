import type { CommutePurpose, CommuteTripId } from '../mobility/types';
import type { CitizenId } from '../population/types';

export interface CommuteRoundIndices {
  readonly 'commute-to-work': number;
  readonly 'commute-home': number;
}

export type AdaptationDirection = 'earlier' | 'recovering' | 'stable';

export interface AdaptationContributions {
  readonly unexpectedDelay: number;
  readonly queueFriction: number;
  readonly chronicBurden: number;
  readonly tension: number;
  readonly stress: number;
}

export interface CommuteAdaptationDecision {
  readonly eventId: string;
  readonly roundIndex: number;
  readonly estimatedTravelTime: number;
  readonly actualTravelTime: number;
  readonly queueWaitTime: number;
  readonly unexpectedDelayScore: number;
  readonly queueFrictionScore: number;
  readonly chronicBurdenScore: number;
  readonly tensionElevationScore: number;
  readonly stressElevationScore: number;
  readonly frictionScore: number;
  readonly contributions: AdaptationContributions;
  readonly adaptationPressure: number;
  readonly previousOffsetMinutes: number;
  readonly targetOffsetMinutes: number;
  readonly nextOffsetMinutes: number;
  readonly direction: AdaptationDirection;
}

export interface CommuteBehavior {
  readonly citizenId: CitizenId;
  readonly purpose: CommutePurpose;
  /** Frozen offset used by the currently prepared round. */
  readonly departureOffsetMinutes: number;
  /** Learned offset promoted only at an explicit round boundary. */
  readonly nextDepartureOffsetMinutes: number;
  readonly completedAdaptationCount: number;
  readonly lastEventId?: string;
  readonly lastFrictionScore?: number;
  readonly lastDecision?: CommuteAdaptationDecision;
}

export interface BehaviorRoundSummary {
  readonly purpose: CommutePurpose;
  readonly roundIndex: number;
  readonly completedCommutes: number;
  readonly averageActualTravelTime: number;
  readonly averageQueueWaitTime: number;
  readonly averageFrictionScore: number;
  readonly averageTensionContribution: number;
  readonly adaptedForNextRoundCount: number;
  readonly averageNextDepartureOffsetMinutes: number;
}

export interface BehaviorState {
  readonly behaviorVersion: string;
  readonly behaviorSeed: string;
  readonly behaviorEnabled: boolean;
  readonly roundByPurpose: CommuteRoundIndices;
  readonly commuteBehaviors: readonly CommuteBehavior[];
  readonly processedEventIds: readonly string[];
  readonly roundSummaries: readonly BehaviorRoundSummary[];
}

export interface CommuteBehaviorEvent {
  readonly eventId: string;
  readonly commuteEventId: string;
  readonly behaviorSeed: string;
  readonly roundIndex: number;
  readonly tripId: CommuteTripId;
  readonly citizenId: CitizenId;
  readonly purpose: CommutePurpose;
  readonly estimatedTravelTime: number;
  readonly actualTravelTime: number;
  readonly queueWaitTime: number;
  readonly initialTension: number;
  readonly currentTension: number;
  readonly initialStress: number;
  readonly currentStress: number;
}

export interface BehaviorMetrics {
  readonly purpose: CommutePurpose;
  readonly currentRound: number;
  readonly commuterCount: number;
  readonly processedCommuteCount: number;
  readonly adaptedCommuterCount: number;
  readonly nextRoundAdaptedCommuterCount: number;
  readonly averageDepartureShiftMinutes: number;
  readonly averageNextDepartureShiftMinutes: number;
  readonly maximumEarlierShiftMinutes: number;
  readonly averageCommuteFriction: number;
  readonly citizensAtAdaptationCap: number;
  readonly citizensRecovering: number;
}

export interface CommuteBehaviorExplanation {
  readonly behavior: CommuteBehavior;
  readonly plannedDepartureMinute: number;
  readonly effectiveDepartureMinute: number;
  readonly nextEffectiveDepartureMinute: number;
  readonly currentRound: number;
}
