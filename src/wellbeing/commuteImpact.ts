import type { MobilityState, RoutableCommuteTrip } from '../mobility/types';
import type { TrafficSimulationState } from '../simulation/traffic/types';
import type { WellbeingConfig } from './config';
import { clampUnit, WELLBEING_CONFIG } from './config';
import type {
  CommuteWellbeingImpact,
  CompletedCommuteEvent,
  WellbeingScores,
} from './types';

export function collectCompletedCommuteEvents(
  traffic: TrafficSimulationState,
  mobility: MobilityState,
): readonly CompletedCommuteEvent[] {
  const tripsById = new Map(
    mobility.commuteTrips
      .filter(
        (trip): trip is RoutableCommuteTrip =>
          trip.routingStatus === 'routable',
      )
      .map((trip) => [trip.id, trip]),
  );
  const events: CompletedCommuteEvent[] = [];
  for (const runtime of traffic.tripRuntime) {
    if (
      runtime.status !== 'completed' ||
      runtime.actualDepartureTime === undefined ||
      runtime.actualArrivalTime === undefined ||
      runtime.travelTime === undefined
    ) {
      continue;
    }
    const trip = tripsById.get(runtime.tripId);
    if (!trip) continue;
    events.push({
      eventId: `commute/${traffic.simulationSeed}/${runtime.tripId}/completed`,
      scenarioSimulationSeed: traffic.simulationSeed,
      tripId: trip.id,
      citizenId: trip.citizenId,
      purpose: trip.purpose,
      estimatedTravelTime: trip.estimatedNetworkTravelTime,
      actualTravelTime: runtime.travelTime,
      queueWaitTime: runtime.waitingTime ?? 0,
      actualDepartureTime: runtime.actualDepartureTime,
      actualArrivalTime: runtime.actualArrivalTime,
    });
  }
  return events.sort(
    (first, second) =>
      first.actualArrivalTime - second.actualArrivalTime ||
      first.eventId.localeCompare(second.eventId),
  );
}

export function calculateCommuteWellbeingImpact(
  event: CompletedCommuteEvent,
  config: WellbeingConfig = WELLBEING_CONFIG,
): CommuteWellbeingImpact {
  const expected = Math.max(
    config.commute.minimumExpectedTravelTime,
    event.estimatedTravelTime,
  );
  const baselineBurden = clampUnit(
    event.estimatedTravelTime / config.commute.chronicTravelTimeReference,
  );
  const unexpectedDelay = clampUnit(
    Math.max(0, event.actualTravelTime - event.estimatedTravelTime) /
      expected /
      config.commute.unexpectedDelayLimit,
  );
  const queueBurden = clampUnit(
    event.queueWaitTime / config.commute.queueWaitReference,
  );
  const friction = clampUnit(
    unexpectedDelay * config.commute.unexpectedDelayWeight +
      queueBurden * config.commute.queueFrictionWeight,
  );
  const scoreDelta: WellbeingScores = {
    stress:
      baselineBurden * config.commute.chronicByDimension.stress +
      friction * config.commute.frictionByDimension.stress,
    tension:
      baselineBurden * config.commute.chronicByDimension.tension +
      friction * config.commute.frictionByDimension.tension +
      queueBurden * config.commute.queueAcuteTensionWeight,
    calm:
      baselineBurden * config.commute.chronicByDimension.calm +
      friction * config.commute.frictionByDimension.calm,
    happiness:
      baselineBurden * config.commute.chronicByDimension.happiness +
      friction * config.commute.frictionByDimension.happiness,
  };
  return {
    eventId: event.eventId,
    tripId: event.tripId,
    citizenId: event.citizenId,
    purpose: event.purpose,
    estimatedTravelTime: event.estimatedTravelTime,
    actualTravelTime: event.actualTravelTime,
    queueWaitTime: event.queueWaitTime,
    totalExperiencedTime: event.actualTravelTime + event.queueWaitTime,
    baselineBurden,
    unexpectedDelay,
    queueBurden,
    scoreDelta,
  };
}
