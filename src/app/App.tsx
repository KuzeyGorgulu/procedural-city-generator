import { useMemo, useState } from 'react';
import { useWorldGeneration } from './useWorldGeneration';
import { useTrafficSimulation } from './useTrafficSimulation';
import type { WorldViewMode } from '../rendering/canvasRenderer';
import { GenerationControls } from '../ui/GenerationControls';
import { WorldCanvas } from '../ui/WorldCanvas';
import { TrafficControls } from '../ui/TrafficControls';
import { PopulationSummary } from '../ui/PopulationSummary';
import { getRoadStatistics } from '../world/roadQueries';
import { getUrbanStatistics } from '../world/urbanQueries';
import { generatePopulation } from '../population/generatePopulation';
import { generateMobility } from '../mobility/generateMobility';
import { createTrafficDemandCatalog } from '../mobility/trafficDemand';
import { useWellbeing } from './useWellbeing';
import { WellbeingSummary } from '../ui/WellbeingSummary';
import {
  aggregateWellbeingByHomeBuilding,
  explainCitizenWellbeing,
} from '../wellbeing/queries';
import type { WellbeingDimension } from '../wellbeing/types';

export function App() {
  const { seedInput, setSeedInput, world, generate, randomize } = useWorldGeneration();
  const population = useMemo(() => generatePopulation(world), [world]);
  const mobility = useMemo(
    () => generateMobility(world, population),
    [world, population],
  );
  const demandCatalog = useMemo(
    () => createTrafficDemandCatalog(mobility),
    [mobility],
  );
  const traffic = useTrafficSimulation(world, demandCatalog);
  const wellbeing = useWellbeing(
    world,
    population,
    mobility,
    traffic.controller,
  );
  const [viewMode, setViewMode] = useState<WorldViewMode>('wellbeing');
  const [wellbeingDimension, setWellbeingDimension] =
    useState<WellbeingDimension>('happiness');
  const [vehicleSelection, setSelectedVehicle] = useState<
    | {
        readonly simulationSeed: string;
        readonly vehicleId: string;
        readonly citizenId?: string;
        readonly tripId?: string;
      }
    | undefined
  >();
  const selectedVehicleId =
    vehicleSelection?.simulationSeed === traffic.controller.state.simulationSeed
      ? vehicleSelection.vehicleId
      : undefined;
  const selectedVehicle = selectedVehicleId
    ? traffic.controller.state.vehicles.find(
        (vehicle) => vehicle.id === selectedVehicleId,
      )
    : undefined;
  const selectedWellbeing = useMemo(
    () =>
      vehicleSelection?.simulationSeed ===
      traffic.controller.state.simulationSeed
        ? explainCitizenWellbeing(
            vehicleSelection.citizenId,
            wellbeing.state,
            wellbeing.exposure,
          )
        : undefined,
    [
      vehicleSelection,
      traffic.controller,
      wellbeing.state,
      wellbeing.exposure,
    ],
  );
  const wellbeingByBuildingId = useMemo(
    () =>
      new Map(
        aggregateWellbeingByHomeBuilding(wellbeing.state, population).map(
          (summary) => [summary.buildingId, summary],
        ),
      ),
    [wellbeing.state, population],
  );
  const wellbeingRenderInput = useMemo(
    () => ({
      dimension: wellbeingDimension,
      byBuildingId: wellbeingByBuildingId,
    }),
    [wellbeingDimension, wellbeingByBuildingId],
  );
  const roadStatistics = useMemo(
    () => getRoadStatistics(world.roads),
    [world.roads],
  );
  const urbanStatistics = useMemo(
    () => getUrbanStatistics(world.urban),
    [world.urban],
  );

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">
            Phase 8 &middot; Wellbeing &amp; Environmental Exposure
          </p>
          <h1>Procedural City Generator</h1>
          <p className="subtitle">A deterministic world, one seed at a time.</p>
        </div>
        <GenerationControls
          generatorVersion={world.metadata.generatorVersion}
          onGenerate={generate}
          onRandomize={randomize}
          onSeedChange={setSeedInput}
          seed={seedInput}
        />
      </header>

      <section className="viewport-panel" aria-labelledby="viewport-title">
        <div className="viewport-toolbar">
          <div>
            <h2 id="viewport-title">City wellbeing and daily mobility</h2>
            <p>Drag to pan · Scroll to zoom · Click a vehicle for its route</p>
          </div>
          <label className="terrain-view-field">
            <span>View</span>
            <select
              aria-label="World visualization"
              onChange={(event) =>
                setViewMode(event.target.value as WorldViewMode)
              }
              value={viewMode}
            >
              <option value="wellbeing">Wellbeing</option>
              <option value="population">Population occupancy</option>
              <option value="jobs">Jobs / employment</option>
              <option value="buildings">Buildings</option>
              <option value="zoning">Zoning</option>
              <option value="suitability">Development suitability</option>
              <option value="parcels">Parcels</option>
              <option value="blocks">Blocks</option>
              <option value="elevation">Elevation</option>
              <option value="slope">Slope</option>
              <option value="water">Water / land</option>
              <option value="roadGraph">Road graph</option>
            </select>
          </label>
          {viewMode === 'wellbeing' ? (
            <label className="terrain-view-field">
              <span>Metric</span>
              <select
                aria-label="Wellbeing map metric"
                onChange={(event) =>
                  setWellbeingDimension(
                    event.target.value as WellbeingDimension,
                  )
                }
                value={wellbeingDimension}
              >
                <option value="happiness">Happiness</option>
                <option value="calm">Calm</option>
                <option value="stress">Stress</option>
                <option value="tension">Tension</option>
              </select>
            </label>
          ) : null}
          <dl className="world-stats">
            <div>
              <dt>Blocks</dt>
              <dd>{urbanStatistics.blockCount}</dd>
            </div>
            <div>
              <dt>Parcels</dt>
              <dd>{urbanStatistics.parcelCount}</dd>
            </div>
            <div>
              <dt>Buildings</dt>
              <dd>{urbanStatistics.buildingCount}</dd>
            </div>
            <div>
              <dt>Road edges</dt>
              <dd>{roadStatistics.edgeCount}</dd>
            </div>
            <div>
              <dt>Active seed</dt>
              <dd title={world.metadata.seed}>{world.metadata.seed}</dd>
            </div>
          </dl>
        </div>
        <PopulationSummary metrics={population.metrics} />
        <WellbeingSummary
          metrics={wellbeing.state.metrics}
          selected={selectedWellbeing}
          selectedTripId={vehicleSelection?.tripId}
          selectedVehicleId={selectedVehicleId}
        />
        <TrafficControls
          onDemandModeChange={traffic.setDemandMode}
          onReset={traffic.reset}
          onSpeedChange={traffic.setSpeedMultiplier}
          onTargetVehicleCountChange={traffic.setTargetVehicleCount}
          onToggle={traffic.toggle}
          selectedVehicle={selectedVehicle}
          snapshot={traffic.snapshot}
        />
        <div className="canvas-frame">
          <WorldCanvas
            onSelectVehicle={(vehicle) =>
              setSelectedVehicle(
                vehicle
                  ? {
                      simulationSeed: traffic.controller.state.simulationSeed,
                      vehicleId: vehicle.id,
                      citizenId: vehicle.citizenId,
                      tripId: vehicle.tripId,
                    }
                  : undefined,
              )
            }
            population={population}
            selectedVehicleId={selectedVehicleId}
            trafficController={traffic.controller}
            viewMode={viewMode}
            wellbeing={wellbeingRenderInput}
            world={world}
          />
        </div>
      </section>
    </main>
  );
}
