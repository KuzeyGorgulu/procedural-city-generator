import { useMemo, useState } from 'react';
import { useWorldGeneration } from './useWorldGeneration';
import type { WorldViewMode } from '../rendering/canvasRenderer';
import { GenerationControls } from '../ui/GenerationControls';
import { WorldCanvas } from '../ui/WorldCanvas';
import { getRoadStatistics } from '../world/roadQueries';
import { getUrbanStatistics } from '../world/urbanQueries';

export function App() {
  const { seedInput, setSeedInput, world, generate, randomize } = useWorldGeneration();
  const [viewMode, setViewMode] = useState<WorldViewMode>('parcels');
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
          <p className="eyebrow">Phase 3 · Urban Structure</p>
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
            <h2 id="viewport-title">Blocks and parcels</h2>
            <p>Drag to pan · Scroll to zoom</p>
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
              <dt>Road edges</dt>
              <dd>{roadStatistics.edgeCount}</dd>
            </div>
            <div>
              <dt>Active seed</dt>
              <dd title={world.metadata.seed}>{world.metadata.seed}</dd>
            </div>
          </dl>
        </div>
        <div className="canvas-frame">
          <WorldCanvas viewMode={viewMode} world={world} />
        </div>
      </section>
    </main>
  );
}
