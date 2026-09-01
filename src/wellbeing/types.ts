import type { CommutePurpose, CommuteTripId } from '../mobility/types';
import type { CitizenId } from '../population/types';
import type { BuildingId } from '../world/types';

export type WellbeingDimension =
  | 'stress'
  | 'tension'
  | 'calm'
  | 'happiness';

export interface WellbeingScores {
  readonly stress: number;
  readonly tension: number;
  readonly calm: number;
  readonly happiness: number;
}

export interface LocationExposure {
  readonly buildingId: BuildingId;
  readonly greenAccess: number;
  readonly localDensity: number;
  readonly roadNoiseProxy: number;
  readonly environmentalQuality: number;
}

export interface EnvironmentalExposureProfile {
  readonly citizenId: CitizenId;
  readonly home: LocationExposure;
  readonly workplace?: LocationExposure;
  /** Existing household/building occupancy pressure only; not room or income data. */
  readonly homeCrowding: number;
}

export interface EnvironmentalExposureState {
  readonly exposureVersion: string;
  readonly exposureSeed: string;
  readonly buildingExposures: readonly LocationExposure[];
  readonly citizenProfiles: readonly EnvironmentalExposureProfile[];
}

export interface StaticWellbeingFactors {
  readonly homeGreen: WellbeingScores;
  readonly homeDensityPressure: WellbeingScores;
  readonly homeRoadNoise: WellbeingScores;
  readonly homeCrowding: WellbeingScores;
  readonly workplaceGreen: WellbeingScores;
  readonly workplaceDensityPressure: WellbeingScores;
  readonly workplaceRoadNoise: WellbeingScores;
}

export interface CompletedCommuteEvent {
  readonly eventId: string;
  readonly scenarioSimulationSeed: string;
  readonly tripId: CommuteTripId;
  readonly citizenId: CitizenId;
  readonly purpose: CommutePurpose;
  readonly estimatedTravelTime: number;
  readonly actualTravelTime: number;
  readonly queueWaitTime: number;
  readonly actualDepartureTime: number;
  readonly actualArrivalTime: number;
}

export interface CommuteWellbeingImpact {
  readonly eventId: string;
  readonly tripId: CommuteTripId;
  readonly citizenId: CitizenId;
  readonly purpose: CommutePurpose;
  readonly estimatedTravelTime: number;
  readonly actualTravelTime: number;
  readonly queueWaitTime: number;
  readonly totalExperiencedTime: number;
  readonly baselineBurden: number;
  readonly unexpectedDelay: number;
  readonly queueBurden: number;
  readonly scoreDelta: WellbeingScores;
}

export interface CitizenWellbeing {
  readonly citizenId: CitizenId;
  readonly initialScores: WellbeingScores;
  readonly scores: WellbeingScores;
  readonly staticFactors: StaticWellbeingFactors;
  readonly cumulativeCommuteImpact: WellbeingScores;
  readonly processedCommuteCount: number;
  readonly lastCommuteImpact?: CommuteWellbeingImpact;
}

export interface WellbeingMetrics {
  readonly citizenCount: number;
  readonly averageScores: WellbeingScores;
  readonly minimumScores: WellbeingScores;
  readonly maximumScores: WellbeingScores;
  readonly commuteAffectedCitizenCount: number;
  readonly averageAbsoluteCommuteTensionImpact: number;
}

export interface WellbeingState {
  readonly wellbeingVersion: string;
  readonly wellbeingSeed: string;
  readonly scenarioSimulationSeed: string;
  readonly citizens: readonly CitizenWellbeing[];
  readonly processedEventIds: readonly string[];
  readonly metrics: WellbeingMetrics;
}

export interface BuildingWellbeingSummary {
  readonly buildingId: BuildingId;
  readonly residentCount: number;
  readonly averageScores: WellbeingScores;
}

export interface WellbeingExplanation {
  readonly citizen: CitizenWellbeing;
  readonly exposure: EnvironmentalExposureProfile;
  readonly dominantStaticStressors: readonly string[];
  readonly restorativeFactors: readonly string[];
}
