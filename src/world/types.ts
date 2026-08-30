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
export type BuildingId = string;

export type ZoneType =
  | 'residential'
  | 'commercial'
  | 'industrial'
  | 'mixed-use'
  | 'civic'
  | 'green';

export type DevelopmentIntensity = 'low' | 'medium' | 'high';

export type DevelopmentConstraint =
  | 'invalid-geometry'
  | 'underwater'
  | 'steep'
  | 'too-small'
  | 'too-narrow'
  | 'no-road-frontage';

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

export interface DevelopmentSuitability {
  /** Normalized composite score in [0, 1]. */
  readonly score: number;
  readonly developable: boolean;
  readonly meanSlope: number;
  readonly meanElevation: number;
  readonly waterProximity: number;
  readonly accessibility: number;
  readonly centrality: number;
  readonly constraints: readonly DevelopmentConstraint[];
}

export interface ParcelZoning {
  readonly parcelId: ParcelId;
  readonly blockId: BlockId;
  readonly zone: ZoneType;
  readonly intensity: DevelopmentIntensity;
  readonly suitability: DevelopmentSuitability;
}

export type BuildingUse = Exclude<ZoneType, 'green'>;

export interface Building {
  readonly id: BuildingId;
  readonly parcelId: ParcelId;
  readonly blockId: BlockId;
  readonly zone: BuildingUse;
  readonly use: BuildingUse;
  /** Canonical positive-area ring in world-space meters. */
  readonly footprint: readonly Point[];
  readonly footprintArea: number;
  readonly floorCount: number;
  /** Meters, derived from floorCount and the configured floor height. */
  readonly height: number;
  /** Square meters across all floors. */
  readonly grossFloorArea: number;
  /** Coarse future capacity input after circulation/service allowance. */
  readonly usableFloorArea: number;
  readonly primaryFrontageEdgeIndex: number;
  readonly frontageRoadEdgeId: RoadEdgeId;
}

export interface UrbanStructure {
  readonly blocks: readonly CityBlock[];
  readonly parcels: readonly Parcel[];
  readonly zoning: readonly ParcelZoning[];
  readonly buildings: readonly Building[];
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
