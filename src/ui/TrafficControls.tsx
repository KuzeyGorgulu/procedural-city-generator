import {
  TRAFFIC_SPEED_MULTIPLIERS,
  TRAFFIC_VEHICLE_LEVELS,
  type TrafficSpeedMultiplier,
} from '../simulation/traffic/config';
import type { TrafficUiSnapshot } from '../app/useTrafficSimulation';

interface TrafficControlsProps {
  readonly selectedVehicleId?: string;
  readonly snapshot: TrafficUiSnapshot;
  readonly onReset: () => void;
  readonly onSpeedChange: (multiplier: TrafficSpeedMultiplier) => void;
  readonly onTargetVehicleCountChange: (count: number) => void;
  readonly onToggle: () => void;
}

function formatSimulationTime(seconds: number): string {
  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  return `${minutes}:${(wholeSeconds % 60).toString().padStart(2, '0')}`;
}

export function TrafficControls({
  selectedVehicleId,
  snapshot,
  onReset,
  onSpeedChange,
  onTargetVehicleCountChange,
  onToggle,
}: TrafficControlsProps) {
  return (
    <section className="traffic-toolbar" aria-label="Traffic simulation controls">
      <div className="traffic-actions">
        <button className="primary-button" onClick={onToggle} type="button">
          {snapshot.isPlaying ? 'Pause traffic' : 'Play traffic'}
        </button>
        <button className="secondary-button" onClick={onReset} type="button">
          Reset
        </button>
      </div>
      <label className="traffic-field">
        <span>Speed</span>
        <select
          aria-label="Simulation speed"
          onChange={(event) =>
            onSpeedChange(Number(event.target.value) as TrafficSpeedMultiplier)
          }
          value={snapshot.speedMultiplier}
        >
          {TRAFFIC_SPEED_MULTIPLIERS.map((multiplier) => (
            <option key={multiplier} value={multiplier}>
              {multiplier}x
            </option>
          ))}
        </select>
      </label>
      <label className="traffic-field">
        <span>Traffic</span>
        <select
          aria-label="Target vehicle count"
          onChange={(event) =>
            onTargetVehicleCountChange(Number(event.target.value))
          }
          value={snapshot.targetVehicleCount}
        >
          {TRAFFIC_VEHICLE_LEVELS.map((count) => (
            <option key={count} value={count}>
              {count} vehicles
            </option>
          ))}
        </select>
      </label>
      <dl className="traffic-stats" aria-label="Traffic metrics">
        <div>
          <dt>Sim time</dt>
          <dd>{formatSimulationTime(snapshot.elapsedSeconds)}</dd>
        </div>
        <div>
          <dt>Active</dt>
          <dd>{snapshot.metrics.activeVehicleCount}</dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>{snapshot.metrics.completedTrips}</dd>
        </div>
        <div>
          <dt>Avg speed</dt>
          <dd>{snapshot.metrics.averageCurrentSpeed.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Selected</dt>
          <dd title={selectedVehicleId}>{selectedVehicleId ?? 'Click a vehicle'}</dd>
        </div>
      </dl>
    </section>
  );
}
