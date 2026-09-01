import type { PopulationState } from '../population/types';
import {
  pointInPolygon,
  polygonCentroid,
} from '../world/polygonGeometry';
import {
  pointDistance,
  projectPointToSegment,
} from '../world/roadGeometry';
import type {
  Building,
  Parcel,
  Point,
  RoadEdge,
  RoadNode,
  World,
} from '../world/types';
import type { WellbeingConfig } from './config';
import { clampUnit, WELLBEING_CONFIG } from './config';
import type {
  EnvironmentalExposureProfile,
  EnvironmentalExposureState,
  LocationExposure,
} from './types';

const EXPOSURE_SEED_SEPARATOR = '\u001e';

interface IndexedRoad {
  readonly edge: RoadEdge;
  readonly from: RoadNode;
  readonly to: RoadNode;
}

export interface EnvironmentalSpatialIndex {
  readonly buildings: readonly Building[];
  readonly buildingCenters: ReadonlyMap<string, Point>;
  readonly greenParcels: readonly Parcel[];
  readonly roads: readonly IndexedRoad[];
}

function pointToPolygonDistance(
  point: Point,
  polygon: readonly Point[],
): number {
  if (polygon.length < 3) return Number.POSITIVE_INFINITY;
  if (pointInPolygon(point, polygon)) return 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    nearest = Math.min(
      nearest,
      projectPointToSegment(
        point,
        polygon[index],
        polygon[(index + 1) % polygon.length],
      ).distance,
    );
  }
  return nearest;
}

export function buildEnvironmentalSpatialIndex(
  world: World,
): EnvironmentalSpatialIndex {
  const greenParcelIds = new Set(
    world.urban.zoning
      .filter((zoning) => zoning.zone === 'green')
      .map((zoning) => zoning.parcelId),
  );
  const nodesById = new Map(
    world.roads.nodes.map((node) => [node.id, node]),
  );
  const roads: IndexedRoad[] = [];
  for (const edge of [...world.roads.edges].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (from && to) roads.push({ edge, from, to });
  }
  const buildings = [...world.urban.buildings].sort((first, second) =>
    first.id.localeCompare(second.id),
  );
  return {
    buildings,
    buildingCenters: new Map(
      buildings.map((building) => [
        building.id,
        polygonCentroid(building.footprint),
      ]),
    ),
    greenParcels: world.urban.parcels
      .filter((parcel) => greenParcelIds.has(parcel.id))
      .sort((first, second) => first.id.localeCompare(second.id)),
    roads,
  };
}

function calculateGreenAccess(
  point: Point,
  index: EnvironmentalSpatialIndex,
  config: WellbeingConfig,
): number {
  let strongestContribution = 0;
  let totalContribution = 0;
  for (const parcel of index.greenParcels) {
    const distance = pointToPolygonDistance(point, parcel.polygon);
    if (distance >= config.exposure.greenSearchRadius) continue;
    const proximity = clampUnit(
      1 - distance / config.exposure.greenSearchRadius,
    );
    const substantialArea = clampUnit(
      parcel.area / config.exposure.greenAreaReference,
    );
    const contribution = proximity * proximity * substantialArea;
    strongestContribution = Math.max(strongestContribution, contribution);
    totalContribution += contribution;
  }
  const surroundingContribution = Math.max(
    0,
    totalContribution - strongestContribution,
  );
  return clampUnit(
    strongestContribution *
      config.exposure.greenStrongestContributionWeight +
      Math.min(1, surroundingContribution) *
        config.exposure.greenSurroundingContributionWeight,
  );
}

function calculateLocalDensity(
  point: Point,
  index: EnvironmentalSpatialIndex,
  config: WellbeingConfig,
): number {
  let weightedFloorArea = 0;
  for (const building of index.buildings) {
    const center = index.buildingCenters.get(building.id);
    if (!center) continue;
    const distance = pointDistance(point, center);
    if (distance >= config.exposure.densitySearchRadius) continue;
    const proximity = 1 - distance / config.exposure.densitySearchRadius;
    weightedFloorArea +=
      Math.max(0, building.grossFloorArea) * proximity * proximity;
  }
  const reference = config.exposure.densityFloorAreaReference;
  return clampUnit(
    weightedFloorArea <= 0
      ? 0
      : weightedFloorArea / (weightedFloorArea + reference),
  );
}

function calculateRoadNoiseProxy(
  point: Point,
  index: EnvironmentalSpatialIndex,
  config: WellbeingConfig,
): number {
  let weightedRoadExposure = 0;
  for (const road of index.roads) {
    const distance = projectPointToSegment(
      point,
      road.from.position,
      road.to.position,
    ).distance;
    if (distance >= config.exposure.roadNoiseSearchRadius) continue;
    const proximity = 1 - distance / config.exposure.roadNoiseSearchRadius;
    const roadWeight =
      road.edge.type === 'arterial'
        ? config.exposure.arterialNoiseWeight
        : config.exposure.secondaryNoiseWeight;
    const lengthFactor = clampUnit(
      road.edge.length / config.exposure.roadLengthReference,
    );
    weightedRoadExposure +=
      roadWeight *
      proximity *
      proximity *
      (config.exposure.roadBaseLengthWeight +
        lengthFactor * config.exposure.roadScaledLengthWeight);
  }
  return clampUnit(
    weightedRoadExposure /
      (weightedRoadExposure + config.exposure.roadNoiseSaturation),
  );
}

export function getDensityPressure(
  density: number,
  config: WellbeingConfig = WELLBEING_CONFIG,
): number {
  const threshold = config.exposure.densityComfortThreshold;
  return clampUnit((density - threshold) / Math.max(1e-9, 1 - threshold));
}

export function calculateLocationExposure(
  buildingId: string,
  point: Point,
  index: EnvironmentalSpatialIndex,
  config: WellbeingConfig = WELLBEING_CONFIG,
): LocationExposure {
  const greenAccess = calculateGreenAccess(point, index, config);
  const localDensity = calculateLocalDensity(point, index, config);
  const roadNoiseProxy = calculateRoadNoiseProxy(point, index, config);
  const densityPressure = getDensityPressure(localDensity, config);
  const environmentalQuality = clampUnit(
    config.exposure.environmentalQualityBaseline +
      greenAccess * config.exposure.environmentalQualityGreenWeight -
      densityPressure * config.exposure.environmentalQualityDensityWeight -
      roadNoiseProxy * config.exposure.environmentalQualityRoadWeight,
  );
  return {
    buildingId,
    greenAccess,
    localDensity,
    roadNoiseProxy,
    environmentalQuality,
  };
}

function calculateHomeCrowding(
  householdSize: number,
  residentCount: number,
  residentCapacity: number,
  occupiedDwellings: number,
  dwellingCapacity: number,
  config: WellbeingConfig,
): number {
  const householdPressure = clampUnit(
    (householdSize - 1) /
      Math.max(1, config.exposure.householdSizeCrowdingReference - 1),
  );
  const residentOccupancy = clampUnit(
    residentCapacity <= 0 ? 0 : residentCount / residentCapacity,
  );
  const dwellingOccupancy = clampUnit(
    dwellingCapacity <= 0 ? 0 : occupiedDwellings / dwellingCapacity,
  );
  return clampUnit(
    householdPressure * config.exposure.householdCrowdingWeight +
      residentOccupancy * config.exposure.residentOccupancyWeight +
      dwellingOccupancy * config.exposure.dwellingOccupancyWeight,
  );
}

function missingLocationExposure(
  buildingId: string,
  config: WellbeingConfig,
): LocationExposure {
  return {
    buildingId,
    greenAccess: 0,
    localDensity: 0,
    roadNoiseProxy: 0,
    environmentalQuality:
      config.exposure.missingLocationEnvironmentalQuality,
  };
}

export function deriveEnvironmentalExposureSeed(
  world: World,
  population: PopulationState,
  config: WellbeingConfig = WELLBEING_CONFIG,
): string {
  return [
    world.metadata.generatorVersion,
    world.metadata.seed,
    population.populationVersion,
    population.populationSeed,
    `exposure/${config.wellbeingVersion}`,
  ].join(EXPOSURE_SEED_SEPARATOR);
}

export function generateEnvironmentalExposure(
  world: World,
  population: PopulationState,
  config: WellbeingConfig = WELLBEING_CONFIG,
): EnvironmentalExposureState {
  const spatialIndex = buildEnvironmentalSpatialIndex(world);
  const buildingExposures = spatialIndex.buildings.map((building) => {
    const center = spatialIndex.buildingCenters.get(building.id);
    return center
      ? calculateLocationExposure(building.id, center, spatialIndex, config)
      : missingLocationExposure(building.id, config);
  });
  const exposureByBuildingId = new Map(
    buildingExposures.map((exposure) => [exposure.buildingId, exposure]),
  );
  const householdsById = new Map(
    population.households.map((household) => [household.id, household]),
  );
  const occupancyByBuildingId = new Map(
    population.buildingOccupancy.map((occupancy) => [
      occupancy.buildingId,
      occupancy,
    ]),
  );
  const citizenProfiles: EnvironmentalExposureProfile[] = [];
  for (const citizen of [...population.citizens].sort((first, second) =>
    first.id.localeCompare(second.id),
  )) {
    const household = householdsById.get(citizen.householdId);
    const occupancy = occupancyByBuildingId.get(citizen.homeBuildingId);
    citizenProfiles.push({
      citizenId: citizen.id,
      home:
        exposureByBuildingId.get(citizen.homeBuildingId) ??
        missingLocationExposure(citizen.homeBuildingId, config),
      workplace: citizen.workBuildingId
        ? exposureByBuildingId.get(citizen.workBuildingId)
        : undefined,
      homeCrowding: calculateHomeCrowding(
        household?.householdSize ?? 1,
        occupancy?.residentCount ?? 0,
        occupancy?.residentCapacity ?? 0,
        occupancy?.occupiedDwellings ?? 0,
        occupancy?.dwellingCapacity ?? 0,
        config,
      ),
    });
  }
  return {
    exposureVersion: config.wellbeingVersion,
    exposureSeed: deriveEnvironmentalExposureSeed(world, population, config),
    buildingExposures,
    citizenProfiles,
  };
}
