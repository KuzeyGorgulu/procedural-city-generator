import type { SeededRng } from '../../core/rng';
import type {
  RoadGraph,
  TerrainData,
  UrbanStructure,
} from '../../world/types';
import type { UrbanGenerationConfig } from './config';
import { polygonCentroid } from '../../world/polygonGeometry';
import { sampleTerrain } from '../../world/terrainQueries';
import { extractBlocks } from './extractBlocks';
import { generateParcelsForBlock } from './generateParcels';

export interface GenerateUrbanStructureInput {
  readonly roads: RoadGraph;
  readonly terrain: TerrainData;
  readonly rng: SeededRng;
  readonly config: UrbanGenerationConfig;
}

export function generateUrbanStructure({
  roads,
  terrain,
  rng,
  config,
}: GenerateUrbanStructureInput): UrbanStructure {
  const extractedBlocks = extractBlocks(roads, terrain, config);
  const generated = extractedBlocks
    .map((block) => ({
      block,
      parcels: generateParcelsForBlock(
        block,
        rng.fork(`parcels-v1/${block.id}`),
        config,
      ),
    }))
    .filter(
      ({ parcels }) =>
        parcels.length > 0 &&
        parcels.every((parcel) => {
          const centroid = polygonCentroid(parcel.polygon);
          return !sampleTerrain(terrain, centroid.x, centroid.y).water;
        }),
    );
  const parcels = generated.flatMap((entry) => entry.parcels);
  const parcelIdsByBlock = new Map<string, string[]>();
  for (const parcel of parcels) {
    const ids = parcelIdsByBlock.get(parcel.blockId) ?? [];
    ids.push(parcel.id);
    parcelIdsByBlock.set(parcel.blockId, ids);
  }
  const blocks = generated.map(({ block }) => ({
    ...block,
    parcelIds: parcelIdsByBlock.get(block.id) ?? [],
  }));
  return { blocks, parcels, zoning: [], buildings: [] };
}
