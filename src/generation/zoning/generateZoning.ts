import type { SeededRng } from '../../core/rng';
import { getParcelFrontages } from '../development/frontage';
import {
  getPolygonBounds,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonSelfIntersects,
} from '../../world/polygonGeometry';
import { pointDistance } from '../../world/roadGeometry';
import { sampleTerrain } from '../../world/terrainQueries';
import type {
  CityBlock,
  DevelopmentConstraint,
  DevelopmentIntensity,
  DevelopmentSuitability,
  Parcel,
  ParcelZoning,
  Point,
  RoadGraph,
  TerrainData,
  UrbanStructure,
  WorldBounds,
  ZoneType,
} from '../../world/types';
import type { ZoningGenerationConfig } from './config';
import { ZONING_CONFIG } from './config';

export interface GenerateZoningInput {
  readonly bounds: WorldBounds;
  readonly roads: RoadGraph;
  readonly terrain: TerrainData;
  readonly urban: Pick<UrbanStructure, 'blocks' | 'parcels'>;
  readonly rng: SeededRng;
  readonly config?: ZoningGenerationConfig;
}

interface BlockProfile {
  readonly preferredZone: ZoneType;
  readonly centrality: number;
  readonly accessibility: number;
  readonly civicParcelId?: string;
}

const ZONE_ORDER: readonly ZoneType[] = [
  'residential',
  'commercial',
  'industrial',
  'mixed-use',
  'civic',
  'green',
];

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function average(values: readonly number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function samplePolygonTerrain(
  polygon: readonly Point[],
  terrain: TerrainData,
): readonly ReturnType<typeof sampleTerrain>[] {
  if (polygon.length < 3) return [];
  const samples = [polygonCentroid(polygon)];
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    samples.push(start, {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    });
  }
  return samples.map((point) => sampleTerrain(terrain, point.x, point.y));
}

function getWaterProximity(
  terrain: TerrainData,
  point: Point,
  radius: number,
): number {
  let waterSamples = 0;
  const directions = 8;
  for (let index = 0; index < directions; index += 1) {
    const angle = (index / directions) * Math.PI * 2;
    const sample = sampleTerrain(
      terrain,
      point.x + Math.cos(angle) * radius,
      point.y + Math.sin(angle) * radius,
    );
    if (sample.water) waterSamples += 1;
  }
  return waterSamples / directions;
}

function getRoadDegrees(roads: RoadGraph): ReadonlyMap<string, number> {
  const degrees = new Map(roads.nodes.map((node) => [node.id, 0]));
  for (const edge of roads.edges) {
    degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
    degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
  }
  return degrees;
}

function getBlockAccessibility(
  block: CityBlock,
  roads: RoadGraph,
  degrees: ReadonlyMap<string, number>,
): number {
  const edgesById = new Map(roads.edges.map((edge) => [edge.id, edge]));
  let accessibility = 0;
  for (const edgeId of block.boundaryRoadEdgeIds) {
    const edge = edgesById.get(edgeId);
    if (!edge) continue;
    accessibility = Math.max(accessibility, edge.type === 'arterial' ? 0.88 : 0.58);
    if ((degrees.get(edge.from) ?? 0) >= 3 || (degrees.get(edge.to) ?? 0) >= 3) {
      accessibility = Math.min(1, accessibility + 0.1);
    }
  }
  return accessibility;
}

function getParcelAccessibility(
  parcel: Parcel,
  block: CityBlock,
  roads: RoadGraph,
  degrees: ReadonlyMap<string, number>,
): number {
  const edgesById = new Map(roads.edges.map((edge) => [edge.id, edge]));
  let accessibility = 0;
  for (const frontage of getParcelFrontages(parcel, block, roads)) {
    const edge = edgesById.get(frontage.roadEdgeId);
    if (!edge) continue;
    accessibility = Math.max(
      accessibility,
      frontage.roadType === 'arterial' ? 0.9 : 0.6,
    );
    if ((degrees.get(edge.from) ?? 0) >= 3 || (degrees.get(edge.to) ?? 0) >= 3) {
      accessibility = Math.min(1, accessibility + 0.1);
    }
  }
  return accessibility;
}

function getUrbanCenter(blocks: readonly CityBlock[], bounds: WorldBounds): Point {
  if (blocks.length === 0) {
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }
  const centroids = blocks.map((block) => polygonCentroid(block.polygon));
  return {
    x: average(centroids.map((point) => point.x)),
    y: average(centroids.map((point) => point.y)),
  };
}

function getCentrality(point: Point, center: Point, bounds: WorldBounds): number {
  const normalizer = Math.max(1, Math.hypot(bounds.width, bounds.height) * 0.48);
  return clamp01(1 - pointDistance(point, center) / normalizer);
}

function evaluateSuitability(
  parcel: Parcel,
  block: CityBlock,
  roads: RoadGraph,
  terrain: TerrainData,
  degrees: ReadonlyMap<string, number>,
  center: Point,
  bounds: WorldBounds,
  config: ZoningGenerationConfig,
): DevelopmentSuitability {
  const constraints: DevelopmentConstraint[] = [];
  const boundsOfParcel = getPolygonBounds(parcel.polygon);
  const shortestDimension = Math.min(boundsOfParcel.width, boundsOfParcel.height);
  const longestDimension = Math.max(boundsOfParcel.width, boundsOfParcel.height);
  const terrainSamples = samplePolygonTerrain(parcel.polygon, terrain);
  const meanSlope = average(terrainSamples.map((sample) => sample.slope));
  const meanElevation = average(terrainSamples.map((sample) => sample.elevation));
  const landRatio =
    terrainSamples.length === 0
      ? 0
      : terrainSamples.filter((sample) => !sample.water).length / terrainSamples.length;
  const centroid = polygonCentroid(parcel.polygon);
  const waterProximity = getWaterProximity(
    terrain,
    centroid,
    config.waterProbeRadius,
  );
  const frontages = getParcelFrontages(
    parcel,
    block,
    roads,
    config.geometryEpsilon,
  );
  const frontageLength = frontages.reduce(
    (total, frontage) => total + frontage.overlapLength,
    0,
  );
  const accessibility = getParcelAccessibility(parcel, block, roads, degrees);
  const centrality = getCentrality(centroid, center, bounds);
  const validGeometry =
    parcel.polygon.length >= 3 &&
    parcel.polygon.every(
      (point) => Number.isFinite(point.x) && Number.isFinite(point.y),
    ) &&
    Number.isFinite(parcel.area) &&
    polygonArea(parcel.polygon) > config.geometryEpsilon &&
    !polygonSelfIntersects(parcel.polygon, config.geometryEpsilon) &&
    pointInPolygon(centroid, parcel.polygon, config.geometryEpsilon);

  if (!validGeometry) constraints.push('invalid-geometry');
  if (landRatio < config.minimumLandRatio) constraints.push('underwater');
  if (meanSlope > config.maxDevelopableMeanSlope) constraints.push('steep');
  if (parcel.area < config.minimumDevelopableArea) constraints.push('too-small');
  if (shortestDimension < config.minimumUsableDimension) constraints.push('too-narrow');
  if (frontageLength < config.minimumRoadFrontage) constraints.push('no-road-frontage');

  const shapeScore =
    longestDimension <= config.geometryEpsilon
      ? 0
      : clamp01((shortestDimension / longestDimension - 0.08) / 0.62);
  const areaScore = clamp01(
    (parcel.area - config.minimumDevelopableArea) / 16_000,
  );
  const terrainScore = clamp01(1 - meanSlope / config.maxDevelopableMeanSlope);
  const score = clamp01(
    terrainScore * 0.3 +
      shapeScore * 0.18 +
      areaScore * 0.13 +
      accessibility * 0.23 +
      centrality * 0.16 -
      waterProximity * 0.12,
  );

  return {
    score,
    developable: constraints.length === 0,
    meanSlope,
    meanElevation,
    waterProximity,
    accessibility,
    centrality,
    constraints,
  };
}

function chooseBlockProfile(
  block: CityBlock,
  parcels: readonly Parcel[],
  roads: RoadGraph,
  terrain: TerrainData,
  degrees: ReadonlyMap<string, number>,
  center: Point,
  bounds: WorldBounds,
  rng: SeededRng,
  config: ZoningGenerationConfig,
): BlockProfile {
  const centroid = polygonCentroid(block.polygon);
  const centrality = getCentrality(centroid, center, bounds);
  const accessibility = getBlockAccessibility(block, roads, degrees);
  const terrainSample = sampleTerrain(terrain, centroid.x, centroid.y);
  const waterProximity = getWaterProximity(
    terrain,
    centroid,
    config.waterProbeRadius,
  );
  const roll = rng.fork('tendency').next();
  let preferredZone: ZoneType = 'residential';

  if (
    terrainSample.slope >= config.greenMeanSlope ||
    waterProximity >= 0.625 ||
    roll < config.openSpaceBlockChance
  ) {
    preferredZone = 'green';
  } else if (
    block.area >= 20_000 &&
    accessibility >= 0.58 &&
    roll < config.openSpaceBlockChance + config.civicBlockChance
  ) {
    preferredZone = 'civic';
  } else if (
    centrality < 0.48 &&
    accessibility >= 0.82 &&
    block.area >= 16_000 &&
    roll < 0.48
  ) {
    preferredZone = 'industrial';
  } else if (centrality >= 0.75 && accessibility >= 0.82) {
    preferredZone = roll < 0.5 ? 'commercial' : 'mixed-use';
  } else if (centrality >= 0.58 && accessibility >= 0.65) {
    preferredZone = roll < 0.5 ? 'mixed-use' : 'residential';
  }

  const civicParcelId =
    preferredZone === 'civic'
      ? [...parcels].sort(
          (first, second) => second.area - first.area || first.id.localeCompare(second.id),
        )[0]?.id
      : undefined;
  return { preferredZone, centrality, accessibility, civicParcelId };
}

function chooseZone(
  parcel: Parcel,
  suitability: DevelopmentSuitability,
  profile: BlockProfile,
  rng: SeededRng,
  config: ZoningGenerationConfig,
): ZoneType {
  if (
    !suitability.developable ||
    suitability.meanSlope >= config.greenMeanSlope ||
    profile.preferredZone === 'green'
  ) {
    return 'green';
  }
  if (profile.preferredZone === 'civic') {
    if (parcel.id === profile.civicParcelId) return 'civic';
    return suitability.centrality >= 0.5 ? 'mixed-use' : 'residential';
  }
  if (profile.preferredZone === 'industrial') {
    return parcel.area >= 6_000 ? 'industrial' : 'residential';
  }
  if (profile.preferredZone === 'commercial') {
    return suitability.accessibility >= 0.76 ? 'commercial' : 'mixed-use';
  }
  if (profile.preferredZone === 'mixed-use') {
    if (
      suitability.centrality >= 0.76 &&
      suitability.accessibility >= 0.82 &&
      rng.fork('core-exception').next() < 0.32
    ) {
      return 'commercial';
    }
    return suitability.centrality >= 0.56 &&
      suitability.accessibility >= 0.58 &&
      rng.fork('mixed-retention').next() < 0.68
      ? 'mixed-use'
      : 'residential';
  }
  return suitability.centrality >= 0.62 &&
    suitability.accessibility >= 0.76 &&
    rng.fork('transition-exception').next() < 0.28
    ? 'mixed-use'
    : 'residential';
}

function getIntensity(
  zone: ZoneType,
  suitability: DevelopmentSuitability,
): DevelopmentIntensity {
  if (zone === 'green' || zone === 'industrial') return 'low';
  const urbanIntensity =
    suitability.centrality * 0.48 +
    suitability.accessibility * 0.42 +
    suitability.score * 0.1;
  if (zone === 'commercial' || zone === 'mixed-use') {
    return urbanIntensity >= 0.72
      ? 'high'
      : urbanIntensity >= 0.5
        ? 'medium'
        : 'low';
  }
  if (zone === 'civic') return urbanIntensity >= 0.65 ? 'high' : 'medium';
  return urbanIntensity >= 0.76
    ? 'high'
    : urbanIntensity >= 0.48
      ? 'medium'
      : 'low';
}

export function generateZoning({
  bounds,
  roads,
  terrain,
  urban,
  rng,
  config = ZONING_CONFIG,
}: GenerateZoningInput): ParcelZoning[] {
  const blocksById = new Map(urban.blocks.map((block) => [block.id, block]));
  const parcelsByBlock = new Map<string, Parcel[]>();
  for (const parcel of urban.parcels) {
    const parcels = parcelsByBlock.get(parcel.blockId) ?? [];
    parcels.push(parcel);
    parcelsByBlock.set(parcel.blockId, parcels);
  }
  const center = getUrbanCenter(urban.blocks, bounds);
  const degrees = getRoadDegrees(roads);
  const profiles = new Map<string, BlockProfile>();
  for (const block of urban.blocks) {
    profiles.set(
      block.id,
      chooseBlockProfile(
        block,
        parcelsByBlock.get(block.id) ?? [],
        roads,
        terrain,
        degrees,
        center,
        bounds,
        rng.fork(`block/${block.id}`),
        config,
      ),
    );
  }

  const zoning: ParcelZoning[] = [];
  for (const parcel of [...urban.parcels].sort((a, b) => a.id.localeCompare(b.id))) {
    const block = blocksById.get(parcel.blockId);
    const profile = block ? profiles.get(block.id) : undefined;
    if (!block || !profile) continue;
    const suitability = evaluateSuitability(
      parcel,
      block,
      roads,
      terrain,
      degrees,
      center,
      bounds,
      config,
    );
    const zone = chooseZone(
      parcel,
      suitability,
      profile,
      rng.fork(`parcel/${parcel.id}`),
      config,
    );
    zoning.push({
      parcelId: parcel.id,
      blockId: parcel.blockId,
      zone,
      intensity: getIntensity(zone, suitability),
      suitability,
    });
  }
  if (!zoning.some((entry) => entry.zone === 'green') && zoning.length > 0) {
    const blockScores = new Map<string, number[]>();
    for (const entry of zoning) {
      const scores = blockScores.get(entry.blockId) ?? [];
      scores.push(entry.suitability.score);
      blockScores.set(entry.blockId, scores);
    }
    const openSpaceBlockId = [...blockScores.entries()].sort(
      ([firstId, firstScores], [secondId, secondScores]) =>
        average(firstScores) - average(secondScores) ||
        firstId.localeCompare(secondId),
    )[0]?.[0];
    if (openSpaceBlockId) {
      for (let index = 0; index < zoning.length; index += 1) {
        if (zoning[index].blockId !== openSpaceBlockId) continue;
        zoning[index] = { ...zoning[index], zone: 'green', intensity: 'low' };
      }
    }
  }
  return zoning.sort((first, second) => first.parcelId.localeCompare(second.parcelId));
}

export const SUPPORTED_ZONE_TYPES = ZONE_ORDER;
