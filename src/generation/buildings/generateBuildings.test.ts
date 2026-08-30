import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../core/rng';
import { generateWorld } from '../generateWorld';
import {
  createDevelopableZoning,
  createDevelopmentFixture,
} from '../development/developmentTestFixtures';
import {
  polygonArea,
  polygonSelfIntersects,
  signedPolygonArea,
} from '../../world/polygonGeometry';
import { sampleTerrain } from '../../world/terrainQueries';
import { BUILDING_CONFIG } from './config';
import { generateBuildings } from './generateBuildings';
import {
  getFootprintSamplePoints,
  isValidContainedFootprint,
} from './footprintGeometry';

describe('generateBuildings', () => {
  it('is deterministic with stable parent-derived IDs and seed diversity', () => {
    const first = generateWorld({ seed: 'building-repeatability' }).urban.buildings;
    const repeated = generateWorld({ seed: 'building-repeatability' }).urban.buildings;
    const different = generateWorld({ seed: 'building-diversity' }).urban.buildings;
    expect(repeated).toEqual(first);
    expect(different).not.toEqual(first);
    expect(repeated.map((building) => building.id)).toEqual(
      first.map((building) => building.id),
    );
    for (const building of first) {
      expect(building.id).toBe(`building-${building.parcelId}-main`);
    }
  });

  it('keeps every full-world footprint finite, valid, contained, and on land', () => {
    for (const seed of ['phase-zero', 'istanbul', 'memleket', 'şehir 🚗']) {
      const world = generateWorld({ seed });
      const parcelsById = new Map(
        world.urban.parcels.map((parcel) => [parcel.id, parcel]),
      );
      const zoningByParcelId = new Map(
        world.urban.zoning.map((entry) => [entry.parcelId, entry]),
      );
      const roadEdgeIds = new Set(world.roads.edges.map((edge) => edge.id));
      expect(world.urban.buildings.length).toBeGreaterThan(0);
      expect(world.urban.buildings.length).toBeLessThan(world.urban.parcels.length);
      expect(new Set(world.urban.buildings.map((building) => building.id)).size).toBe(
        world.urban.buildings.length,
      );

      for (const building of world.urban.buildings) {
        const parcel = parcelsById.get(building.parcelId);
        const zoning = zoningByParcelId.get(building.parcelId);
        expect(parcel).toBeDefined();
        expect(zoning).toBeDefined();
        if (!parcel || !zoning) continue;
        expect(building.blockId).toBe(parcel.blockId);
        expect(building.zone).toBe(zoning.zone);
        expect(building.use).toBe(zoning.zone);
        expect(building.footprint.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
        expect(signedPolygonArea(building.footprint)).toBeGreaterThan(0);
        expect(polygonSelfIntersects(building.footprint)).toBe(false);
        expect(polygonArea(building.footprint)).toBeCloseTo(building.footprintArea);
        expect(
          isValidContainedFootprint(
            building.footprint,
            parcel.polygon,
            BUILDING_CONFIG.minimumFootprintArea,
            BUILDING_CONFIG.containmentSampleSpacing,
          ),
        ).toBe(true);
        expect(Number.isInteger(building.floorCount)).toBe(true);
        expect(building.floorCount).toBeGreaterThanOrEqual(1);
        expect(building.height).toBe(
          building.floorCount * BUILDING_CONFIG.floorHeightMeters,
        );
        expect(building.grossFloorArea).toBeCloseTo(
          building.footprintArea * building.floorCount,
        );
        expect(building.usableFloorArea).toBeGreaterThan(0);
        expect(building.usableFloorArea).toBeLessThanOrEqual(
          building.grossFloorArea,
        );
        expect(parcel.frontageEdgeIndices).toContain(
          building.primaryFrontageEdgeIndex,
        );
        expect(roadEdgeIds.has(building.frontageRoadEdgeId)).toBe(true);
        for (const point of getFootprintSamplePoints(
          building.footprint,
          BUILDING_CONFIG.terrainSampleSpacing,
        )) {
          expect(sampleTerrain(world.terrain, point.x, point.y).water).toBe(false);
        }
      }
    }
  });

  it('generates a frontage-aligned building for a suitable synthetic parcel', () => {
    const fixture = createDevelopmentFixture();
    const buildings = generateBuildings({
      ...fixture,
      zoning: [createDevelopableZoning()],
      rng: createSeededRng('synthetic-building'),
    });
    expect(buildings).toHaveLength(1);
    expect(buildings[0].parcelId).toBe('parcel-block-0000-000');
    expect(buildings[0].frontageRoadEdgeId).toBe('road-north');
  });

  it('skips unsuitable, water-covered, and too-small footprints safely', () => {
    const water = createDevelopmentFixture({
      elevation: Array(9).fill(0.1),
      seaLevel: 0.2,
    });
    expect(
      generateBuildings({
        ...water,
        zoning: [createDevelopableZoning()],
        rng: createSeededRng('water-building'),
      }),
    ).toEqual([]);

    const flat = createDevelopmentFixture();
    expect(
      generateBuildings({
        ...flat,
        zoning: [
          {
            ...createDevelopableZoning(),
            zone: 'green',
            suitability: {
              ...createDevelopableZoning().suitability,
              developable: false,
              constraints: ['too-small'],
            },
          },
        ],
        rng: createSeededRng('unsuitable-building'),
      }),
    ).toEqual([]);
  });
});
