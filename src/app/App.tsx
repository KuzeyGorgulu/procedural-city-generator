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

export function App() {
  const { seedInput, setSeedInput, world, generate, randomize } = useWorldGeneration();
  const traffic = useTrafficSimulation(world);
  const population = useMemo(() => generatePopulation(world), [world]);
  const [viewMode, setViewMode] = useState<WorldViewMode>('population');
  const [selectedVehicle, setSelectedVehicle] = useState<
    { readonly simulationSeed: string; readonly vehicleId: string } | undefined
  >();
  const selectedVehicleId =
    selectedVehicle?.simulationSeed === traffic.controller.state.simulationSeed
      ? selectedVehicle.vehicleId
      : undefined;
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
          <p className="eyebrow">Phase 6 · Population, Homes &amp; Jobs</p>
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
            <h2 id="viewport-title">Populated city and traffic</h2>
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
        <TrafficControls
          onReset={traffic.reset}
          onSpeedChange={traffic.setSpeedMultiplier}
          onTargetVehicleCountChange={traffic.setTargetVehicleCount}
          onToggle={traffic.toggle}
          selectedVehicleId={selectedVehicleId}
          snapshot={traffic.snapshot}
        />
        <div className="canvas-frame">
          <WorldCanvas
            onSelectVehicle={(vehicleId) =>
              setSelectedVehicle(
                vehicleId
                  ? {
                      simulationSeed: traffic.controller.state.simulationSeed,
                      vehicleId,
                    }
                  : undefined,
              )
            }
            population={population}
            selectedVehicleId={selectedVehicleId}
            trafficController={traffic.controller}
            viewMode={viewMode}
            world={world}
          />
        </div>
      </section>
    </main>
  );
}
