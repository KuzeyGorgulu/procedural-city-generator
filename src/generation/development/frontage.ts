import { collinearSegmentOverlapLength } from '../../world/polygonGeometry';
import { pointDistance } from '../../world/roadGeometry';
import type {
  CityBlock,
  Parcel,
  RoadEdgeId,
  RoadGraph,
  RoadType,
} from '../../world/types';

export interface ParcelFrontage {
  readonly parcelEdgeIndex: number;
  readonly roadEdgeId: RoadEdgeId;
  readonly roadType: RoadType;
  readonly overlapLength: number;
  readonly parcelEdgeLength: number;
}

/** Resolves Phase 3 frontage segments back to their canonical road edges. */
export function getParcelFrontages(
  parcel: Parcel,
  block: CityBlock,
  roads: RoadGraph,
  epsilon = 1e-7,
): ParcelFrontage[] {
  const nodesById = new Map(roads.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(roads.edges.map((edge) => [edge.id, edge]));
  const frontages: ParcelFrontage[] = [];

  for (const parcelEdgeIndex of parcel.frontageEdgeIndices) {
    const parcelStart = parcel.polygon[parcelEdgeIndex];
    const parcelEnd = parcel.polygon[(parcelEdgeIndex + 1) % parcel.polygon.length];
    if (!parcelStart || !parcelEnd) continue;
    const parcelEdgeLength = pointDistance(parcelStart, parcelEnd);
    if (!Number.isFinite(parcelEdgeLength) || parcelEdgeLength <= epsilon) continue;

    for (const roadEdgeId of block.boundaryRoadEdgeIds) {
      const roadEdge = edgesById.get(roadEdgeId);
      const roadStart = roadEdge && nodesById.get(roadEdge.from);
      const roadEnd = roadEdge && nodesById.get(roadEdge.to);
      if (!roadEdge || !roadStart || !roadEnd) continue;
      const overlapLength = collinearSegmentOverlapLength(
        parcelStart,
        parcelEnd,
        roadStart.position,
        roadEnd.position,
        epsilon,
      );
      if (overlapLength <= epsilon) continue;
      frontages.push({
        parcelEdgeIndex,
        roadEdgeId,
        roadType: roadEdge.type,
        overlapLength,
        parcelEdgeLength,
      });
    }
  }

  return frontages.sort(
    (first, second) =>
      second.overlapLength - first.overlapLength ||
      first.parcelEdgeIndex - second.parcelEdgeIndex ||
      first.roadEdgeId.localeCompare(second.roadEdgeId),
  );
}
