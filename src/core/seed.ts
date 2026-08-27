export const DEFAULT_SEED = 'phase-zero';

export function normalizeSeed(seed: string): string {
  const normalized = seed.trim();
  return normalized.length > 0 ? normalized : DEFAULT_SEED;
}
