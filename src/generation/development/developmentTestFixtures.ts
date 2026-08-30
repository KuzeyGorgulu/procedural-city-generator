import type {
  ParcelZoning,
  RoadGraph,
  TerrainData,
  UrbanStructure,
  WorldBounds,
} from '../../world/types';

export interface DevelopmentFixture {
  readonly bounds: WorldBounds;
  readonly roads: RoadGraph;
  readonly terrain: TerrainData;
  readonly urban: UrbanStructure;
}

export function createDevelopmentFixture(
  terrainOverrides: Partial<Pick<TerrainData, 'elevation' | 'slope' | 'seaLevel'>> = {},
): DevelopmentFixture {
  const bounds = { x: 0, y: 0, width: 100, height: 100 };
  const roads: RoadGraph = {
    nodes: [
      { id: 'north-west', position: { x: 0, y: 0 } },
      { id: 'north-east', position: { x: 100, y: 0 } },
      { id: 'south-east', position: { x: 100, y: 100 } },
      { id: 'south-west', position: { x: 0, y: 100 } },
    ],
    edges: [
      {
        id: 'road-north',
        from: 'north-west',
        to: 'north-east',
        type: 'arterial',
        length: 100,
      },
      {
        id: 'road-east',
        from: 'north-east',
        to: 'south-east',
        type: 'secondary',
        length: 100,
      },
      {
        id: 'road-south',
        from: 'south-east',
        to: 'south-west',
        type: 'secondary',
        length: 100,
      },
      {
        id: 'road-west',
        from: 'south-west',
        to: 'north-west',
        type: 'secondary',
        length: 100,
      },
    ],
  };
  const terrain: TerrainData = {
    origin: { x: 0, y: 0 },
    width: 100,
    height: 100,
    columns: 3,
    rows: 3,
    cellSize: 50,
    seaLevel: terrainOverrides.seaLevel ?? 0.2,
    slopeNormalization: 0.14,
    elevation: terrainOverrides.elevation ?? Array(9).fill(0.8),
    slope: terrainOverrides.slope ?? Array(9).fill(0.04),
  };
  const polygon = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  const urban: UrbanStructure = {
    blocks: [
      {
        id: 'block-0000',
        polygon,
        area: 10_000,
        perimeter: 400,
        boundaryRoadEdgeIds: roads.edges.map((edge) => edge.id),
        parcelIds: ['parcel-block-0000-000'],
      },
    ],
    parcels: [
      {
        id: 'parcel-block-0000-000',
        blockId: 'block-0000',
        polygon,
        area: 10_000,
        perimeter: 400,
        frontageEdgeIndices: [0, 1, 2, 3],
      },
    ],
    zoning: [],
    buildings: [],
  };
  return { bounds, roads, terrain, urban };
}

export function createDevelopableZoning(): ParcelZoning {
  return {
    parcelId: 'parcel-block-0000-000',
    blockId: 'block-0000',
    zone: 'residential',
    intensity: 'medium',
    suitability: {
      score: 0.8,
      developable: true,
      meanSlope: 0.04,
      meanElevation: 0.8,
      waterProximity: 0,
      accessibility: 0.9,
      centrality: 0.8,
      constraints: [],
    },
  };
}
