import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generateWorld';
import { generatePopulation } from '../population/generatePopulation';
import type { Building, Parcel, RoadEdge, RoadNode } from '../world/types';
import {
  calculateLocationExposure,
  generateEnvironmentalExposure,
  type EnvironmentalSpatialIndex,
} from './environmentalExposure';

function building(id: string, x: number, grossFloorArea: number): Building {
  return {
    id,
    parcelId: `parcel-${id}`,
    blockId: 'block',
    zone: 'residential',
    use: 'residential',
    footprint: [
      { x: x - 5, y: -5 },
      { x: x + 5, y: -5 },
      { x: x + 5, y: 5 },
      { x: x - 5, y: 5 },
    ],
    footprintArea: 100,
    floorCount: 2,
    height: 6,
    grossFloorArea,
    usableFloorArea: grossFloorArea * 0.8,
    primaryFrontageEdgeIndex: 0,
    frontageRoadEdgeId: 'road',
  };
}

const GREEN_PARCEL: Parcel = {
  id: 'green',
  blockId: 'block',
  polygon: [
    { x: -80, y: -80 },
    { x: 80, y: -80 },
    { x: 80, y: 80 },
    { x: -80, y: 80 },
  ],
  area: 25_600,
  perimeter: 640,
  frontageEdgeIndices: [0],
};

const ROAD_NODES: readonly RoadNode[] = [
  { id: 'west', position: { x: -100, y: 0 } },
  { id: 'east', position: { x: 100, y: 0 } },
];
const ROAD_EDGE: RoadEdge = {
  id: 'road',
  from: 'west',
  to: 'east',
  type: 'arterial',
  length: 200,
};

function controlledIndex(options: {
  readonly green?: boolean;
  readonly dense?: boolean;
  readonly road?: boolean;
}): EnvironmentalSpatialIndex {
  const buildings = options.dense ? [building('dense', 0, 300_000)] : [];
  return {
    buildings,
    buildingCenters: new Map(
      buildings.map((entry) => [entry.id, { x: 0, y: 0 }]),
    ),
    greenParcels: options.green ? [GREEN_PARCEL] : [],
    roads: options.road
      ? [{ edge: ROAD_EDGE, from: ROAD_NODES[0], to: ROAD_NODES[1] }]
      : [],
  };
}

describe('environmental exposure', () => {
  it('responds monotonically to controlled green, density, and road proximity', () => {
    const greenIndex = controlledIndex({ green: true });
    const densityIndex = controlledIndex({ dense: true });
    const roadIndex = controlledIndex({ road: true });
    const near = { x: 0, y: 0 };
    const far = { x: 1_000, y: 1_000 };

    expect(
      calculateLocationExposure('near', near, greenIndex).greenAccess,
    ).toBeGreaterThan(
      calculateLocationExposure('far', far, greenIndex).greenAccess,
    );
    expect(
      calculateLocationExposure('near', near, densityIndex).localDensity,
    ).toBeGreaterThan(
      calculateLocationExposure('far', far, densityIndex).localDensity,
    );
    expect(
      calculateLocationExposure('near', near, roadIndex).roadNoiseProxy,
    ).toBeGreaterThan(
      calculateLocationExposure('far', far, roadIndex).roadNoiseProxy,
    );
  });

  it('is deterministic, bounded, reference-valid, cached, and immutable', () => {
    const world = generateWorld({ seed: 'wellbeing-exposure' });
    const population = generatePopulation(world);
    const beforeWorld = JSON.stringify(world);
    const beforePopulation = JSON.stringify(population);
    const first = generateEnvironmentalExposure(world, population);
    const repeated = generateEnvironmentalExposure(world, population);
    const buildingsById = new Map(
      first.buildingExposures.map((entry) => [entry.buildingId, entry]),
    );

    expect(repeated).toEqual(first);
    expect(first.exposureVersion).toBe('phase-8.0');
    expect(first.citizenProfiles).toHaveLength(population.citizens.length);
    for (const buildingExposure of first.buildingExposures) {
      expect([
        buildingExposure.greenAccess,
        buildingExposure.localDensity,
        buildingExposure.roadNoiseProxy,
        buildingExposure.environmentalQuality,
      ].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(
        true,
      );
    }
    for (const profile of first.citizenProfiles) {
      expect(profile.home).toBe(buildingsById.get(profile.home.buildingId));
      if (profile.workplace) {
        expect(profile.workplace).toBe(
          buildingsById.get(profile.workplace.buildingId),
        );
      }
      expect([
        profile.home.greenAccess,
        profile.home.localDensity,
        profile.home.roadNoiseProxy,
        profile.home.environmentalQuality,
        profile.homeCrowding,
      ].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(
        true,
      );
    }
    expect(JSON.stringify(world)).toBe(beforeWorld);
    expect(JSON.stringify(population)).toBe(beforePopulation);
  }, 20_000);
});
