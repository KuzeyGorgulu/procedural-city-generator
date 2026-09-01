import { useEffect, useMemo, useRef, useState } from 'react';
import type { MobilityState } from '../mobility/types';
import type { PopulationState } from '../population/types';
import type { TrafficSimulationController } from '../simulation/traffic/trafficController';
import type { World } from '../world/types';
import { generateEnvironmentalExposure } from '../wellbeing/environmentalExposure';
import {
  initializeWellbeing,
  resetWellbeingForScenario,
} from '../wellbeing/initializeWellbeing';
import { synchronizeWellbeingWithTraffic } from '../wellbeing/updateWellbeing';

export function useWellbeing(
  world: World,
  population: PopulationState,
  mobility: MobilityState,
  trafficController: TrafficSimulationController,
) {
  const exposure = useMemo(
    () => generateEnvironmentalExposure(world, population),
    [world, population],
  );
  const baseline = useMemo(
    () => initializeWellbeing(exposure, population, mobility),
    [exposure, population, mobility],
  );
  const stateRef = useRef(baseline);
  const [state, setState] = useState(baseline);

  useEffect(() => {
    let observedTick = trafficController.state.tick;
    let observedCompletedTrips = trafficController.state.completedTrips;
    const initial = synchronizeWellbeingWithTraffic(
      baseline,
      baseline,
      mobility,
      trafficController.state,
    );
    stateRef.current = initial;
    setState(initial);

    return trafficController.subscribe(() => {
      const traffic = trafficController.state;
      const resetDetected =
        traffic.tick < observedTick ||
        traffic.completedTrips < observedCompletedTrips;
      const completionChanged =
        traffic.completedTrips !== observedCompletedTrips;
      const scenarioChanged =
        traffic.simulationSeed !== stateRef.current.scenarioSimulationSeed;
      observedTick = traffic.tick;
      observedCompletedTrips = traffic.completedTrips;
      if (!resetDetected && !completionChanged && !scenarioChanged) return;

      const source = resetDetected
        ? resetWellbeingForScenario(baseline, traffic.simulationSeed)
        : stateRef.current;
      const next = synchronizeWellbeingWithTraffic(
        source,
        baseline,
        mobility,
        traffic,
      );
      if (next === stateRef.current) return;
      stateRef.current = next;
      setState(next);
    });
  }, [baseline, mobility, trafficController]);

  return { exposure, state };
}
