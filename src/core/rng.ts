const UINT32_RANGE = 0x1_0000_0000;
const STREAM_SEPARATOR = '\u001f';

function hashString(value: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

/** A deterministic, stateful PRNG with state-independent named substreams. */
export class SeededRng {
  readonly #streamKey: string;
  #state: number;

  constructor(streamKey: string) {
    this.#streamKey = streamKey;
    this.#state = hashString(streamKey);
  }

  /** Returns a value in the half-open interval [0, 1). */
  next(): number {
    let value = (this.#state += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  }

  float(min: number, max: number): number {
    if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) {
      throw new RangeError('Expected finite bounds with max greater than or equal to min.');
    }

    return min + this.next() * (max - min);
  }

  int(minInclusive: number, maxExclusive: number): number {
    if (
      !Number.isInteger(minInclusive) ||
      !Number.isInteger(maxExclusive) ||
      maxExclusive <= minInclusive
    ) {
      throw new RangeError('Expected integer bounds with maxExclusive greater than minInclusive.');
    }

    return Math.floor(this.float(minInclusive, maxExclusive));
  }

  /**
   * Creates a substream from the immutable stream key, not the current state.
   * Consuming one stream therefore never shifts another stream's sequence.
   */
  fork(label: string): SeededRng {
    if (label.length === 0) {
      throw new Error('RNG stream labels must not be empty.');
    }

    return new SeededRng(`${this.#streamKey}${STREAM_SEPARATOR}${label}`);
  }
}

export function createSeededRng(seed: string): SeededRng {
  return new SeededRng(seed);
}
