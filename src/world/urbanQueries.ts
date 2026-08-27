import { pointInPolygon, polygonCentroid } from './polygonGeometry';
import type {
  BlockId,
  CityBlock,
  Parcel,
  ParcelId,
  Point,
  UrbanStructure,
} from './types';

export interface UrbanStatistics {
  readonly blockCount: number;
  readonly parcelCount: number;
  readonly totalBlockArea: number;
  readonly totalParcelArea: number;
  readonly meanParcelsPerBlock: number;
}

export function getBlock(
  urban: UrbanStructure,
  blockId: BlockId,
): CityBlock | undefined {
  return urban.blocks.find((block) => block.id === blockId);
}

export function getParcel(
  urban: UrbanStructure,
  parcelId: ParcelId,
): Parcel | undefined {
  return urban.parcels.find((parcel) => parcel.id === parcelId);
}

export function getParcelsForBlock(
  urban: UrbanStructure,
  blockId: BlockId,
): Parcel[] {
  return urban.parcels.filter((parcel) => parcel.blockId === blockId);
}

export function getBlockCentroid(block: CityBlock): Point {
  return polygonCentroid(block.polygon);
}

export function getParcelCentroid(parcel: Parcel): Point {
  return polygonCentroid(parcel.polygon);
}

export function findBlockAtPoint(
  urban: UrbanStructure,
  point: Point,
): CityBlock | undefined {
  return urban.blocks.find((block) => pointInPolygon(point, block.polygon));
}

export function findParcelAtPoint(
  urban: UrbanStructure,
  point: Point,
): Parcel | undefined {
  return urban.parcels.find((parcel) => pointInPolygon(point, parcel.polygon));
}

export function getUrbanStatistics(urban: UrbanStructure): UrbanStatistics {
  const totalBlockArea = urban.blocks.reduce((total, block) => total + block.area, 0);
  const totalParcelArea = urban.parcels.reduce(
    (total, parcel) => total + parcel.area,
    0,
  );
  return {
    blockCount: urban.blocks.length,
    parcelCount: urban.parcels.length,
    totalBlockArea,
    totalParcelArea,
    meanParcelsPerBlock:
      urban.blocks.length === 0 ? 0 : urban.parcels.length / urban.blocks.length,
  };
}
