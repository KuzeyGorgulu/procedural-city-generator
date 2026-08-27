export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface WorldBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Regular row-major heightfield sampled at grid vertices. Elevation and slope
 * are normalized to [0, 1]. The grid spans width/height inclusively.
 */
export interface TerrainData {
  readonly origin: Point;
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: number;
  readonly seaLevel: number;
  readonly slopeNormalization: number;
  readonly elevation: readonly number[];
  readonly slope: readonly number[];
}

export type RoadNodeId = string;
export type RoadEdgeId = string;
export type RoadType = 'arterial' | 'secondary';

export interface RoadNode {
  readonly id: RoadNodeId;
  readonly position: Point;
}

export interface RoadEdge {
  readonly id: RoadEdgeId;
  readonly from: RoadNodeId;
  readonly to: RoadNodeId;
  readonly type: RoadType;
  readonly length: number;
}

export interface RoadGraph {
  readonly nodes: readonly RoadNode[];
  readonly edges: readonly RoadEdge[];
}

export type BlockId = string;
export type ParcelId = string;

export interface CityBlock {
  readonly id: BlockId;
  /** Canonical positive-area ring without a repeated closing vertex. */
  readonly polygon: readonly Point[];
  readonly area: number;
  readonly perimeter: number;
  readonly boundaryRoadEdgeIds: readonly RoadEdgeId[];
  readonly parcelIds: readonly ParcelId[];
}

export interface Parcel {
  readonly id: ParcelId;
  readonly blockId: BlockId;
  /** Canonical positive-area ring without a repeated closing vertex. */
  readonly polygon: readonly Point[];
  readonly area: number;
  readonly perimeter: number;
  /** Indices of parcel boundary segments that overlap the block's road edge. */
  readonly frontageEdgeIndices: readonly number[];
}

export interface UrbanStructure {
  readonly blocks: readonly CityBlock[];
  readonly parcels: readonly Parcel[];
}

export interface WorldMetadata {
  readonly seed: string;
  readonly generatorVersion: string;
}

export interface World {
  readonly metadata: WorldMetadata;
  readonly bounds: WorldBounds;
  readonly terrain: TerrainData;
  readonly roads: RoadGraph;
  readonly urban: UrbanStructure;
}
