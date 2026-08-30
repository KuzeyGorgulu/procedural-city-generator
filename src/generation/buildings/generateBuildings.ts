import type { SeededRng } from '../../core/rng';
import { getParcelFrontages, type ParcelFrontage } from '../development/frontage';
import {
  canonicalizePolygon,
  getPolygonBounds,
  polygonArea,
} from '../../world/polygonGeometry';
import { intersectSegments, pointDistance } from '../../world/roadGeometry';
import { sampleTerrain } from '../../world/terrainQueries';
import type {
  Building,
  BuildingUse,
  CityBlock,
  Parcel,
  ParcelZoning,
  Point,
  RoadGraph,
  TerrainData,
  UrbanStructure,
} from '../../world/types';
import type { BuildingGenerationConfig, BuildingSetbacks } from './config';
import { BUILDING_CONFIG } from './config';
import {
  getFootprintSamplePoints,
  isValidContainedFootprint,
} from './footprintGeometry';

export interface GenerateBuildingsInput {
  readonly roads: RoadGraph;
  readonly terrain: TerrainData;
  readonly urban: Pick<UrbanStructure, 'blocks' | 'parcels'>;
  readonly zoning: readonly ParcelZoning[];
  readonly rng: SeededRng;
  readonly config?: BuildingGenerationConfig;
}

interface FootprintResult {
  readonly polygon: readonly Point[];
  readonly frontage: ParcelFrontage;
}

function add(point: Point, vector: Point, amount: number): Point {
  return { x: point.x + vector.x * amount, y: point.y + vector.y * amount };
}

function getInwardBasis(
  parcel: Parcel,
  edgeIndex: number,
): { readonly midpoint: Point; readonly tangent: Point; readonly inward: Point } | undefined {
  const start = parcel.polygon[edgeIndex];
  const end = parcel.polygon[(edgeIndex + 1) % parcel.polygon.length];
  if (!start || !end) return undefined;
  const length = pointDistance(start, end);
  if (!Number.isFinite(length) || length <= 1e-7) return undefined;
  const tangent = { x: (end.x - start.x) / length, y: (end.y - start.y) / length };
  return {
    midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    tangent,
    inward: { x: -tangent.y, y: tangent.x },
  };
}

function getFrontageDepth(
  parcel: Parcel,
  edgeIndex: number,
  midpoint: Point,
  inward: Point,
  epsilon: number,
): number {
  const bounds = getPolygonBounds(parcel.polygon);
  const rayLength = Math.max(1, Math.hypot(bounds.width, bounds.height) * 2);
  const rayEnd = add(midpoint, inward, rayLength);
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < parcel.polygon.length; index += 1) {
    if (index === edgeIndex) continue;
    const intersection = intersectSegments(
      midpoint,
      rayEnd,
      parcel.polygon[index],
      parcel.polygon[(index + 1) % parcel.polygon.length],
      epsilon,
    );
    if (!intersection) continue;
    const distance = intersection.firstT * rayLength;
    if (distance > epsilon && distance < nearest) nearest = distance;
  }
  return Number.isFinite(nearest) ? nearest : 0;
}

function adjustedSetbacks(
  use: BuildingUse,
  frontage: ParcelFrontage,
  base: BuildingSetbacks,
): BuildingSetbacks {
  if (frontage.roadType !== 'arterial') return base;
  if (use === 'commercial' || use === 'mixed-use') {
    return { ...base, front: Math.max(1.5, base.front - 0.75) };
  }
  return { ...base, front: base.front + 2 };
}

function makeRectangle(
  midpoint: Point,
  tangent: Point,
  inward: Point,
  width: number,
  depth: number,
  frontSetback: number,
  epsilon: number,
): Point[] {
  const frontCenter = add(midpoint, inward, frontSetback);
  const frontLeft = add(frontCenter, tangent, -width / 2);
  const frontRight = add(frontCenter, tangent, width / 2);
  return canonicalizePolygon(
    [
      frontLeft,
      frontRight,
      add(frontRight, inward, depth),
      add(frontLeft, inward, depth),
    ],
    epsilon,
  );
}

function isTerrainSafe(
  footprint: readonly Point[],
  terrain: TerrainData,
  config: BuildingGenerationConfig,
): boolean {
  const samples = getFootprintSamplePoints(
    footprint,
    config.terrainSampleSpacing,
  ).map((point) => sampleTerrain(terrain, point.x, point.y));
  return (
    samples.length > 0 &&
    samples.every((sample) => !sample.water) &&
    samples.reduce((total, sample) => total + sample.slope, 0) /
      samples.length <=
      config.maxFootprintMeanSlope
  );
}

function tryGenerateFootprint(
  parcel: Parcel,
  block: CityBlock,
  use: BuildingUse,
  roads: RoadGraph,
  terrain: TerrainData,
  rng: SeededRng,
  config: BuildingGenerationConfig,
): FootprintResult | undefined {
  const [minimumCoverage, maximumCoverage] = config.coverageRangeByUse[use];
  const targetArea = parcel.area * rng.fork('coverage').float(
    minimumCoverage,
    maximumCoverage,
  );
  const triedEdges = new Set<number>();
  const frontages = getParcelFrontages(
    parcel,
    block,
    roads,
    config.geometryEpsilon,
  );

  for (const frontage of frontages) {
    if (triedEdges.has(frontage.parcelEdgeIndex)) continue;
    triedEdges.add(frontage.parcelEdgeIndex);
    const basis = getInwardBasis(parcel, frontage.parcelEdgeIndex);
    if (!basis) continue;
    const setbacks = adjustedSetbacks(
      use,
      frontage,
      config.setbacksByUse[use],
    );
    const maximumWidth = frontage.parcelEdgeLength - setbacks.side * 2;
    const maximumDepth =
      getFrontageDepth(
        parcel,
        frontage.parcelEdgeIndex,
        basis.midpoint,
        basis.inward,
        config.geometryEpsilon,
      ) -
      setbacks.front -
      setbacks.rear;
    if (maximumWidth <= 0 || maximumDepth <= 0) continue;

    const targetDepth = Math.min(maximumDepth, targetArea / maximumWidth);
    const targetWidth = Math.min(maximumWidth, targetArea / Math.max(1, targetDepth));
    for (const widthScale of [1, 0.86, 0.72, 0.58]) {
      for (const depthScale of [1, 0.84, 0.7, 0.56]) {
        const footprint = makeRectangle(
          basis.midpoint,
          basis.tangent,
          basis.inward,
          targetWidth * widthScale,
          targetDepth * depthScale,
          setbacks.front,
          config.geometryEpsilon,
        );
        if (
          isValidContainedFootprint(
            footprint,
            parcel.polygon,
            config.minimumFootprintArea,
            config.containmentSampleSpacing,
            config.geometryEpsilon,
          ) &&
          isTerrainSafe(footprint, terrain, config)
        ) {
          return { polygon: footprint, frontage };
        }
      }
    }
  }
  return undefined;
}

function getFloorCount(
  zoning: ParcelZoning,
  use: BuildingUse,
  rng: SeededRng,
  config: BuildingGenerationConfig,
): number {
  const [minimum, maximum] = config.floorsByUseAndIntensity[use][zoning.intensity];
  const context =
    zoning.suitability.centrality * 0.52 +
    zoning.suitability.accessibility * 0.38 +
    zoning.suitability.score * 0.1 +
    rng.fork('floor-jitter').float(-0.1, 0.1);
  return Math.min(
    maximum,
    Math.max(minimum, minimum + Math.round(clamp01(context) * (maximum - minimum))),
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function generateBuildingForParcel(
  parcel: Parcel,
  block: CityBlock,
  zoning: ParcelZoning,
  roads: RoadGraph,
  terrain: TerrainData,
  rng: SeededRng,
  config: BuildingGenerationConfig,
): Building | undefined {
  const use = zoning.zone;
  if (use === 'green' || !zoning.suitability.developable) return undefined;
  const footprint = tryGenerateFootprint(
    parcel,
    block,
    use,
    roads,
    terrain,
    rng.fork('footprint'),
    config,
  );
  if (!footprint) return undefined;
  const footprintArea = polygonArea(footprint.polygon);
  const floorCount = getFloorCount(zoning, use, rng, config);
  const grossFloorArea = footprintArea * floorCount;
  return {
    id: `building-${parcel.id}-main`,
    parcelId: parcel.id,
    blockId: parcel.blockId,
    zone: use,
    use,
    footprint: footprint.polygon,
    footprintArea,
    floorCount,
    height: floorCount * config.floorHeightMeters,
    grossFloorArea,
    usableFloorArea: grossFloorArea * config.usableAreaRatioByUse[use],
    primaryFrontageEdgeIndex: footprint.frontage.parcelEdgeIndex,
    frontageRoadEdgeId: footprint.frontage.roadEdgeId,
  };
}

export function generateBuildings({
  roads,
  terrain,
  urban,
  zoning,
  rng,
  config = BUILDING_CONFIG,
}: GenerateBuildingsInput): Building[] {
  const parcelsById = new Map(urban.parcels.map((parcel) => [parcel.id, parcel]));
  const blocksById = new Map(urban.blocks.map((block) => [block.id, block]));
  const buildings: Building[] = [];
  for (const parcelZoning of [...zoning].sort((a, b) =>
    a.parcelId.localeCompare(b.parcelId),
  )) {
    const parcel = parcelsById.get(parcelZoning.parcelId);
    const block = parcel && blocksById.get(parcel.blockId);
    if (!parcel || !block) continue;
    const building = generateBuildingForParcel(
      parcel,
      block,
      parcelZoning,
      roads,
      terrain,
      rng.fork(`parcel/${parcel.id}`),
      config,
    );
    if (building) buildings.push(building);
  }
  return buildings.sort((first, second) => first.id.localeCompare(second.id));
}
