const RANDOM_WORDS = 3;

/** UI-only entropy. Procedural generation never depends on this function. */
export function createRandomSeed(): string {
  const values = new Uint32Array(RANDOM_WORDS);
  globalThis.crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(36).padStart(7, '0')).join('-');
}

export function readSeedFromUrl(fallback: string): string {
  return new URLSearchParams(window.location.search).get('seed') ?? fallback;
}

export function writeSeedToUrl(seed: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('seed', seed);
  window.history.replaceState(null, '', url);
}
