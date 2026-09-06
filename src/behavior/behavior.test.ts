import { describe, expect, it } from 'vitest';
import type { MobilityState, RoutableCommuteTrip } from '../mobility/types';
import { createTrafficDemandCatalog } from '../mobility/trafficDemand';
import type { TrafficSimulationState } from '../simulation/traffic/types';
import type { WellbeingState } from '../wellbeing/types';
import { collectCommuteBehaviorEvents } from './behaviorEvents';
import {
  advanceCommuteRound,
  createBehaviorTrafficDemandCatalog,
  setBehaviorEnabled,
} from './commuteRounds';
import { initializeBehavior } from './initializeBehavior';
import { calculateBehaviorMetrics } from './metrics';
import type {
  BehaviorState,
  CommuteBehaviorEvent,
} from './types';
import { applyCommuteBehaviorEvents } from './updateBehavior';

const route = {
  originNodeId: 'node-home',
  destinationNodeId: 'node-work',
  arcIds: ['arc-home-work'],
  totalLength: 600,
  estimatedTravelTime: 60,
} as const;

function trip(
  citizenId: string,
  purpose: RoutableCommuteTrip['purpose'],
  plannedDepartureMinute: number,
): RoutableCommuteTrip {
  return {
    id: `trip/${citizenId}/${purpose}`,
    citizenId,
    workplaceId: 'workplace-1',
    purpose,
    plannedDepartureMinute,
    routingStatus: 'routable',
    originBuildingId:
      purpose === 'commute-to-work' ? 'home-building' : 'work-building',
    destinationBuildingId:
      purpose === 'commute-to-work' ? 'work-building' : 'home-building',
    originAccessNodeId:
      purpose === 'commute-to-work' ? 'node-home' : 'node-work',
    destinationAccessNodeId:
      purpose === 'commute-to-work' ? 'node-work' : 'node-home',
    route:
      purpose === 'commute-to-work'
        ? route
        : {
            ...route,
            originNodeId: route.destinationNodeId,
            destinationNodeId: route.originNodeId,
            arcIds: ['arc-work-home'],
          },
    estimatedNetworkDistance: 600,
    estimatedNetworkTravelTime: 60,
  };
}

function mobilityFixture(): MobilityState {
  const commuteTrips = [
    trip('citizen-1', 'commute-to-work', 480),
    trip('citizen-1', 'commute-home', 1_020),
    trip('citizen-2', 'commute-to-work', 485),
    trip('citizen-2', 'commute-home', 1_025),
  ];
  return {
    mobilityVersion: 'phase-7.0',
    mobilitySeed: 'behavior-mobility-fixture',
    dailyPlans: [],
    commuteTrips,
    metrics: {
      employedCommuters: 2,
      plannedCommuteTrips: 4,
      routableTrips: 4,
      unreachableTrips: 0,
      averageEstimatedCommuteDistance: 600,
      averageEstimatedCommuteTime: 60,
      morning: {
        plannedTrips: 2,
        routableTrips: 2,
        unreachableTrips: 0,
        averageEstimatedDistance: 600,
        averageEstimatedTravelTime: 60,
      },
      evening: {
        plannedTrips: 2,
        routableTrips: 2,
        unreachableTrips: 0,
        averageEstimatedDistance: 600,
        averageEstimatedTravelTime: 60,
      },
    },
  };
}

function behaviorEvent(
  state: BehaviorState,
  purpose: CommuteBehaviorEvent['purpose'] = 'commute-to-work',
  overrides: Partial<CommuteBehaviorEvent> = {},
): CommuteBehaviorEvent {
  const roundIndex = state.roundByPurpose[purpose];
  return {
    eventId: `behavior/${state.behaviorSeed}/${purpose}/round-${roundIndex}/trip/citizen-1/completed`,
    commuteEventId: `commute/scenario/${purpose}/completed`,
    behaviorSeed: state.behaviorSeed,
    roundIndex,
    tripId: `trip/citizen-1/${purpose}`,
    citizenId: 'citizen-1',
    purpose,
    estimatedTravelTime: 60,
    actualTravelTime: 60,
    queueWaitTime: 0,
    initialTension: 40,
    currentTension: 40,
    initialStress: 50,
    currentStress: 50,
    ...overrides,
  };
}

function applyBadRound(state: BehaviorState): BehaviorState {
  const updated = applyCommuteBehaviorEvents(state, [
    behaviorEvent(state, 'commute-to-work', {
      estimatedTravelTime: 240,
      actualTravelTime: 1_200,
      queueWaitTime: 180,
      currentTension: 55,
      currentStress: 70,
    }),
  ]);
  return advanceCommuteRound(updated, 'commute-to-work');
}

function emptyTraffic(demandMode: TrafficSimulationState['demandMode']) {
  return {
    simulationVersion: 'phase-4.0',
    simulationSeed: 'scenario',
    demandMode,
    tick: 0,
    elapsedSeconds: 0,
    vehicles: [],
    targetVehicleCount: 0,
    nextVehicleSerial: 0,
    completedTrips: 0,
    totalCompletedTravelTime: 0,
    tripRuntime: [],
    nextDemandTripIndex: 0,
    queuedTripIds: [],
    nextQueuedTripIndex: 0,
    maximumQueueSize: 0,
  } satisfies TrafficSimulationState;
}

function emptyWellbeing(): WellbeingState {
  return {
    wellbeingVersion: 'phase-8.0',
    wellbeingSeed: 'wellbeing',
    scenarioSimulationSeed: 'scenario',
    citizens: [],
    processedEventIds: [],
    metrics: {
      citizenCount: 0,
      averageScores: { stress: 0, tension: 0, calm: 0, happiness: 0 },
      minimumScores: { stress: 0, tension: 0, calm: 0, happiness: 0 },
      maximumScores: { stress: 0, tension: 0, calm: 0, happiness: 0 },
      commuteAffectedCitizenCount: 0,
      averageAbsoluteCommuteTensionImpact: 0,
    },
  };
}

describe('adaptive commute behavior', () => {
  it('preserves Round 0 and behavior-disabled Phase 7 departures exactly', () => {
    const mobility = mobilityFixture();
    const state = initializeBehavior(mobility);
    const baseline = createTrafficDemandCatalog(mobility);
    const roundZero = createBehaviorTrafficDemandCatalog(mobility, state);
    expect(roundZero).toEqual(baseline);

    const adapted = applyBadRound(state);
    const disabled = setBehaviorEnabled(adapted, false);
    expect(createBehaviorTrafficDemandCatalog(mobility, disabled)).toEqual(
      baseline,
    );
  });

  it('makes severe friction adapt earlier while a smooth commute stays stable', () => {
    const initial = initializeBehavior(mobilityFixture());
    const smooth = applyCommuteBehaviorEvents(initial, [behaviorEvent(initial)]);
    const severe = applyCommuteBehaviorEvents(initial, [
      behaviorEvent(initial, 'commute-to-work', {
        eventId: 'severe',
        actualTravelTime: 300,
        queueWaitTime: 180,
        currentTension: 55,
        currentStress: 62,
      }),
    ]);
    const smoothOffset = smooth.commuteBehaviors.find(
      (entry) => entry.citizenId === 'citizen-1' && entry.purpose === 'commute-to-work',
    )!.nextDepartureOffsetMinutes;
    const severeBehavior = severe.commuteBehaviors.find(
      (entry) => entry.citizenId === 'citizen-1' && entry.purpose === 'commute-to-work',
    )!;
    expect(smoothOffset).toBe(0);
    expect(severeBehavior.nextDepartureOffsetMinutes).toBeLessThan(0);
    expect(severeBehavior.lastDecision?.frictionScore).toBeGreaterThan(0);
  });

  it('lets greater acute tension modestly strengthen otherwise equal pressure', () => {
    const initial = initializeBehavior(mobilityFixture());
    const calm = applyCommuteBehaviorEvents(initial, [
      behaviorEvent(initial, 'commute-to-work', {
        eventId: 'calm',
        actualTravelTime: 150,
        queueWaitTime: 60,
      }),
    ]);
    const tense = applyCommuteBehaviorEvents(initial, [
      behaviorEvent(initial, 'commute-to-work', {
        eventId: 'tense',
        actualTravelTime: 150,
        queueWaitTime: 60,
        currentTension: 55,
      }),
    ]);
    const decision = (state: BehaviorState) =>
      state.commuteBehaviors.find(
        (entry) => entry.citizenId === 'citizen-1' && entry.purpose === 'commute-to-work',
      )!.lastDecision!;
    expect(decision(tense).adaptationPressure).toBeGreaterThan(
      decision(calm).adaptationPressure,
    );
    expect(decision(tense).nextOffsetMinutes).toBeLessThanOrEqual(
      decision(calm).nextOffsetMinutes,
    );
  });

  it('clamps repeated severe rounds at the configured earlier-departure cap', () => {
    let state = initializeBehavior(mobilityFixture());
    for (let round = 0; round < 12; round += 1) state = applyBadRound(state);
    const offset = state.commuteBehaviors.find(
      (entry) => entry.citizenId === 'citizen-1' && entry.purpose === 'commute-to-work',
    )!.departureOffsetMinutes;
    expect(offset).toBe(-25);
  });

  it('recovers gradually toward zero after smooth rounds without overshooting', () => {
    let state = initializeBehavior(mobilityFixture());
    for (let round = 0; round < 3; round += 1) state = applyBadRound(state);
    const stressedOffset = state.commuteBehaviors.find(
      (entry) => entry.citizenId === 'citizen-1' && entry.purpose === 'commute-to-work',
    )!.departureOffsetMinutes;
    for (let round = 0; round < 3; round += 1) {
      state = applyCommuteBehaviorEvents(state, [behaviorEvent(state)]);
      state = advanceCommuteRound(state, 'commute-to-work');
    }
    const recoveredOffset = state.commuteBehaviors.find(
      (entry) => entry.citizenId === 'citizen-1' && entry.purpose === 'commute-to-work',
    )!.departureOffsetMinutes;
    expect(recoveredOffset).toBeGreaterThan(stressedOffset);
    expect(recoveredOffset).toBeLessThanOrEqual(0);
    expect(recoveredOffset - stressedOffset).toBe(9);
  });

  it('keeps near-normal pressure in the deadband from oscillating', () => {
    let state = applyBadRound(initializeBehavior(mobilityFixture()));
    const before = state.commuteBehaviors.find(
      (entry) => entry.citizenId === 'citizen-1' && entry.purpose === 'commute-to-work',
    )!.departureOffsetMinutes;
    state = applyCommuteBehaviorEvents(state, [
      behaviorEvent(state, 'commute-to-work', {
        actualTravelTime: 80,
      }),
    ]);
    const after = state.commuteBehaviors.find(
      (entry) => entry.citizenId === 'citizen-1' && entry.purpose === 'commute-to-work',
    )!;
    expect(after.nextDepartureOffsetMinutes).toBe(before);
    expect(after.lastDecision?.direction).toBe('stable');
  });

  it('is idempotent for duplicate completion notifications', () => {
    const initial = initializeBehavior(mobilityFixture());
    const event = behaviorEvent(initial, 'commute-to-work', {
      actualTravelTime: 300,
      queueWaitTime: 180,
    });
    const once = applyCommuteBehaviorEvents(initial, [event]);
    const twice = applyCommuteBehaviorEvents(once, [event]);
    expect(twice).toBe(once);
  });

  it('freezes Round N demand until explicit promotion to Round N+1', () => {
    const mobility = mobilityFixture();
    const initial = initializeBehavior(mobility);
    const roundZero = createBehaviorTrafficDemandCatalog(mobility, initial);
    const learned = applyCommuteBehaviorEvents(initial, [
      behaviorEvent(initial, 'commute-to-work', {
        actualTravelTime: 300,
        queueWaitTime: 180,
      }),
    ]);
    expect(createBehaviorTrafficDemandCatalog(mobility, learned)).toEqual(
      roundZero,
    );
    const roundOne = advanceCommuteRound(learned, 'commute-to-work');
    const roundOneCatalog = createBehaviorTrafficDemandCatalog(mobility, roundOne);
    expect(roundOneCatalog.trips[0].plannedDepartureMinute).toBe(480);
    expect(roundOneCatalog.trips[0].effectiveDepartureMinute).toBeLessThan(480);
    expect(roundZero.trips[2].effectiveDepartureMinute).toBe(485);
  });

  it('keeps morning and evening behavior independent', () => {
    const initial = initializeBehavior(mobilityFixture());
    const learned = applyCommuteBehaviorEvents(initial, [
      behaviorEvent(initial, 'commute-to-work', {
        actualTravelTime: 300,
        queueWaitTime: 180,
      }),
    ]);
    const promoted = advanceCommuteRound(learned, 'commute-to-work');
    const morning = promoted.commuteBehaviors.find(
      (entry) => entry.citizenId === 'citizen-1' && entry.purpose === 'commute-to-work',
    )!;
    const evening = promoted.commuteBehaviors.find(
      (entry) => entry.citizenId === 'citizen-1' && entry.purpose === 'commute-home',
    )!;
    expect(morning.departureOffsetMinutes).toBeLessThan(0);
    expect(evening.departureOffsetMinutes).toBe(0);
    expect(promoted.roundByPurpose['commute-home']).toBe(0);
  });

  it('keeps synthetic traffic behavior-free', () => {
    const mobility = mobilityFixture();
    const behavior = initializeBehavior(mobility);
    expect(
      collectCommuteBehaviorEvents(
        emptyTraffic('synthetic'),
        mobility,
        emptyWellbeing(),
        behavior,
      ),
    ).toEqual([]);
  });

  it('does not mutate mobility, route templates, traffic, or wellbeing inputs', () => {
    const mobility = mobilityFixture();
    const wellbeing = emptyWellbeing();
    const traffic = emptyTraffic('synthetic');
    const before = [mobility, wellbeing, traffic].map((value) => JSON.stringify(value));
    const state = initializeBehavior(mobility);
    createBehaviorTrafficDemandCatalog(mobility, applyBadRound(state));
    collectCommuteBehaviorEvents(traffic, mobility, wellbeing, state);
    expect([mobility, wellbeing, traffic].map((value) => JSON.stringify(value))).toEqual(
      before,
    );
  });

  it('reproduces a complete three-round feedback sequence exactly', () => {
    const run = () => {
      let state = initializeBehavior(mobilityFixture());
      const catalogs = [];
      for (let round = 0; round < 3; round += 1) {
        catalogs.push(createBehaviorTrafficDemandCatalog(mobilityFixture(), state));
        state = applyCommuteBehaviorEvents(state, [
          behaviorEvent(state, 'commute-to-work', {
            actualTravelTime: 240 - round * 55,
            queueWaitTime: 120 - round * 40,
            currentTension: 52 - round * 4,
            currentStress: 60 - round * 3,
          }),
        ]);
        state = advanceCommuteRound(state, 'commute-to-work');
      }
      return { state, catalogs };
    };
    expect(run()).toEqual(run());
  });

  it('reports bounded, finite purpose-specific adaptation metrics', () => {
    const state = applyBadRound(initializeBehavior(mobilityFixture()));
    const metrics = calculateBehaviorMetrics(state, 'commute-to-work');
    expect(metrics.currentRound).toBe(1);
    expect(metrics.adaptedCommuterCount).toBe(1);
    expect(metrics.maximumEarlierShiftMinutes).toBeGreaterThanOrEqual(-25);
    expect(
      Object.values(metrics).every(
        (value) => typeof value === 'string' || Number.isFinite(value),
      ),
    ).toBe(true);
  });
});
