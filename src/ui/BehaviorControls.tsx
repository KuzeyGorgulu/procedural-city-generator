import type { BehaviorMetrics, BehaviorState } from '../behavior/types';
import type { CommutePurpose } from '../mobility/types';

interface BehaviorControlsProps {
  readonly state: BehaviorState;
  readonly metrics?: BehaviorMetrics;
  readonly activePurpose?: CommutePurpose;
  readonly roundComplete: boolean;
  readonly onAdvanceRound: () => void;
  readonly onBehaviorEnabledChange: (enabled: boolean) => void;
  readonly onResetBehavior: () => void;
}

function formatShift(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} min`;
}

export function BehaviorControls({
  state,
  metrics,
  activePurpose,
  roundComplete,
  onAdvanceRound,
  onBehaviorEnabledChange,
  onResetBehavior,
}: BehaviorControlsProps) {
  return (
    <section className="behavior-toolbar" aria-label="Commute adaptation controls">
      <div className="behavior-actions">
        <label className="behavior-toggle">
          <input
            checked={state.behaviorEnabled}
            onChange={(event) =>
              onBehaviorEnabledChange(event.currentTarget.checked)
            }
            type="checkbox"
          />
          <span>Adaptive departures</span>
        </label>
        <button
          className="secondary-button"
          disabled={!activePurpose || !roundComplete || !state.behaviorEnabled}
          onClick={onAdvanceRound}
          type="button"
        >
          Advance next round
        </button>
        <button
          className="secondary-button"
          onClick={onResetBehavior}
          type="button"
        >
          Reset adaptations
        </button>
      </div>
      <dl className="behavior-stats" aria-label="Commute adaptation metrics">
        <div>
          <dt>Behavior</dt>
          <dd>{state.behaviorEnabled ? 'Adaptive' : 'Baseline'}</dd>
        </div>
        <div>
          <dt>Commute round</dt>
          <dd>{metrics?.currentRound ?? '—'}</dd>
        </div>
        <div>
          <dt>Current adapted</dt>
          <dd>{metrics?.adaptedCommuterCount ?? 0}</dd>
        </div>
        <div>
          <dt>Next adapted</dt>
          <dd>{metrics?.nextRoundAdaptedCommuterCount ?? 0}</dd>
        </div>
        <div>
          <dt>Average shift</dt>
          <dd>{formatShift(metrics?.averageDepartureShiftMinutes ?? 0)}</dd>
        </div>
        <div>
          <dt>Next average</dt>
          <dd>{formatShift(metrics?.averageNextDepartureShiftMinutes ?? 0)}</dd>
        </div>
        <div>
          <dt>Maximum shift</dt>
          <dd>{formatShift(metrics?.maximumEarlierShiftMinutes ?? 0)}</dd>
        </div>
        <div>
          <dt>Average friction</dt>
          <dd>{((metrics?.averageCommuteFriction ?? 0) * 100).toFixed(1)}%</dd>
        </div>
        <div>
          <dt>Recovering</dt>
          <dd>{metrics?.citizensRecovering ?? 0}</dd>
        </div>
      </dl>
    </section>
  );
}
