import { useCallback, useState } from 'react';
import { GENERATOR_VERSION } from '../core/generatorVersion';
import { DEFAULT_SEED, normalizeSeed } from '../core/seed';
import { generateWorld } from '../generation/generateWorld';
import { createRandomSeed, readSeedFromUrl, writeSeedToUrl } from '../utils/browserSeed';

export function useWorldGeneration() {
  const [initialSeed] = useState(() => normalizeSeed(readSeedFromUrl(DEFAULT_SEED)));
  const [seedInput, setSeedInput] = useState(initialSeed);
  const [world, setWorld] = useState(() =>
    generateWorld({ seed: initialSeed, generatorVersion: GENERATOR_VERSION }),
  );

  const generate = useCallback((requestedSeed: string) => {
    const seed = normalizeSeed(requestedSeed);
    setSeedInput(seed);
    setWorld(generateWorld({ seed, generatorVersion: GENERATOR_VERSION }));
    writeSeedToUrl(seed);
  }, []);

  const randomize = useCallback(() => {
    generate(createRandomSeed());
  }, [generate]);

  return {
    seedInput,
    setSeedInput,
    world,
    generate,
    randomize,
  };
}
