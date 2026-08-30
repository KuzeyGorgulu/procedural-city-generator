import { describe, expect, it } from 'vitest';
import {
  collinearSegmentOverlapLength,
  getPolygonBounds,
  pointInPolygon,
  polygonCentroid,
  polygonInteriorsOverlap,
  polygonSelfIntersects,
  signedPolygonArea,
} from '../../world/polygonGeometry';
import { generateWorld } from '../generateWorld';
import { pointDistance } from '../../world/roadGeometry';
import { sampleTerrain } from '../../world/terrainQueries';
import { URBAN_CONFIG } from './config';

describe('generateUrbanStructure', () => {
  it('produces deterministic but seed-specific blocks and parcels', () => {
    const first = generateWorld({ seed: 'urban-repeatability' }).urban;
    expect(generateWorld({ seed: 'urban-repeatability' }).urban).toEqual(first);
    expect(generateWorld({ seed: 'different-urban-seed' }).urban).not.toEqual(first);
  });

  it('satisfies full-world block, parcel, frontage, and coverage invariants', () => {
    for (const seed of ['phase-zero', 'alpha']) {
      const world = generateWorld({ seed });
      expect(world.urban.blocks.length).toBeGreaterThan(5);
      expect(world.urban.parcels.length).toBeGreaterThan(world.urban.blocks.length);
      expect(world.urban.zoning).toHaveLength(world.urban.parcels.length);
      expect(world.urban.buildings.length).toBeGreaterThan(0);
      const roadEdgeIds = new Set(world.roads.edges.map((edge) => edge.id));
      const roadEdgesById = new Map(world.roads.edges.map((edge) => [edge.id, edge]));
      const roadNodesById = new Map(world.roads.nodes.map((node) => [node.id, node]));
      const blockIds = new Set(world.urban.blocks.map((block) => block.id));
      const parcelIds = new Set(world.urban.parcels.map((parcel) => parcel.id));
      expect(blockIds.size).toBe(world.urban.blocks.length);
      expect(parcelIds.size).toBe(world.urban.parcels.length);

      for (const block of world.urban.blocks) {
        expect(block.polygon.length).toBeGreaterThanOrEqual(3);
        expect(block.polygon.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
        expect(signedPolygonArea(block.polygon)).toBeGreaterThan(0);
        expect(polygonSelfIntersects(block.polygon)).toBe(false);
        expect(Number.isFinite(block.area)).toBe(true);
        expect(Number.isFinite(block.perimeter)).toBe(true);
        expect(block.perimeter).toBeGreaterThan(0);
        expect(block.area).toBeGreaterThanOrEqual(URBAN_CONFIG.minBlockArea);
        expect(block.area).toBeLessThanOrEqual(URBAN_CONFIG.maxBlockArea);
        expect(block.boundaryRoadEdgeIds.every((id) => roadEdgeIds.has(id))).toBe(true);
        expect(
          block.polygon.every(
            ({ x, y }) =>
              x >= world.bounds.x - URBAN_CONFIG.geometryEpsilon &&
              x <= world.bounds.x + world.bounds.width + URBAN_CONFIG.geometryEpsilon &&
              y >= world.bounds.y - URBAN_CONFIG.geometryEpsilon &&
              y <= world.bounds.y + world.bounds.height + URBAN_CONFIG.geometryEpsilon,
          ),
        ).toBe(true);
        for (const edgeId of block.boundaryRoadEdgeIds) {
          const edge = roadEdgesById.get(edgeId)!;
          const start = roadNodesById.get(edge.from)!.position;
          const end = roadNodesById.get(edge.to)!.position;
          const boundaryOverlap = block.polygon.reduce(
            (total, blockStart, index) =>
              total +
              collinearSegmentOverlapLength(
                start,
                end,
                blockStart,
                block.polygon[(index + 1) % block.polygon.length],
              ),
            0,
          );
          expect(boundaryOverlap).toBeCloseTo(pointDistance(start, end));
        }

        const parcels = world.urban.parcels.filter(
          (parcel) => parcel.blockId === block.id,
        );
        expect(parcels.map((parcel) => parcel.id)).toEqual(block.parcelIds);
        expect(parcels.reduce((total, parcel) => total + parcel.area, 0)).toBeCloseTo(
          block.area,
        );
        for (const parcel of parcels) {
          expect(parcel.area).toBeGreaterThanOrEqual(URBAN_CONFIG.minParcelArea);
          expect(parcel.area).toBeLessThanOrEqual(URBAN_CONFIG.maxParcelArea);
          const parcelBounds = getPolygonBounds(parcel.polygon);
          expect(
            Math.min(parcelBounds.width, parcelBounds.height) /
              Math.max(parcelBounds.width, parcelBounds.height),
          ).toBeGreaterThanOrEqual(URBAN_CONFIG.minParcelAspectRatio);
          expect(signedPolygonArea(parcel.polygon)).toBeGreaterThan(0);
          expect(polygonSelfIntersects(parcel.polygon)).toBe(false);
          expect(parcel.polygon.every((point) => pointInPolygon(point, block.polygon))).toBe(true);
          expect(pointInPolygon(polygonCentroid(parcel.polygon), block.polygon)).toBe(
            true,
          );
          const parcelCentroid = polygonCentroid(parcel.polygon);
          expect(
            sampleTerrain(world.terrain, parcelCentroid.x, parcelCentroid.y).water,
          ).toBe(false);
          expect(parcel.frontageEdgeIndices.length).toBeGreaterThan(0);
          for (const frontageIndex of parcel.frontageEdgeIndices) {
            const start = parcel.polygon[frontageIndex];
            const end = parcel.polygon[(frontageIndex + 1) % parcel.polygon.length];
            const overlap = block.polygon.reduce(
              (total, blockStart, index) =>
                total +
                collinearSegmentOverlapLength(
                  start,
                  end,
                  blockStart,
                  block.polygon[(index + 1) % block.polygon.length],
                ),
              0,
            );
            expect(overlap).toBeGreaterThanOrEqual(URBAN_CONFIG.minFrontageLength);
          }
        }
        for (let first = 0; first < parcels.length; first += 1) {
          for (let second = first + 1; second < parcels.length; second += 1) {
            expect(
              polygonInteriorsOverlap(
                parcels[first].polygon,
                parcels[second].polygon,
              ),
            ).toBe(false);
          }
        }
      }

      for (let first = 0; first < world.urban.blocks.length; first += 1) {
        for (let second = first + 1; second < world.urban.blocks.length; second += 1) {
          expect(
            polygonInteriorsOverlap(
              world.urban.blocks[first].polygon,
              world.urban.blocks[second].polygon,
            ),
          ).toBe(false);
        }
      }

      expect(world.urban.parcels.every((parcel) => blockIds.has(parcel.blockId))).toBe(true);
    }
  });

  it('survives JSON serialization without meaningful data loss', () => {
    const urban = generateWorld({ seed: 'urban-serialization' }).urban;
    expect(JSON.parse(JSON.stringify(urban))).toEqual(urban);
  });
});
