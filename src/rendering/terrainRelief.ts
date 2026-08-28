export interface TerrainReliefConfig {
  readonly verticalExaggeration: number;
  readonly ambientLight: number;
  readonly diffuseLight: number;
  readonly lightDirection: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

export const TERRAIN_RELIEF_CONFIG: TerrainReliefConfig = {
  verticalExaggeration: 18,
  ambientLight: 0.6,
  diffuseLight: 0.58,
  lightDirection: { x: -0.55, y: -0.65, z: 0.55 },
};

export interface ElevationGradient {
  readonly x: number;
  readonly y: number;
}

export function estimateCellElevationGradient(
  topLeft: number,
  topRight: number,
  bottomLeft: number,
  bottomRight: number,
): ElevationGradient {
  return {
    x: ((topRight - topLeft) + (bottomRight - bottomLeft)) / 2,
    y: ((bottomLeft - topLeft) + (bottomRight - topRight)) / 2,
  };
}

/** Returns a deterministic brightness multiplier for a fixed directional light. */
export function getHillshadeBrightness(
  gradient: ElevationGradient,
  config: TerrainReliefConfig = TERRAIN_RELIEF_CONFIG,
): number {
  const normal = {
    x: -gradient.x * config.verticalExaggeration,
    y: -gradient.y * config.verticalExaggeration,
    z: 1,
  };
  const normalLength = Math.hypot(normal.x, normal.y, normal.z);
  const lightLength = Math.hypot(
    config.lightDirection.x,
    config.lightDirection.y,
    config.lightDirection.z,
  );
  const illumination = Math.max(
    0,
    (normal.x * config.lightDirection.x +
      normal.y * config.lightDirection.y +
      normal.z * config.lightDirection.z) /
      (normalLength * lightLength),
  );
  return config.ambientLight + config.diffuseLight * illumination;
}
