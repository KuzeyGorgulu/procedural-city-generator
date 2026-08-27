import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../../core/rng';
import {
  pointInPolygon,
  polygonArea,
  polygonInteriorsOverlap,
  polygonSelfIntersects,
} from '../../world/polygonGeometry';
import type { CityBlock } from '../../world/types';
import { URBAN_CONFIG } from './config';
import { generateParcelsForBlock } from './generateParcels';

const BLOCK: CityBlock = {
  id: 'block-0000',
  polygon: [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 100 },
    { x: 0, y: 100 },
  ],
  area: 12_000,
  perimeter: 440,
  boundaryRoadEdgeIds: ['north', 'east', 'south', 'west'],
  parcelIds: [],
};

const CONFIG = {
  ...URBAN_CONFIG,
  minParcelArea: 1_000,
  targetParcelAreaMin: 3_500,
  targetParcelAreaMax: 3_500,
};

function blockFromPolygon(id: string, polygon: CityBlock['polygon']): CityBlock {
  return {
    id,
    polygon,
    area: polygonArea(polygon),
    perimeter: 0,
    boundaryRoadEdgeIds: [],
    parcelIds: [],
  };
}

describe('generateParcelsForBlock', () => {
  it('is deterministic, covers the block, and gives every parcel frontage', () => {
    const first = generateParcelsForBlock(
      BLOCK,
      createSeededRng('parcel-fixture'),
      CONFIG,
    );
    const second = generateParcelsForBlock(
      BLOCK,
      createSeededRng('parcel-fixture'),
      CONFIG,
    );
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(1);
    expect(first.reduce((sum, parcel) => sum + parcel.area, 0)).toBeCloseTo(
      BLOCK.area,
    );
    for (const parcel of first) {
      expect(parcel.area).toBeGreaterThanOrEqual(CONFIG.minParcelArea);
      expect(parcel.frontageEdgeIndices.length).toBeGreaterThan(0);
      expect(polygonSelfIntersects(parcel.polygon)).toBe(false);
      expect(pointInPolygon(parcel.polygon[0], BLOCK.polygon)).toBe(true);
    }
    for (let firstIndex = 0; firstIndex < first.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < first.length; secondIndex += 1) {
        expect(
          polygonInteriorsOverlap(
            first[firstIndex].polygon,
            first[secondIndex].polygon,
          ),
        ).toBe(false);
      }
    }
  });

  it('keeps the original block as one parcel when no safe split is needed', () => {
    const parcels = generateParcelsForBlock(
      BLOCK,
      createSeededRng('large-target'),
      { ...CONFIG, targetParcelAreaMin: 20_000, targetParcelAreaMax: 20_000 },
    );
    expect(parcels).toHaveLength(1);
    expect(parcels[0].polygon).toEqual(BLOCK.polygon);
    expect(polygonArea(parcels[0].polygon)).toBe(BLOCK.area);
  });

  it('isolates a block from unrelated RNG domains and other block generation', () => {
    const root = createSeededRng('block-local-isolation');
    const before = generateParcelsForBlock(
      BLOCK,
      root.fork('parcels-v1/block-0000'),
      CONFIG,
    );
    root.fork('unrelated-system').next();
    generateParcelsForBlock(
      { ...BLOCK, id: 'block-9999' },
      root.fork('parcels-v1/block-9999'),
      CONFIG,
    );
    const after = generateParcelsForBlock(
      BLOCK,
      root.fork('parcels-v1/block-0000'),
      CONFIG,
    );
    expect(after).toEqual(before);
  });

  it.each([
    [
      'long rectangle',
      [
        { x: 0, y: 0 },
        { x: 300, y: 0 },
        { x: 300, y: 60 },
        { x: 0, y: 60 },
      ],
    ],
    [
      'irregular convex polygon',
      [
        { x: 0, y: 0 },
        { x: 140, y: 0 },
        { x: 180, y: 80 },
        { x: 90, y: 140 },
        { x: 0, y: 100 },
      ],
    ],
    [
      'simple concave polygon',
      [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 120, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 120 },
        { x: 0, y: 120 },
      ],
    ],
  ] as const)('safely covers a %s', (_name, polygon) => {
    const block = blockFromPolygon('block-shape', polygon);
    const parcels = generateParcelsForBlock(
      block,
      createSeededRng('shape-fixture'),
      { ...CONFIG, minParcelAspectRatio: 0.05 },
    );
    expect(parcels.reduce((sum, parcel) => sum + parcel.area, 0)).toBeCloseTo(
      block.area,
    );
    expect(parcels.every((parcel) => parcel.frontageEdgeIndices.length > 0)).toBe(
      true,
    );
    expect(parcels.every((parcel) => !polygonSelfIntersects(parcel.polygon))).toBe(
      true,
    );
  });
});
