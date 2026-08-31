import type { Building, World } from '../world/types';

function createBuilding(
  id: string,
  use: Building['use'],
  frontageRoadEdgeId: string,
  offsetX: number,
  usableFloorArea: number,
): Building {
  const footprint = [
    { x: offsetX, y: 10 },
    { x: offsetX + 40, y: 10 },
    { x: offsetX + 40, y: 50 },
    { x: offsetX, y: 50 },
  ];
  return {
    id,
    parcelId: `parcel-${id}`,
    blockId: `block-${id}`,
    zone: use,
    use,
    footprint,
    footprintArea: 1_600,
    floorCount: 2,
    height: 6.4,
    grossFloorArea: usableFloorArea / 0.8,
    usableFloorArea,
    primaryFrontageEdgeIndex: 0,
    frontageRoadEdgeId,
  };
}

export function createDisconnectedPopulationWorld(): World {
  return {
    metadata: { seed: 'disconnected-population', generatorVersion: 'phase-5.0' },
    bounds: { x: 0, y: 0, width: 500, height: 200 },
    terrain: {
      origin: { x: 0, y: 0 },
      width: 500,
      height: 200,
      columns: 2,
      rows: 2,
      cellSize: 200,
      seaLevel: 0.2,
      slopeNormalization: 0.14,
      elevation: [0.8, 0.8, 0.8, 0.8],
      slope: [0.02, 0.02, 0.02, 0.02],
    },
    roads: {
      nodes: [
        { id: 'node-a0', position: { x: 0, y: 0 } },
        { id: 'node-a1', position: { x: 100, y: 0 } },
        { id: 'node-b0', position: { x: 300, y: 0 } },
        { id: 'node-b1', position: { x: 400, y: 0 } },
      ],
      edges: [
        {
          id: 'road-a',
          from: 'node-a0',
          to: 'node-a1',
          type: 'secondary',
          length: 100,
        },
        {
          id: 'road-b',
          from: 'node-b0',
          to: 'node-b1',
          type: 'secondary',
          length: 100,
        },
      ],
    },
    urban: {
      blocks: [],
      parcels: [],
      zoning: [],
      buildings: [
        createBuilding('home-a', 'residential', 'road-a', 20, 9_500),
        createBuilding('work-b', 'commercial', 'road-b', 320, 11_000),
      ],
    },
  };
}
