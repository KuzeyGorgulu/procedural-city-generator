import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TrafficSpeedMultiplier } from '../simulation/traffic/config';
import { TrafficSimulationController } from '../simulation/traffic/trafficController';
import type { TrafficMetrics } from '../simulation/traffic/types';
import type { World } from '../world/types';

export interface TrafficUiSnapshot {
  readonly isPlaying: boolean;
  readonly speedMultiplier: TrafficSpeedMultiplier;
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly targetVehicleCount: number;
  readonly metrics: TrafficMetrics;
}

function readSnapshot(
  controller: TrafficSimulationController,
): TrafficUiSnapshot {
  return {
    isPlaying: controller.isPlaying,
    speedMultiplier: controller.speedMultiplier,
    tick: controller.state.tick,
    elapsedSeconds: controller.state.elapsedSeconds,
    targetVehicleCount: controller.state.targetVehicleCount,
    metrics: controller.metrics,
  };
}

export function useTrafficSimulation(world: World) {
  const controller = useMemo(
    () => new TrafficSimulationController(world),
    [world],
  );
  const [snapshot, setSnapshot] = useState<TrafficUiSnapshot>(() =>
    readSnapshot(controller),
  );

  useEffect(() => {
    let frameId = 0;
    let lastFrameTime = performance.now();
    let lastPublishedTime = lastFrameTime;
    let lastPublishedTick = -1;
    setSnapshot(readSnapshot(controller));

    const advance = (frameTime: number) => {
      controller.advanceRealTime((frameTime - lastFrameTime) / 1_000);
      lastFrameTime = frameTime;
      if (
        controller.state.tick !== lastPublishedTick &&
        frameTime - lastPublishedTime >= 200
      ) {
        lastPublishedTick = controller.state.tick;
        lastPublishedTime = frameTime;
        setSnapshot(readSnapshot(controller));
      }
      frameId = requestAnimationFrame(advance);
    };
    frameId = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frameId);
  }, [controller]);

  const publish = useCallback(() => {
    setSnapshot(readSnapshot(controller));
  }, [controller]);

  const toggle = useCallback(() => {
    controller.toggle();
    publish();
  }, [controller, publish]);

  const reset = useCallback(() => {
    controller.reset();
    publish();
  }, [controller, publish]);

  const setSpeedMultiplier = useCallback(
    (multiplier: TrafficSpeedMultiplier) => {
      controller.setSpeedMultiplier(multiplier);
      publish();
    },
    [controller, publish],
  );

  const setTargetVehicleCount = useCallback(
    (count: number) => {
      controller.setTargetVehicleCount(count);
      publish();
    },
    [controller, publish],
  );

  return {
    controller,
    snapshot,
    toggle,
    reset,
    setSpeedMultiplier,
    setTargetVehicleCount,
  };
}
