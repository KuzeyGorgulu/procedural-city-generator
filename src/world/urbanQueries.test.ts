import { describe, expect, it } from 'vitest';
import { generateWorld } from '../generation/generateWorld';
import {
  findBlockAtPoint,
  findParcelAtPoint,
  getBlock,
  getBlockCentroid,
  getParcel,
  getParcelCentroid,
  getParcelsForBlock,
  getUrbanStatistics,
} from './urbanQueries';

describe('urban queries', () => {
  it('looks up blocks, parcels, containment, and derived statistics', () => {
    const urban = generateWorld({ seed: 'phase-zero' }).urban;
    const block = urban.blocks[0];
    const parcel = block && getParcelsForBlock(urban, block.id)[0];
    expect(block).toBeDefined();
    expect(parcel).toBeDefined();
    if (!block || !parcel) return;

    expect(getBlock(urban, block.id)).toBe(block);
    expect(getParcel(urban, parcel.id)).toBe(parcel);
    expect(findBlockAtPoint(urban, getBlockCentroid(block))?.id).toBe(block.id);
    expect(findParcelAtPoint(urban, getParcelCentroid(parcel))?.id).toBe(parcel.id);
    expect(findBlockAtPoint(urban, parcel.polygon[0])?.id).toBe(block.id);
    expect(findParcelAtPoint(urban, parcel.polygon[0])).toBeDefined();
    const statistics = getUrbanStatistics(urban);
    expect(statistics.blockCount).toBe(urban.blocks.length);
    expect(statistics.parcelCount).toBe(urban.parcels.length);
    expect(statistics.totalParcelArea).toBeCloseTo(statistics.totalBlockArea);
  });
});
