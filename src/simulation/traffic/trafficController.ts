import type { World } from '../../world/types';
import type {
  TrafficSimulationConfig,
  TrafficSpeedMultiplier,
} from './config';
import {
  TRAFFIC_CONFIG,
  TRAFFIC_SPEED_MULTIPLIERS,
} from './config';
import { createInitialTrafficState, setTrafficTargetVehicleCount } from './spawning';
import { getTrafficMetrics } from './trafficMetrics';
import { stepTrafficSimulation } from './trafficSimulation';
import { buildTrafficNetwork } from './trafficNetwork';
import type {
  TrafficMetrics,
  TrafficNetwork,
  TrafficSimulationState,
} from './types';

type TrafficListener = () => void;

export class TrafficSimulationController {
  readonly world: World;
  readonly network: TrafficNetwork;
  readonly config: TrafficSimulationConfig;
  #state: TrafficSimulationState;
  #accumulatorSeconds = 0;
  #playing = false;
  #speedMultiplier: TrafficSpeedMultiplier = 1;
  readonly #listeners = new Set<TrafficListener>();

  constructor(
    world: World,
    targetVehicleCount = TRAFFIC_CONFIG.defaultVehicleCount,
    config: TrafficSimulationConfig = TRAFFIC_CONFIG,
  ) {
    this.world = world;
    this.config = config;
    this.network = buildTrafficNetwork(world, config);
    this.#state = createInitialTrafficState(
      world,
      this.network,
      targetVehicleCount,
      config,
    );
  }

  get state(): TrafficSimulationState {
    return this.#state;
  }

  get isPlaying(): boolean {
    return this.#playing;
  }

  get speedMultiplier(): TrafficSpeedMultiplier {
    return this.#speedMultiplier;
  }

  get metrics(): TrafficMetrics {
    return getTrafficMetrics(this.#state, this.network);
  }

  subscribe(listener: TrafficListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  play(): void {
    if (this.#playing) return;
    this.#playing = true;
    this.#notify();
  }

  pause(): void {
    if (!this.#playing) return;
    this.#playing = false;
    this.#notify();
  }

  toggle(): void {
    if (this.#playing) this.pause();
    else this.play();
  }

  reset(): void {
    this.#playing = false;
    this.#accumulatorSeconds = 0;
    this.#state = createInitialTrafficState(
      this.world,
      this.network,
      this.#state.targetVehicleCount,
      this.config,
    );
    this.#notify();
  }

  setSpeedMultiplier(multiplier: TrafficSpeedMultiplier): void {
    if (!TRAFFIC_SPEED_MULTIPLIERS.includes(multiplier)) return;
    this.#speedMultiplier = multiplier;
    this.#notify();
  }

  setTargetVehicleCount(count: number): void {
    this.#state = setTrafficTargetVehicleCount(
      this.#state,
      this.network,
      count,
      this.config,
    );
    this.#notify();
  }

  advanceRealTime(realDeltaSeconds: number): number {
    if (!this.#playing || !Number.isFinite(realDeltaSeconds) || realDeltaSeconds <= 0) {
      return 0;
    }
    this.#accumulatorSeconds +=
      Math.min(realDeltaSeconds, this.config.maxFrameDeltaSeconds) *
      this.#speedMultiplier;
    const availableTicks = Math.floor(
      (this.#accumulatorSeconds + 1e-9) / this.config.fixedTimeStepSeconds,
    );
    const tickCount = Math.min(
      availableTicks,
      this.config.maxTicksPerAdvance,
    );
    for (let tick = 0; tick < tickCount; tick += 1) {
      this.#state = stepTrafficSimulation(
        this.#state,
        this.network,
        this.config,
      );
    }
    if (tickCount > 0) {
      this.#accumulatorSeconds -=
        tickCount * this.config.fixedTimeStepSeconds;
      this.#notify();
    }
    return tickCount;
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}
