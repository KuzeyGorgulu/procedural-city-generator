import type { SeededRng } from '../core/rng';
import type { BuildingUse } from '../world/types';
import {
  getTrafficTravelTimes,
  type PopulationAccessIndex,
} from './accessibility';
import type { PopulationConfig } from './config';
import { POPULATION_CONFIG } from './config';
import type {
  BuildingOccupancy,
  Citizen,
  Workplace,
  WorkplaceUse,
} from './types';

export interface EmploymentAssignmentResult {
  readonly citizens: readonly Citizen[];
  readonly workplaces: readonly Workplace[];
  readonly buildingOccupancy: readonly BuildingOccupancy[];
}

interface MutableWorkplace {
  readonly id: string;
  readonly buildingId: string;
  readonly use: WorkplaceUse;
  readonly jobCapacity: number;
  readonly workerIds: string[];
  readonly accessNodeId?: string;
  readonly roadComponentId?: string;
}

function isWorkplaceUse(use: BuildingUse): use is WorkplaceUse {
  return (
    use === 'commercial' ||
    use === 'industrial' ||
    use === 'mixed-use' ||
    use === 'civic'
  );
}

function createMutableWorkplaces(
  occupancy: readonly BuildingOccupancy[],
): MutableWorkplace[] {
  return occupancy
    .filter(
      (entry) => entry.jobCapacity > 0 && isWorkplaceUse(entry.buildingUse),
    )
    .map((entry) => ({
      id: `workplace-${entry.buildingId}`,
      buildingId: entry.buildingId,
      use: entry.buildingUse as WorkplaceUse,
      jobCapacity: entry.jobCapacity,
      workerIds: [],
      accessNodeId: entry.accessNodeId,
      roadComponentId: entry.roadComponentId,
    }))
    .sort((first, second) => first.id.localeCompare(second.id));
}

function buildWorkplacePreferences(
  citizens: readonly Citizen[],
  occupancy: readonly BuildingOccupancy[],
  workplaces: readonly MutableWorkplace[],
  accessIndex: PopulationAccessIndex,
  rng: SeededRng,
  config: PopulationConfig,
): ReadonlyMap<string, readonly string[]> {
  const occupancyByBuildingId = new Map(
    occupancy.map((entry) => [entry.buildingId, entry]),
  );
  const homeBuildingIds = [
    ...new Set(
      citizens
        .filter((citizen) => citizen.workforceEligible)
        .map((citizen) => citizen.homeBuildingId),
    ),
  ].sort();
  const preferences = new Map<string, readonly string[]>();
  const [minimumJitter, maximumJitter] = config.employmentCostJitterRange;

  for (const homeBuildingId of homeBuildingIds) {
    const home = occupancyByBuildingId.get(homeBuildingId);
    if (!home?.accessNodeId || !home.roadComponentId) {
      preferences.set(homeBuildingId, []);
      continue;
    }
    const travelTimes = getTrafficTravelTimes(
      accessIndex.trafficNetwork,
      home.accessNodeId,
    );
    const ranked = workplaces
      .filter(
        (workplace) =>
          workplace.accessNodeId !== undefined &&
          workplace.roadComponentId === home.roadComponentId,
      )
      .map((workplace) => {
        const travelTime = travelTimes.get(workplace.accessNodeId!) ?? Infinity;
        const jitter = rng
          .fork(`home/${homeBuildingId}/workplace/${workplace.id}`)
          .float(minimumJitter, maximumJitter);
        return { id: workplace.id, cost: travelTime * jitter };
      })
      .filter((candidate) => Number.isFinite(candidate.cost))
      .sort(
        (first, second) =>
          first.cost - second.cost || first.id.localeCompare(second.id),
      )
      .map((candidate) => candidate.id);
    preferences.set(homeBuildingId, ranked);
  }
  return preferences;
}

export function assignEmployment(
  citizens: readonly Citizen[],
  occupancy: readonly BuildingOccupancy[],
  accessIndex: PopulationAccessIndex,
  rng: SeededRng,
  config: PopulationConfig = POPULATION_CONFIG,
): EmploymentAssignmentResult {
  const mutableWorkplaces = createMutableWorkplaces(occupancy);
  const workplaceById = new Map(
    mutableWorkplaces.map((workplace) => [workplace.id, workplace]),
  );
  const preferences = buildWorkplacePreferences(
    citizens,
    occupancy,
    mutableWorkplaces,
    accessIndex,
    rng.fork('preferences'),
    config,
  );
  const priorityByCitizenId = new Map(
    citizens.map((citizen) => [
      citizen.id,
      rng.fork(`citizen/${citizen.id}/assignment-priority`).next(),
    ]),
  );
  const assignmentOrder = [...citizens].sort(
    (first, second) =>
      (priorityByCitizenId.get(first.id) ?? 0) -
        (priorityByCitizenId.get(second.id) ?? 0) ||
      first.id.localeCompare(second.id),
  );
  const assignedByCitizenId = new Map<string, Citizen>();

  for (const citizen of assignmentOrder) {
    if (!citizen.workforceEligible) {
      assignedByCitizenId.set(citizen.id, citizen);
      continue;
    }
    const citizenRng = rng.fork(`citizen/${citizen.id}`);
    if (
      citizenRng.fork('participation').next() >=
      config.employmentParticipationRate
    ) {
      assignedByCitizenId.set(citizen.id, citizen);
      continue;
    }
    const rankedIds = preferences.get(citizen.homeBuildingId) ?? [];
    const nearbyAvailable = rankedIds
      .slice(0, config.employmentCandidateLimit)
      .filter((workplaceId) => {
        const workplace = workplaceById.get(workplaceId);
        return workplace && workplace.workerIds.length < workplace.jobCapacity;
      });
    const fallbackId =
      nearbyAvailable.length === 0
        ? rankedIds.find((workplaceId) => {
            const workplace = workplaceById.get(workplaceId);
            return workplace && workplace.workerIds.length < workplace.jobCapacity;
          })
        : undefined;
    const workplaceId =
      nearbyAvailable.length > 0
        ? nearbyAvailable[
            citizenRng.fork('workplace-choice').int(0, nearbyAvailable.length)
          ]
        : fallbackId;
    const workplace = workplaceId
      ? workplaceById.get(workplaceId)
      : undefined;
    if (!workplace) {
      assignedByCitizenId.set(citizen.id, {
        ...citizen,
        laborForceParticipant: true,
        employmentStatus: 'unemployed',
      });
      continue;
    }
    workplace.workerIds.push(citizen.id);
    assignedByCitizenId.set(citizen.id, {
      ...citizen,
      laborForceParticipant: true,
      employmentStatus: 'employed',
      workplaceId: workplace.id,
      workBuildingId: workplace.buildingId,
    });
  }

  const workplaces: Workplace[] = mutableWorkplaces.map((workplace) => ({
    id: workplace.id,
    buildingId: workplace.buildingId,
    use: workplace.use,
    jobCapacity: workplace.jobCapacity,
    filledJobs: workplace.workerIds.length,
    workerIds: [...workplace.workerIds].sort(),
    accessNodeId: workplace.accessNodeId,
    roadComponentId: workplace.roadComponentId,
  }));
  const filledJobsByBuildingId = new Map(
    workplaces.map((workplace) => [workplace.buildingId, workplace.filledJobs]),
  );

  return {
    citizens: citizens.map(
      (citizen) => assignedByCitizenId.get(citizen.id) ?? citizen,
    ),
    workplaces,
    buildingOccupancy: occupancy.map((entry) => {
      const filledJobs = filledJobsByBuildingId.get(entry.buildingId) ?? 0;
      return {
        ...entry,
        filledJobs,
        employmentOccupancyRatio:
          entry.jobCapacity === 0 ? 0 : filledJobs / entry.jobCapacity,
      };
    }),
  };
}
