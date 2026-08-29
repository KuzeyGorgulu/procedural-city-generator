import type {
  Point,
  RoadEdgeId,
  RoadGraph,
  RoadNode,
  RoadNodeId,
  RoadType,
} from '../../world/types';

export type TrafficArcId = string;
export type VehicleId = string;
export type TrafficArcDirection = 'forward' | 'reverse';

export interface TrafficArc {
  readonly id: TrafficArcId;
  readonly sourceEdgeId: RoadEdgeId;
  readonly from: RoadNodeId;
  readonly to: RoadNodeId;
  readonly direction: TrafficArcDirection;
  readonly roadType: RoadType;
  readonly length: number;
  readonly nominalSpeed: number;
  readonly travelTime: number;
}

/** Derived routing adapter. Geometry remains owned by sourceRoadGraph. */
export interface TrafficNetwork {
  readonly sourceRoadGraph: RoadGraph;
  readonly nodesById: ReadonlyMap<RoadNodeId, RoadNode>;
  readonly arcsById: ReadonlyMap<TrafficArcId, TrafficArc>;
  readonly outgoingArcsByNodeId: ReadonlyMap<
    RoadNodeId,
    readonly TrafficArc[]
  >;
  readonly developedNodeIds: readonly RoadNodeId[];
  readonly intersectionNodeIds: ReadonlySet<RoadNodeId>;
  readonly maxNominalSpeed: number;
}

export interface TrafficRoute {
  readonly originNodeId: RoadNodeId;
  readonly destinationNodeId: RoadNodeId;
  readonly arcIds: readonly TrafficArcId[];
  readonly totalLength: number;
  readonly estimatedTravelTime: number;
}

export type VehicleMovementState = 'moving' | 'queued';

export interface Vehicle {
  readonly id: VehicleId;
  readonly originNodeId: RoadNodeId;
  readonly destinationNodeId: RoadNodeId;
  readonly route: TrafficRoute;
  readonly routeArcIndex: number;
  readonly progressOnArc: number;
  readonly currentSpeed: number;
  readonly desiredSpeed: number;
  readonly movementState: VehicleMovementState;
  readonly elapsedTripSeconds: number;
  readonly distanceTravelled: number;
}

export interface TrafficSimulationState {
  readonly simulationVersion: string;
  readonly simulationSeed: string;
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly vehicles: readonly Vehicle[];
  readonly targetVehicleCount: number;
  readonly nextVehicleSerial: number;
  readonly completedTrips: number;
  readonly totalCompletedTravelTime: number;
}

export interface SegmentOccupancy {
  readonly arcId: TrafficArcId;
  readonly sourceEdgeId: RoadEdgeId;
  readonly vehicleCount: number;
}

export interface TrafficMetrics {
  readonly activeVehicleCount: number;
  readonly completedTrips: number;
  readonly averageCurrentSpeed: number;
  readonly averageTripProgress: number;
  readonly averageCompletedTravelTime: number;
  readonly segmentOccupancy: readonly SegmentOccupancy[];
}

export interface VehiclePose {
  readonly position: Point;
  readonly angle: number;
  readonly arcId: TrafficArcId;
}
