import { describe, expect, it } from 'vitest';
import { findTrafficRoute } from './routing';
import { buildTrafficNetwork } from './trafficNetwork';
import { createCrossRoadWorld } from './trafficTestFixtures';

describe('findTrafficRoute', () => {
  it('returns the deterministic minimum-travel-time graph route', () => {
    const network = buildTrafficNetwork(createCrossRoadWorld());
    const route = findTrafficRoute(network, 'west', 'east');

    expect(route?.arcIds).toEqual([
      'edge-west-center:forward',
      'edge-center-east:forward',
    ]);
    expect(route?.totalLength).toBe(200);
    expect(route?.estimatedTravelTime).toBeCloseTo(200 / 60);
  });

  it('returns a valid empty route for a trivial trip', () => {
    const network = buildTrafficNetwork(createCrossRoadWorld());
    expect(findTrafficRoute(network, 'west', 'west')).toEqual({
      originNodeId: 'west',
      destinationNodeId: 'west',
      arcIds: [],
      totalLength: 0,
      estimatedTravelTime: 0,
    });
  });

  it('fails safely for disconnected or unknown destinations', () => {
    const network = buildTrafficNetwork(createCrossRoadWorld());
    expect(findTrafficRoute(network, 'west', 'isolated')).toBeUndefined();
    expect(findTrafficRoute(network, 'west', 'missing')).toBeUndefined();
  });
});
