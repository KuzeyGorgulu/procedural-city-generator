import type { TrafficRoute } from '../simulation/traffic/types';
import type {
  BuildingId,
  RoadNodeId,
} from '../world/types';
import type { CitizenId, WorkplaceId } from '../population/types';

export type ActivityType =
  | 'home'
  | 'commute-to-work'
  | 'work'
  | 'commute-home';
export type CommutePurpose = 'commute-to-work' | 'commute-home';
export type CommuteTripId = string;
export type MobilityRoutingStatus = 'routable' | 'unreachable';
export type UnreachableCommuteReason =
  | 'missing-home-building'
  | 'missing-work-building'
  | 'missing-origin-access'
  | 'missing-destination-access'
  | 'disconnected-route';

export interface DailyActivity {
  readonly type: ActivityType;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly buildingId?: BuildingId;
  readonly tripId?: CommuteTripId;
}

export interface CitizenDailyPlan {
  readonly citizenId: CitizenId;
  readonly activities: readonly DailyActivity[];
}

interface CommuteTripBase {
  readonly id: CommuteTripId;
  readonly citizenId: CitizenId;
  readonly workplaceId?: WorkplaceId;
  readonly purpose: CommutePurpose;
  readonly plannedDepartureMinute: number;
}

export interface RoutableCommuteTrip extends CommuteTripBase {
  readonly routingStatus: 'routable';
  readonly originBuildingId: BuildingId;
  readonly destinationBuildingId: BuildingId;
  readonly originAccessNodeId: RoadNodeId;
  readonly destinationAccessNodeId: RoadNodeId;
  readonly route: TrafficRoute;
  readonly estimatedNetworkDistance: number;
  readonly estimatedNetworkTravelTime: number;
}

export interface UnreachableCommuteTrip extends CommuteTripBase {
  readonly routingStatus: 'unreachable';
  readonly originBuildingId?: BuildingId;
  readonly destinationBuildingId?: BuildingId;
  readonly originAccessNodeId?: RoadNodeId;
  readonly destinationAccessNodeId?: RoadNodeId;
  readonly unreachableReason: UnreachableCommuteReason;
}

export type CommuteTrip = RoutableCommuteTrip | UnreachableCommuteTrip;

export interface MobilityWaveMetrics {
  readonly plannedTrips: number;
  readonly routableTrips: number;
  readonly unreachableTrips: number;
  readonly averageEstimatedDistance: number;
  readonly averageEstimatedTravelTime: number;
}

export interface MobilityMetrics {
  readonly employedCommuters: number;
  readonly plannedCommuteTrips: number;
  readonly routableTrips: number;
  readonly unreachableTrips: number;
  readonly averageEstimatedCommuteDistance: number;
  readonly averageEstimatedCommuteTime: number;
  readonly morning: MobilityWaveMetrics;
  readonly evening: MobilityWaveMetrics;
}

export interface MobilityState {
  readonly mobilityVersion: string;
  readonly mobilitySeed: string;
  readonly dailyPlans: readonly CitizenDailyPlan[];
  readonly commuteTrips: readonly CommuteTrip[];
  readonly metrics: MobilityMetrics;
}

