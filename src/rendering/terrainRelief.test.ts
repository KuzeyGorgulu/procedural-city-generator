import { describe, expect, it } from 'vitest';
import {
  estimateCellElevationGradient,
  getHillshadeBrightness,
} from './terrainRelief';

describe('terrain relief helpers', () => {
  it('derives a stable two-axis gradient from cell corners', () => {
    const gradient = estimateCellElevationGradient(0.2, 0.4, 0.3, 0.5);
    expect(gradient.x).toBeCloseTo(0.2);
    expect(gradient.y).toBeCloseTo(0.1);
  });

  it('lights slopes facing the fixed light more strongly than opposing slopes', () => {
    const facing = getHillshadeBrightness({ x: 0.04, y: 0.04 });
    const flat = getHillshadeBrightness({ x: 0, y: 0 });
    const opposing = getHillshadeBrightness({ x: -0.04, y: -0.04 });

    expect(facing).toBeGreaterThan(flat);
    expect(flat).toBeGreaterThan(opposing);
    expect(getHillshadeBrightness({ x: 0.04, y: 0.04 })).toBe(facing);
  });
});
