/**
 * Deterministic PRNG seeded by a single uint32. Encoder and decoder derive the
 * exact same degree + neighbor-index sequence from a symbol's seed by running
 * this generator identically on both sides — the seed is the only thing that
 * needs to travel over the wire per symbol.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}
