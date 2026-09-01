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
export type TrafficDemandMode =
  | 'synthetic'
  | 'morning-commute'
  | 'evening-commute';
export type VehicleSource = 'synthetic' | 'population';
export type PopulationTripPurpose = 'commute-to-work' | 'commute-home';

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

export interface VehicleProvenance {
  readonly source: VehicleSource;
  readonly citizenId?: string;
  readonly tripId?: string;
  readonly tripPurpose?: PopulationTripPurpose;
  readonly originBuildingId?: string;
  readonly destinationBuildingId?: string;
}

export interface Vehicle {
  readonly id: VehicleId;
  readonly source: VehicleSource;
  readonly citizenId?: string;
  readonly tripId?: string;
  readonly tripPurpose?: PopulationTripPurpose;
  readonly originBuildingId?: string;
  readonly destinationBuildingId?: string;
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

export interface TrafficDemandTrip {
  readonly id: string;
  readonly citizenId: string;
  readonly purpose: PopulationTripPurpose;
  readonly originBuildingId: string;
  readonly destinationBuildingId: string;
  readonly plannedDepartureMinute: number;
  readonly route: TrafficRoute;
}

export interface UnreachableTrafficDemand {
  readonly id: string;
  readonly citizenId: string;
  readonly purpose: PopulationTripPurpose;
  readonly plannedDepartureMinute: number;
}

/** Plain immutable adapter from mobility plans into the traffic kernel. */
export interface TrafficDemandCatalog {
  readonly mobilityVersion: string;
  readonly employedCommuters: number;
  readonly demandSecondsPerPlannedMinute: number;
  readonly trips: readonly TrafficDemandTrip[];
  readonly unreachableTrips: readonly UnreachableTrafficDemand[];
}

export interface TrafficDemandIndex {
  readonly catalog: TrafficDemandCatalog;
  readonly tripsById: ReadonlyMap<string, TrafficDemandTrip>;
  readonly morningTrips: readonly TrafficDemandTrip[];
  readonly eveningTrips: readonly TrafficDemandTrip[];
  readonly morningUnreachableTrips: readonly UnreachableTrafficDemand[];
  readonly eveningUnreachableTrips: readonly UnreachableTrafficDemand[];
  readonly morningRuntimeTripIds: readonly string[];
  readonly eveningRuntimeTripIds: readonly string[];
  readonly morningRuntimeIndexByTripId: ReadonlyMap<string, number>;
  readonly eveningRuntimeIndexByTripId: ReadonlyMap<string, number>;
  readonly morningStartMinute: number;
  readonly eveningStartMinute: number;
}

export type TripRuntimeStatus =
  | 'scheduled'
  | 'queued'
  | 'active'
  | 'completed'
  | 'unreachable';

export interface TripRuntimeState {
  readonly tripId: string;
  readonly status: TripRuntimeStatus;
  readonly actualDepartureTime?: number;
  readonly actualArrivalTime?: number;
  readonly travelTime?: number;
  readonly waitingTime?: number;
}

export interface TrafficSimulationState {
  readonly simulationVersion: string;
  readonly simulationSeed: string;
  readonly demandMode: TrafficDemandMode;
  readonly tick: number;
  readonly elapsedSeconds: number;
  readonly vehicles: readonly Vehicle[];
  readonly targetVehicleCount: number;
  readonly nextVehicleSerial: number;
  readonly completedTrips: number;
  readonly totalCompletedTravelTime: number;
  readonly tripRuntime: readonly TripRuntimeState[];
  readonly nextDemandTripIndex: number;
  readonly queuedTripIds: readonly string[];
  readonly nextQueuedTripIndex: number;
  readonly maximumQueueSize: number;
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

export interface MobilityRuntimeMetrics {
  readonly employedCommuters: number;
  readonly plannedCommuteTrips: number;
  readonly eligibleTrips: number;
  readonly queuedTrips: number;
  readonly activeTrips: number;
  readonly completedTrips: number;
  readonly unreachableTrips: number;
  readonly averageEstimatedDistance: number;
  readonly averageEstimatedTravelTime: number;
  readonly averageCompletedTravelTime: number;
  readonly averageQueueWaitTime: number;
  readonly maximumQueueSize: number;
}

export interface VehiclePose {
  readonly position: Point;
  readonly angle: number;
  readonly arcId: TrafficArcId;
}
