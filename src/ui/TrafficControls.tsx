import {
  TRAFFIC_SPEED_MULTIPLIERS,
  TRAFFIC_VEHICLE_LEVELS,
  type TrafficSpeedMultiplier,
} from '../simulation/traffic/config';
import type { TrafficUiSnapshot } from '../app/useTrafficSimulation';
import type {
  TrafficDemandMode,
  Vehicle,
} from '../simulation/traffic/types';

interface TrafficControlsProps {
  readonly selectedVehicle?: Vehicle;
  readonly snapshot: TrafficUiSnapshot;
  readonly onReset: () => void;
  readonly onDemandModeChange: (mode: TrafficDemandMode) => void;
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
  selectedVehicle,
  snapshot,
  onReset,
  onDemandModeChange,
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
        <span>Demand</span>
        <select
          aria-label="Traffic demand mode"
          onChange={(event) =>
            onDemandModeChange(event.target.value as TrafficDemandMode)
          }
          value={snapshot.demandMode}
        >
          <option value="synthetic">Synthetic</option>
          <option value="morning-commute">Morning commute</option>
          <option value="evening-commute">Evening commute</option>
        </select>
      </label>
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
          disabled={snapshot.demandMode !== 'synthetic'}
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
        {snapshot.mobilityMetrics && snapshot.demandMode !== 'synthetic' ? (
          <>
            <div>
              <dt>Commuters</dt>
              <dd>{snapshot.mobilityMetrics.employedCommuters}</dd>
            </div>
            <div>
              <dt>Planned</dt>
              <dd>{snapshot.mobilityMetrics.plannedCommuteTrips}</dd>
            </div>
            <div>
              <dt>Queued</dt>
              <dd>{snapshot.mobilityMetrics.queuedTrips}</dd>
            </div>
            <div>
              <dt>Unreachable</dt>
              <dd>{snapshot.mobilityMetrics.unreachableTrips}</dd>
            </div>
            <div>
              <dt>Max queue</dt>
              <dd>{snapshot.mobilityMetrics.maximumQueueSize}</dd>
            </div>
            <div>
              <dt>Avg estimate</dt>
              <dd>
                {snapshot.mobilityMetrics.averageEstimatedTravelTime.toFixed(1)}s
              </dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Avg speed</dt>
          <dd>{snapshot.metrics.averageCurrentSpeed.toFixed(1)}</dd>
        </div>
        <div>
          <dt>Selected</dt>
          <dd title={selectedVehicle?.id}>
            {selectedVehicle?.id ?? 'Click a vehicle'}
          </dd>
        </div>
        {selectedVehicle ? (
          <div>
            <dt>Source</dt>
            <dd>{selectedVehicle.source}</dd>
          </div>
        ) : null}
        {selectedVehicle?.citizenId ? (
          <div>
            <dt>Citizen</dt>
            <dd title={selectedVehicle.citizenId}>{selectedVehicle.citizenId}</dd>
          </div>
        ) : null}
        {selectedVehicle?.tripPurpose ? (
          <div>
            <dt>Trip</dt>
            <dd title={selectedVehicle.tripId}>{selectedVehicle.tripPurpose}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
