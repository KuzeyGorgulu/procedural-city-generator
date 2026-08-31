import type { PopulationMetrics } from '../population/types';

interface PopulationSummaryProps {
  readonly metrics: PopulationMetrics;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function PopulationSummary({ metrics }: PopulationSummaryProps) {
  return (
    <section className="population-toolbar" aria-label="Population metrics">
      <dl className="population-stats">
        <div>
          <dt>Population</dt>
          <dd>{metrics.totalPopulation.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Households</dt>
          <dd>{metrics.householdCount.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Homes occupied</dt>
          <dd>
            {metrics.occupiedDwellings.toLocaleString()} /{' '}
            {metrics.dwellingCapacity.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt>Housing occupancy</dt>
          <dd>{formatPercent(metrics.housingOccupancyRatio)}</dd>
        </div>
        <div>
          <dt>Working age</dt>
          <dd>{metrics.workingAgePopulation.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Labor force</dt>
          <dd>{metrics.laborForcePopulation.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Participation</dt>
          <dd>{formatPercent(metrics.laborForceParticipationRate)}</dd>
        </div>
        <div>
          <dt>Employed</dt>
          <dd>{metrics.employedPopulation.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Employment rate</dt>
          <dd>{formatPercent(metrics.employmentRate)}</dd>
        </div>
        <div>
          <dt>Unemployed</dt>
          <dd>{metrics.unemployedPopulation.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Unemployment rate</dt>
          <dd>{formatPercent(metrics.unemploymentRate)}</dd>
        </div>
        <div>
          <dt>Not in labor force</dt>
          <dd>{metrics.notInLaborForcePopulation.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Jobs filled</dt>
          <dd>
            {metrics.filledJobs.toLocaleString()} /{' '}
            {metrics.totalJobCapacity.toLocaleString()}
          </dd>
        </div>
        <div>
          <dt>Vacant jobs</dt>
          <dd>{metrics.vacantJobs.toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  );
}
