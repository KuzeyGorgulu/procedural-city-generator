import { useCallback, useEffect, useState } from 'react';
import { collectCommuteBehaviorEvents } from '../behavior/behaviorEvents';
import {
  advanceCommuteRound,
  createBehaviorTrafficDemandCatalog,
  setBehaviorEnabled as setBehaviorEnabledInState,
} from '../behavior/commuteRounds';
import { initializeBehavior } from '../behavior/initializeBehavior';
import type { BehaviorState, CommuteBehaviorEvent } from '../behavior/types';
import { applyCommuteBehaviorEvents } from '../behavior/updateBehavior';
import type { CommutePurpose, MobilityState } from '../mobility/types';
import type { TrafficSimulationController } from '../simulation/traffic/trafficController';
import type { TrafficDemandCatalog } from '../simulation/traffic/types';
import type { WellbeingState } from '../wellbeing/types';

interface BehaviorBundle {
  readonly mobilitySeed: string;
  readonly state: BehaviorState;
  readonly demandCatalog: TrafficDemandCatalog;
}

function createBundle(
  mobility: MobilityState,
  behaviorEnabled = true,
): BehaviorBundle {
  const state = initializeBehavior(mobility, behaviorEnabled);
  return {
    mobilitySeed: mobility.mobilitySeed,
    state,
    demandCatalog: createBehaviorTrafficDemandCatalog(mobility, state),
  };
}

export function useCommuteBehavior(mobility: MobilityState) {
  const [bundle, setBundle] = useState<BehaviorBundle>(() =>
    createBundle(mobility),
  );

  useEffect(() => {
    setBundle((current) =>
      current.mobilitySeed === mobility.mobilitySeed
        ? current
        : createBundle(mobility, current.state.behaviorEnabled),
    );
  }, [mobility]);

  const applyEvents = useCallback(
    (events: readonly CommuteBehaviorEvent[]) => {
      setBundle((current) => {
        const state = applyCommuteBehaviorEvents(current.state, events);
        return state === current.state ? current : { ...current, state };
      });
    },
    [],
  );

  const advanceRound = useCallback(
    (purpose: CommutePurpose) => {
      setBundle((current) => {
        if (current.mobilitySeed !== mobility.mobilitySeed) return current;
        const state = advanceCommuteRound(current.state, purpose);
        return {
          ...current,
          state,
          demandCatalog: createBehaviorTrafficDemandCatalog(mobility, state),
        };
      });
    },
    [mobility],
  );

  const setBehaviorEnabled = useCallback(
    (enabled: boolean) => {
      setBundle((current) => {
        if (current.mobilitySeed !== mobility.mobilitySeed) return current;
        const state = setBehaviorEnabledInState(current.state, enabled);
        return state === current.state
          ? current
          : {
              ...current,
              state,
              demandCatalog: createBehaviorTrafficDemandCatalog(
                mobility,
                state,
              ),
            };
      });
    },
    [mobility],
  );

  const resetBehavior = useCallback(() => {
    setBundle((current) =>
      createBundle(mobility, current.state.behaviorEnabled),
    );
  }, [mobility]);

  return {
    state: bundle.state,
    demandCatalog: bundle.demandCatalog,
    applyEvents,
    advanceRound,
    setBehaviorEnabled,
    resetBehavior,
  };
}

export function useBehaviorFeedback(
  mobility: MobilityState,
  trafficController: TrafficSimulationController,
  wellbeing: WellbeingState,
  behavior: BehaviorState,
  applyEvents: (events: readonly CommuteBehaviorEvent[]) => void,
) {
  useEffect(() => {
    applyEvents(
      collectCommuteBehaviorEvents(
        trafficController.state,
        mobility,
        wellbeing,
        behavior,
      ),
    );
  }, [applyEvents, behavior, mobility, trafficController, wellbeing]);
}

