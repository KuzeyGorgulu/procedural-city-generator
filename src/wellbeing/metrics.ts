import { WELLBEING_DIMENSIONS } from './config';
import type {
  CitizenWellbeing,
  WellbeingMetrics,
  WellbeingScores,
} from './types';

export function zeroWellbeingScores(): WellbeingScores {
  return { stress: 0, tension: 0, calm: 0, happiness: 0 };
}

export function mapWellbeingScores(
  scores: WellbeingScores,
  operation: (value: number) => number,
): WellbeingScores {
  return {
    stress: operation(scores.stress),
    tension: operation(scores.tension),
    calm: operation(scores.calm),
    happiness: operation(scores.happiness),
  };
}

export function addWellbeingScores(
  first: WellbeingScores,
  second: WellbeingScores,
): WellbeingScores {
  return {
    stress: first.stress + second.stress,
    tension: first.tension + second.tension,
    calm: first.calm + second.calm,
    happiness: first.happiness + second.happiness,
  };
}

export function calculateWellbeingMetrics(
  citizens: readonly CitizenWellbeing[],
): WellbeingMetrics {
  if (citizens.length === 0) {
    const empty = zeroWellbeingScores();
    return {
      citizenCount: 0,
      averageScores: empty,
      minimumScores: empty,
      maximumScores: empty,
      commuteAffectedCitizenCount: 0,
      averageAbsoluteCommuteTensionImpact: 0,
    };
  }

  const totals: Record<keyof WellbeingScores, number> = {
    ...zeroWellbeingScores(),
  };
  const minimums: Record<keyof WellbeingScores, number> = {
    stress: Number.POSITIVE_INFINITY,
    tension: Number.POSITIVE_INFINITY,
    calm: Number.POSITIVE_INFINITY,
    happiness: Number.POSITIVE_INFINITY,
  };
  const maximums: Record<keyof WellbeingScores, number> = {
    stress: Number.NEGATIVE_INFINITY,
    tension: Number.NEGATIVE_INFINITY,
    calm: Number.NEGATIVE_INFINITY,
    happiness: Number.NEGATIVE_INFINITY,
  };
  let commuteAffectedCitizenCount = 0;
  let absoluteCommuteTensionImpact = 0;

  for (const citizen of citizens) {
    if (citizen.processedCommuteCount > 0) commuteAffectedCitizenCount += 1;
    absoluteCommuteTensionImpact += Math.abs(
      citizen.cumulativeCommuteImpact.tension,
    );
    for (const dimension of WELLBEING_DIMENSIONS) {
      totals[dimension] += citizen.scores[dimension];
      minimums[dimension] = Math.min(
        minimums[dimension],
        citizen.scores[dimension],
      );
      maximums[dimension] = Math.max(
        maximums[dimension],
        citizen.scores[dimension],
      );
    }
  }

  return {
    citizenCount: citizens.length,
    averageScores: mapWellbeingScores(
      totals,
      (value) => value / citizens.length,
    ),
    minimumScores: minimums,
    maximumScores: maximums,
    commuteAffectedCitizenCount,
    averageAbsoluteCommuteTensionImpact:
      absoluteCommuteTensionImpact / citizens.length,
  };
}
