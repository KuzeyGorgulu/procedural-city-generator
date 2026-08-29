import { describe, expect, it } from 'vitest';
import { TRAFFIC_CONFIG } from './config';
import { buildTrafficNetwork } from './trafficNetwork';
import { createCrossRoadWorld } from './trafficTestFixtures';

describe('buildTrafficNetwork', () => {
  it('adapts valid world roads into stable bidirectional traffic arcs', () => {
    const world = createCrossRoadWorld();
    const network = buildTrafficNetwork(world);

    expect(network.sourceRoadGraph).toBe(world.roads);
    expect(network.arcsById.size).toBe(world.roads.edges.length * 2);
    expect(network.arcsById.get('edge-west-center:forward')).toMatchObject({
      from: 'west',
      to: 'center',
      roadType: 'arterial',
      nominalSpeed: TRAFFIC_CONFIG.nominalSpeedByRoadType.arterial,
    });
    expect(network.arcsById.get('edge-west-center:reverse')).toMatchObject({
      from: 'center',
      to: 'west',
      direction: 'reverse',
    });
    expect(network.intersectionNodeIds.has('center')).toBe(true);
    expect(network.developedNodeIds).toEqual([
      'center',
      'east',
      'north',
      'south',
      'west',
    ]);
  });
});
