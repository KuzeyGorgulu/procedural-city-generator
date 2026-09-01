import type {
  Point,
  RoadGraph,
  RoadType,
  TerrainData,
  UrbanStructure,
  World,
} from '../world/types';
import type { PopulationState } from '../population/types';
import type {
  BuildingWellbeingSummary,
  WellbeingDimension,
} from '../wellbeing/types';
import type { Camera, ViewportSize } from './viewport';
import { drawTraffic, type TrafficRenderInput } from './trafficRenderer';
import {
  estimateCellElevationGradient,
  getHillshadeBrightness,
} from './terrainRelief';
import { screenToWorld, worldToScreen } from './viewport';

export type WorldViewMode =
  | 'wellbeing'
  | 'population'
  | 'jobs'
  | 'buildings'
  | 'zoning'
  | 'suitability'
  | 'parcels'
  | 'blocks'
  | 'elevation'
  | 'slope'
  | 'water'
  | 'roadGraph';

type TerrainViewMode = 'elevation' | 'slope' | 'water';

type Rgb = readonly [number, number, number];

const DEEP_WATER: Rgb = [9, 35, 66];
const SHALLOW_WATER: Rgb = [31, 116, 150];
const LOW_LAND: Rgb = [66, 124, 87];
const HIGH_LAND: Rgb = [185, 158, 111];
const PEAK: Rgb = [226, 231, 224];

const ZONE_COLORS = {
  residential: '#8fc7a3',
  commercial: '#e7b45f',
  industrial: '#a98fc4',
  'mixed-use': '#de8f75',
  civic: '#6db5d8',
  green: '#5fa76f',
} as const;

const BUILDING_COLORS = {
  residential: '#d7eadc',
  commercial: '#f5ce7b',
  industrial: '#c6add9',
  'mixed-use': '#efa38b',
  civic: '#8fd0eb',
} as const;

export interface WellbeingRenderInput {
  readonly dimension: WellbeingDimension;
  readonly byBuildingId: ReadonlyMap<string, BuildingWellbeingSummary>;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function mixColor(from: Rgb, to: Rgb, amount: number): Rgb {
  const blend = clamp01(amount);
  const red = Math.round(from[0] + (to[0] - from[0]) * blend);
  const green = Math.round(from[1] + (to[1] - from[1]) * blend);
  const blue = Math.round(from[2] + (to[2] - from[2]) * blend);
  return [red, green, blue];
}

function colorToCss(color: Rgb): string {
  return `rgb(${color[0]} ${color[1]} ${color[2]})`;
}

function applyBrightness(color: Rgb, brightness: number): Rgb {
  const shade = (channel: number) =>
    Math.round(Math.min(255, Math.max(0, channel * brightness)));
  return [shade(color[0]), shade(color[1]), shade(color[2])];
}

function getCellAverage(
  terrain: TerrainData,
  field: readonly number[],
  column: number,
  row: number,
): number {
  const topLeft = row * terrain.columns + column;
  const topRight = topLeft + 1;
  const bottomLeft = topLeft + terrain.columns;
  const bottomRight = bottomLeft + 1;
  return (
    (field[topLeft] + field[topRight] + field[bottomLeft] + field[bottomRight]) /
    4
  );
}

function elevationColor(terrain: TerrainData, elevation: number): Rgb {
  if (elevation <= terrain.seaLevel) {
    return mixColor(
      DEEP_WATER,
      SHALLOW_WATER,
      elevation / Math.max(terrain.seaLevel, Number.EPSILON),
    );
  }

  const landHeight =
    (elevation - terrain.seaLevel) / Math.max(1 - terrain.seaLevel, Number.EPSILON);
  if (landHeight < 0.7) {
    return mixColor(LOW_LAND, HIGH_LAND, landHeight / 0.7);
  }
  return mixColor(HIGH_LAND, PEAK, (landHeight - 0.7) / 0.3);
}

function slopeColor(slope: number): Rgb {
  if (slope < 0.5) {
    return mixColor([25, 42, 53], [224, 170, 77], slope / 0.5);
  }
  return mixColor([224, 170, 77], [222, 72, 72], (slope - 0.5) / 0.5);
}

function terrainColor(
  terrain: TerrainData,
  elevation: number,
  slope: number,
  mode: TerrainViewMode,
  hillshade: number,
): string {
  if (mode === 'slope') return colorToCss(slopeColor(slope));
  if (mode === 'water') {
    return elevation <= terrain.seaLevel ? 'rgb(25 91 128)' : 'rgb(117 134 103)';
  }
  return colorToCss(applyBrightness(elevationColor(terrain, elevation), hillshade));
}

function drawTerrain(
  context: CanvasRenderingContext2D,
  terrain: TerrainData,
  camera: Camera,
  viewport: ViewportSize,
  mode: TerrainViewMode,
): void {
  const visibleTopLeft = screenToWorld({ x: 0, y: 0 }, camera, viewport);
  const visibleBottomRight = screenToWorld(
    { x: viewport.width, y: viewport.height },
    camera,
    viewport,
  );
  const terrainRight = terrain.origin.x + terrain.width;
  const terrainBottom = terrain.origin.y + terrain.height;

  if (
    visibleBottomRight.x < terrain.origin.x ||
    visibleTopLeft.x > terrainRight ||
    visibleBottomRight.y < terrain.origin.y ||
    visibleTopLeft.y > terrainBottom
  ) {
    return;
  }

  const firstColumn = Math.max(
    0,
    Math.floor((visibleTopLeft.x - terrain.origin.x) / terrain.cellSize),
  );
  const lastColumn = Math.min(
    terrain.columns - 2,
    Math.floor((visibleBottomRight.x - terrain.origin.x) / terrain.cellSize),
  );
  const firstRow = Math.max(
    0,
    Math.floor((visibleTopLeft.y - terrain.origin.y) / terrain.cellSize),
  );
  const lastRow = Math.min(
    terrain.rows - 2,
    Math.floor((visibleBottomRight.y - terrain.origin.y) / terrain.cellSize),
  );
  const screenCellSize = terrain.cellSize * camera.zoom;

  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const elevation = getCellAverage(terrain, terrain.elevation, column, row);
      const slope = getCellAverage(terrain, terrain.slope, column, row);
      const topLeft = row * terrain.columns + column;
      const gradient = estimateCellElevationGradient(
        terrain.elevation[topLeft],
        terrain.elevation[topLeft + 1],
        terrain.elevation[topLeft + terrain.columns],
        terrain.elevation[topLeft + terrain.columns + 1],
      );
      const hillshade = getHillshadeBrightness(gradient);
      const screen = worldToScreen(
        {
          x: terrain.origin.x + column * terrain.cellSize,
          y: terrain.origin.y + row * terrain.cellSize,
        },
        camera,
        viewport,
      );

      context.fillStyle = terrainColor(
        terrain,
        elevation,
        slope,
        mode,
        hillshade,
      );
      context.fillRect(
        screen.x,
        screen.y,
        screenCellSize + 0.75,
        screenCellSize + 0.75,
      );
    }
  }
}

function tracePolygon(
  context: CanvasRenderingContext2D,
  polygon: readonly Point[],
  camera: Camera,
  viewport: ViewportSize,
): void {
  if (polygon.length < 3) return;
  const start = worldToScreen(polygon[0], camera, viewport);
  context.moveTo(start.x, start.y);
  for (const point of polygon.slice(1)) {
    const screen = worldToScreen(point, camera, viewport);
    context.lineTo(screen.x, screen.y);
  }
  context.closePath();
}

function drawUrbanStructure(
  context: CanvasRenderingContext2D,
  urban: UrbanStructure,
  camera: Camera,
  viewport: ViewportSize,
  showParcels: boolean,
): void {
  context.save();
  for (const block of urban.blocks) {
    context.beginPath();
    tracePolygon(context, block.polygon, camera, viewport);
    context.fillStyle = 'rgba(54, 203, 187, 0.18)';
    context.fill();
    context.strokeStyle = '#5ad7cb';
    context.lineWidth = showParcels ? 1.4 : 2;
    context.stroke();
  }

  if (showParcels) {
    for (const parcel of urban.parcels) {
      context.beginPath();
      tracePolygon(context, parcel.polygon, camera, viewport);
      context.fillStyle = 'rgba(238, 222, 178, 0.08)';
      context.fill();
      context.strokeStyle = 'rgba(247, 235, 202, 0.82)';
      context.lineWidth = 0.9;
      context.stroke();

      context.beginPath();
      for (const edgeIndex of parcel.frontageEdgeIndices) {
        const start = worldToScreen(parcel.polygon[edgeIndex], camera, viewport);
        const end = worldToScreen(
          parcel.polygon[(edgeIndex + 1) % parcel.polygon.length],
          camera,
          viewport,
        );
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
      }
      context.strokeStyle = '#8cf0d1';
      context.lineWidth = 1.8;
      context.stroke();
    }
  }
  context.restore();
}

function drawZoning(
  context: CanvasRenderingContext2D,
  urban: UrbanStructure,
  camera: Camera,
  viewport: ViewportSize,
  suitabilityMode: boolean,
  fillAlpha = 0.58,
): void {
  const parcelsById = new Map(urban.parcels.map((parcel) => [parcel.id, parcel]));
  context.save();
  for (const zoning of urban.zoning) {
    const parcel = parcelsById.get(zoning.parcelId);
    if (!parcel) continue;
    context.beginPath();
    tracePolygon(context, parcel.polygon, camera, viewport);
    if (suitabilityMode) {
      const score = clamp01(zoning.suitability.score);
      const red = Math.round(202 - score * 105);
      const green = Math.round(82 + score * 112);
      const blue = Math.round(76 + score * 42);
      context.fillStyle = zoning.suitability.developable
        ? `rgba(${red}, ${green}, ${blue}, ${fillAlpha})`
        : `rgba(214, 80, 82, ${fillAlpha})`;
    } else {
      context.globalAlpha = fillAlpha;
      context.fillStyle = ZONE_COLORS[zoning.zone];
    }
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = 'rgba(237, 242, 235, 0.66)';
    context.lineWidth = 0.8;
    context.stroke();
  }
  context.restore();
}

function drawBuildings(
  context: CanvasRenderingContext2D,
  urban: UrbanStructure,
  camera: Camera,
  viewport: ViewportSize,
): void {
  drawZoning(context, urban, camera, viewport, false, 0.2);
  context.save();
  for (const building of urban.buildings) {
    context.beginPath();
    tracePolygon(context, building.footprint, camera, viewport);
    context.fillStyle = BUILDING_COLORS[building.use];
    context.fill();
    context.strokeStyle = '#18212a';
    context.lineWidth = Math.min(2.2, 0.8 + building.floorCount * 0.12);
    context.stroke();
  }
  context.restore();
}

function drawPopulationLayer(
  context: CanvasRenderingContext2D,
  urban: UrbanStructure,
  population: PopulationState,
  camera: Camera,
  viewport: ViewportSize,
  mode: 'population' | 'jobs',
): void {
  drawZoning(context, urban, camera, viewport, false, 0.12);
  const occupancyByBuildingId = new Map(
    population.buildingOccupancy.map((entry) => [entry.buildingId, entry]),
  );
  context.save();
  for (const building of urban.buildings) {
    const occupancy = occupancyByBuildingId.get(building.id);
    context.beginPath();
    tracePolygon(context, building.footprint, camera, viewport);
    if (!occupancy) {
      context.fillStyle = 'rgba(85, 94, 108, 0.38)';
      context.fill();
      continue;
    }
    const capacity =
      mode === 'population'
        ? occupancy.dwellingCapacity
        : occupancy.jobCapacity;
    const ratio =
      mode === 'population'
        ? occupancy.housingOccupancyRatio
        : occupancy.employmentOccupancyRatio;
    if (capacity === 0) {
      context.fillStyle = 'rgba(72, 81, 94, 0.46)';
    } else if (mode === 'population') {
      context.fillStyle = colorToCss(
        mixColor([75, 126, 153], [239, 106, 162], (ratio - 0.7) / 0.25),
      );
    } else {
      context.fillStyle = colorToCss(
        mixColor([82, 105, 151], [247, 185, 76], ratio),
      );
    }
    context.fill();
    context.strokeStyle = capacity === 0 ? '#26313e' : '#ecf2f6';
    context.lineWidth =
      capacity === 0
        ? 0.7
        : 0.8 + Math.min(1.7, Math.log10(capacity + 1) * 0.45);
    context.stroke();
  }
  context.restore();
}

function wellbeingColor(
  score: number,
  dimension: WellbeingDimension,
): string {
  const favorable = dimension === 'calm' || dimension === 'happiness';
  const amount = favorable ? clamp01(score / 100) : clamp01(1 - score / 100);
  return colorToCss(mixColor([204, 74, 83], [74, 198, 148], amount));
}

function drawWellbeingLayer(
  context: CanvasRenderingContext2D,
  urban: UrbanStructure,
  wellbeing: WellbeingRenderInput,
  camera: Camera,
  viewport: ViewportSize,
): void {
  drawZoning(context, urban, camera, viewport, false, 0.1);
  context.save();
  for (const building of urban.buildings) {
    const summary = wellbeing.byBuildingId.get(building.id);
    context.beginPath();
    tracePolygon(context, building.footprint, camera, viewport);
    context.fillStyle = summary
      ? wellbeingColor(
          summary.averageScores[wellbeing.dimension],
          wellbeing.dimension,
        )
      : 'rgba(72, 81, 94, 0.42)';
    context.fill();
    context.strokeStyle = summary ? '#e8eef5' : '#26313e';
    context.lineWidth = summary ? 1 : 0.65;
    context.stroke();
  }
  context.restore();
}

function strokeRoadType(
  context: CanvasRenderingContext2D,
  graph: RoadGraph,
  camera: Camera,
  viewport: ViewportSize,
  type: RoadType,
  color: string,
  width: number,
): void {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  context.beginPath();
  for (const edge of graph.edges) {
    if (edge.type !== type) continue;
    const from = nodesById.get(edge.from);
    const to = nodesById.get(edge.to);
    if (!from || !to) continue;
    const start = worldToScreen(from.position, camera, viewport);
    const end = worldToScreen(to.position, camera, viewport);
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
  }
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.stroke();
}

function drawRoads(
  context: CanvasRenderingContext2D,
  graph: RoadGraph,
  camera: Camera,
  viewport: ViewportSize,
  showNodes: boolean,
): void {
  context.save();
  strokeRoadType(context, graph, camera, viewport, 'secondary', '#26303a', 4);
  strokeRoadType(context, graph, camera, viewport, 'secondary', '#e7dfd0', 2);
  strokeRoadType(context, graph, camera, viewport, 'arterial', '#303139', 6);
  strokeRoadType(context, graph, camera, viewport, 'arterial', '#f2c75c', 3.5);

  if (showNodes) {
    const degrees = new Map(graph.nodes.map((node) => [node.id, 0]));
    for (const edge of graph.edges) {
      degrees.set(edge.from, (degrees.get(edge.from) ?? 0) + 1);
      degrees.set(edge.to, (degrees.get(edge.to) ?? 0) + 1);
    }
    for (const node of graph.nodes) {
      const screen = worldToScreen(node.position, camera, viewport);
      const intersection = (degrees.get(node.id) ?? 0) >= 3;
      context.beginPath();
      context.arc(screen.x, screen.y, intersection ? 4 : 2.5, 0, Math.PI * 2);
      context.fillStyle = intersection ? '#ff6b6b' : '#62ded4';
      context.fill();
    }
  }
  context.restore();
}

function drawWorldBoundary(
  context: CanvasRenderingContext2D,
  world: World,
  camera: Camera,
  viewport: ViewportSize,
): void {
  const topLeft = worldToScreen(
    { x: world.bounds.x, y: world.bounds.y },
    camera,
    viewport,
  );
  const bottomRight = worldToScreen(
    {
      x: world.bounds.x + world.bounds.width,
      y: world.bounds.y + world.bounds.height,
    },
    camera,
    viewport,
  );

  context.save();
  context.strokeStyle = '#8291a7';
  context.lineWidth = 2;
  context.strokeRect(
    topLeft.x,
    topLeft.y,
    bottomRight.x - topLeft.x,
    bottomRight.y - topLeft.y,
  );
  context.restore();
}

/** Visualizes canonical terrain data without generating or mutating it. */
export function renderWorld(
  context: CanvasRenderingContext2D,
  world: World,
  camera: Camera,
  viewport: ViewportSize,
  devicePixelRatio: number,
  mode: WorldViewMode,
  traffic?: TrafficRenderInput,
  population?: PopulationState,
  wellbeing?: WellbeingRenderInput,
): void {
  context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  context.clearRect(0, 0, viewport.width, viewport.height);
  context.fillStyle = '#080e18';
  context.fillRect(0, 0, viewport.width, viewport.height);

  context.save();
  if (
    mode === 'roadGraph' ||
    mode === 'blocks' ||
    mode === 'parcels' ||
    mode === 'zoning' ||
    mode === 'buildings' ||
    mode === 'suitability' ||
    mode === 'wellbeing' ||
    mode === 'population' ||
    mode === 'jobs'
  ) {
    context.globalAlpha = mode === 'roadGraph' ? 0.58 : 0.72;
  }
  drawTerrain(
    context,
    world.terrain,
    camera,
    viewport,
    mode === 'slope' || mode === 'water' ? mode : 'elevation',
  );
  context.restore();
  if (mode === 'blocks' || mode === 'parcels') {
    drawUrbanStructure(
      context,
      world.urban,
      camera,
      viewport,
      mode === 'parcels',
    );
  } else if (mode === 'zoning') {
    drawZoning(context, world.urban, camera, viewport, false);
  } else if (mode === 'suitability') {
    drawZoning(context, world.urban, camera, viewport, true);
  } else if (mode === 'buildings') {
    drawBuildings(context, world.urban, camera, viewport);
  } else if (mode === 'wellbeing' && wellbeing) {
    drawWellbeingLayer(context, world.urban, wellbeing, camera, viewport);
  } else if ((mode === 'population' || mode === 'jobs') && population) {
    drawPopulationLayer(
      context,
      world.urban,
      population,
      camera,
      viewport,
      mode,
    );
  }
  drawRoads(context, world.roads, camera, viewport, mode === 'roadGraph');
  if (traffic) drawTraffic(context, traffic, camera, viewport);
  drawWorldBoundary(context, world, camera, viewport);
}
