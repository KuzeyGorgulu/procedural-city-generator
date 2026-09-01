import type { TrafficRoute, Vehicle } from './types';
import type { World } from '../../world/types';

export function createCrossRoadWorld(): World {
  const elevation = Array(9).fill(0.8);
  const slope = Array(9).fill(0);
  return {
    metadata: { seed: 'traffic-fixture', generatorVersion: 'phase-3.5' },
    bounds: { x: 0, y: 0, width: 200, height: 200 },
    terrain: {
      origin: { x: 0, y: 0 },
      width: 200,
      height: 200,
      columns: 3,
      rows: 3,
      cellSize: 100,
      seaLevel: 0.2,
      slopeNormalization: 0.14,
      elevation,
      slope,
    },
    roads: {
      nodes: [
        { id: 'center', position: { x: 100, y: 100 } },
        { id: 'east', position: { x: 200, y: 100 } },
        { id: 'isolated', position: { x: 200, y: 200 } },
        { id: 'north', position: { x: 100, y: 0 } },
        { id: 'south', position: { x: 100, y: 200 } },
        { id: 'west', position: { x: 0, y: 100 } },
      ],
      edges: [
        {
          id: 'edge-center-east',
          from: 'center',
          to: 'east',
          type: 'arterial',
          length: 100,
        },
        {
          id: 'edge-center-south',
          from: 'center',
          to: 'south',
          type: 'secondary',
          length: 100,
        },
        {
          id: 'edge-north-center',
          from: 'north',
          to: 'center',
          type: 'secondary',
          length: 100,
        },
        {
          id: 'edge-west-center',
          from: 'west',
          to: 'center',
          type: 'arterial',
          length: 100,
        },
      ],
    },
    urban: {
      blocks: [
        {
          id: 'block-0000',
          polygon: [
            { x: 20, y: 20 },
            { x: 180, y: 20 },
            { x: 180, y: 180 },
            { x: 20, y: 180 },
          ],
          area: 25_600,
          perimeter: 640,
          boundaryRoadEdgeIds: [
            'edge-center-east',
            'edge-center-south',
            'edge-north-center',
            'edge-west-center',
          ],
          parcelIds: [],
        },
      ],
      parcels: [],
      zoning: [],
      buildings: [],
    },
  };
}

export function createVehicleForRoute(
  id: string,
  route: TrafficRoute,
  progressOnArc: number,
  currentSpeed = 20,
): Vehicle {
  return {
    id,
    source: 'synthetic',
    originNodeId: route.originNodeId,
    destinationNodeId: route.destinationNodeId,
    route,
    routeArcIndex: 0,
    progressOnArc,
    currentSpeed,
    desiredSpeed: 60,
    movementState: 'moving',
    elapsedTripSeconds: 0,
    distanceTravelled: progressOnArc,
  };
}
