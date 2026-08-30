import { pointInPolygon, polygonCentroid } from './polygonGeometry';
import type {
  BlockId,
  Building,
  BuildingId,
  CityBlock,
  Parcel,
  ParcelId,
  ParcelZoning,
  Point,
  UrbanStructure,
  ZoneType,
} from './types';

export interface UrbanStatistics {
  readonly blockCount: number;
  readonly parcelCount: number;
  readonly buildingCount: number;
  readonly totalBlockArea: number;
  readonly totalParcelArea: number;
  readonly totalGrossFloorArea: number;
  readonly meanParcelsPerBlock: number;
  readonly zoneCounts: Readonly<Record<ZoneType, number>>;
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

export function getParcelZoning(
  urban: UrbanStructure,
  parcelId: ParcelId,
): ParcelZoning | undefined {
  return urban.zoning.find((entry) => entry.parcelId === parcelId);
}

export function getBuilding(
  urban: UrbanStructure,
  buildingId: BuildingId,
): Building | undefined {
  return urban.buildings.find((building) => building.id === buildingId);
}

export function getBuildingsForParcel(
  urban: UrbanStructure,
  parcelId: ParcelId,
): Building[] {
  return urban.buildings.filter((building) => building.parcelId === parcelId);
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
  const zoneCounts: Record<ZoneType, number> = {
    residential: 0,
    commercial: 0,
    industrial: 0,
    'mixed-use': 0,
    civic: 0,
    green: 0,
  };
  for (const zoning of urban.zoning) zoneCounts[zoning.zone] += 1;
  return {
    blockCount: urban.blocks.length,
    parcelCount: urban.parcels.length,
    buildingCount: urban.buildings.length,
    totalBlockArea,
    totalParcelArea,
    totalGrossFloorArea: urban.buildings.reduce(
      (total, building) => total + building.grossFloorArea,
      0,
    ),
    meanParcelsPerBlock:
      urban.blocks.length === 0 ? 0 : urban.parcels.length / urban.blocks.length,
    zoneCounts,
  };
}
