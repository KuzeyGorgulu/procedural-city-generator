import type { MobilityState } from '../mobility/types';
import type { TrafficSimulationState } from '../simulation/traffic/types';
import type { WellbeingConfig } from './config';
import {
  clampWellbeingScore,
  WELLBEING_CONFIG,
  WELLBEING_DIMENSIONS,
} from './config';
import {
  calculateCommuteWellbeingImpact,
  collectCompletedCommuteEvents,
} from './commuteImpact';
import { resetWellbeingForScenario } from './initializeWellbeing';
import {
  addWellbeingScores,
  calculateWellbeingMetrics,
} from './metrics';
import type {
  CompletedCommuteEvent,
  WellbeingState,
} from './types';

export function applyCompletedCommuteEvents(
  state: WellbeingState,
  events: readonly CompletedCommuteEvent[],
  config: WellbeingConfig = WELLBEING_CONFIG,
): WellbeingState {
  if (events.length === 0) return state;
  const processed = new Set(state.processedEventIds);
  const citizenIndex = new Map(
    state.citizens.map((citizen, index) => [citizen.citizenId, index]),
  );
  const citizens = [...state.citizens];
  let changed = false;

  for (const event of events) {
    if (
      event.scenarioSimulationSeed !== state.scenarioSimulationSeed ||
      processed.has(event.eventId)
    ) {
      continue;
    }
    const index = citizenIndex.get(event.citizenId);
    if (index === undefined) continue;
    const citizen = citizens[index];
    const impact = calculateCommuteWellbeingImpact(event, config);
    const scores = { ...citizen.scores };
    for (const dimension of WELLBEING_DIMENSIONS) {
      scores[dimension] = clampWellbeingScore(
        scores[dimension] + impact.scoreDelta[dimension],
        config,
      );
    }
    citizens[index] = {
      ...citizen,
      scores,
      cumulativeCommuteImpact: addWellbeingScores(
        citizen.cumulativeCommuteImpact,
        impact.scoreDelta,
      ),
      processedCommuteCount: citizen.processedCommuteCount + 1,
      lastCommuteImpact: impact,
    };
    processed.add(event.eventId);
    changed = true;
  }

  return changed
    ? {
        ...state,
        citizens,
        processedEventIds: [...processed].sort(),
        metrics: calculateWellbeingMetrics(citizens),
      }
    : state;
}

export function synchronizeWellbeingWithTraffic(
  state: WellbeingState,
  baseline: WellbeingState,
  mobility: MobilityState,
  traffic: TrafficSimulationState,
  config: WellbeingConfig = WELLBEING_CONFIG,
): WellbeingState {
  const scenarioState =
    state.wellbeingSeed !== baseline.wellbeingSeed ||
    state.scenarioSimulationSeed !== traffic.simulationSeed
      ? resetWellbeingForScenario(baseline, traffic.simulationSeed)
      : state;
  return applyCompletedCommuteEvents(
    scenarioState,
    collectCompletedCommuteEvents(traffic, mobility),
    config,
  );
}
