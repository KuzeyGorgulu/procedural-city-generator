import type {
  WellbeingExplanation,
  WellbeingMetrics,
  WellbeingScores,
} from '../wellbeing/types';

interface WellbeingSummaryProps {
  readonly metrics: WellbeingMetrics;
  readonly selected?: WellbeingExplanation;
  readonly selectedTripId?: string;
  readonly selectedVehicleId?: string;
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

function ScoreSummary({ scores }: { readonly scores: WellbeingScores }) {
  return (
    <>
      <div>
        <dt>Stress</dt>
        <dd>{formatScore(scores.stress)}</dd>
      </div>
      <div>
        <dt>Tension</dt>
        <dd>{formatScore(scores.tension)}</dd>
      </div>
      <div>
        <dt>Calm</dt>
        <dd>{formatScore(scores.calm)}</dd>
      </div>
      <div>
        <dt>Happiness</dt>
        <dd>{formatScore(scores.happiness)}</dd>
      </div>
    </>
  );
}

export function WellbeingSummary({
  metrics,
  selected,
  selectedTripId,
  selectedVehicleId,
}: WellbeingSummaryProps) {
  const lastCommute = selected?.citizen.lastCommuteImpact;
  return (
    <section className="wellbeing-toolbar" aria-label="Population wellbeing">
      <dl className="wellbeing-stats" aria-label="Average wellbeing scores">
        <ScoreSummary scores={metrics.averageScores} />
        <div>
          <dt>Commute affected</dt>
          <dd>{metrics.commuteAffectedCitizenCount}</dd>
        </div>
      </dl>
      <div className="wellbeing-inspector" aria-live="polite">
        {selected ? (
          <>
            <p>
              <strong title={selected.citizen.citizenId}>
                Selected citizen
              </strong>
              <span>{selected.citizen.citizenId}</span>
            </p>
            <dl>
              <ScoreSummary scores={selected.citizen.scores} />
              <div>
                <dt>Vehicle / trip</dt>
                <dd
                  title={`${selectedVehicleId ?? ''} / ${selectedTripId ?? ''}`}
                >
                  {selectedVehicleId ?? 'completed'} / {selectedTripId ?? 'n/a'}
                </dd>
              </div>
              <div>
                <dt>Home / work</dt>
                <dd
                  title={`${selected.exposure.home.buildingId} / ${
                    selected.exposure.workplace?.buildingId ?? 'none'
                  }`}
                >
                  {selected.exposure.home.buildingId} /{' '}
                  {selected.exposure.workplace?.buildingId ?? 'none'}
                </dd>
              </div>
              <div>
                <dt>Home environment</dt>
                <dd>
                  {(selected.exposure.home.environmentalQuality * 100).toFixed(0)}
                </dd>
              </div>
              <div>
                <dt>Home green / noise</dt>
                <dd>
                  {(selected.exposure.home.greenAccess * 100).toFixed(0)} /{' '}
                  {(selected.exposure.home.roadNoiseProxy * 100).toFixed(0)}
                </dd>
              </div>
              {selected.exposure.workplace ? (
                <div>
                  <dt>Work env / density</dt>
                  <dd>
                    {(
                      selected.exposure.workplace.environmentalQuality * 100
                    ).toFixed(0)}{' '}
                    /{' '}
                    {(selected.exposure.workplace.localDensity * 100).toFixed(0)}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Home crowding</dt>
                <dd>{(selected.exposure.homeCrowding * 100).toFixed(0)}</dd>
              </div>
              <div>
                <dt>Static stressors</dt>
                <dd title={selected.dominantStaticStressors.join(', ')}>
                  {selected.dominantStaticStressors.join(', ') || 'none material'}
                </dd>
              </div>
              <div>
                <dt>Restorative</dt>
                <dd title={selected.restorativeFactors.join(', ')}>
                  {selected.restorativeFactors.join(', ') || 'none material'}
                </dd>
              </div>
              {lastCommute ? (
                <>
                  <div>
                    <dt>Last commute</dt>
                    <dd>
                      {lastCommute.actualTravelTime.toFixed(1)}s actual /{' '}
                      {lastCommute.estimatedTravelTime.toFixed(1)}s expected
                    </dd>
                  </div>
                  <div>
                    <dt>Queue / tension Δ</dt>
                    <dd>
                      {lastCommute.queueWaitTime.toFixed(1)}s / +
                      {lastCommute.scoreDelta.tension.toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt>Commute Δ S/T/C/H</dt>
                    <dd title="Stress / tension / calm / happiness commute change">
                      {lastCommute.scoreDelta.stress.toFixed(2)} /{' '}
                      {lastCommute.scoreDelta.tension.toFixed(2)} /{' '}
                      {lastCommute.scoreDelta.calm.toFixed(2)} /{' '}
                      {lastCommute.scoreDelta.happiness.toFixed(2)}
                    </dd>
                  </div>
                  <div>
                    <dt>Applied commutes</dt>
                    <dd>{selected.citizen.processedCommuteCount}</dd>
                  </div>
                </>
              ) : null}
            </dl>
          </>
        ) : (
          <p>Select a population commute vehicle to inspect its citizen.</p>
        )}
      </div>
    </section>
  );
}
