import { pickIndices } from './indices'
import { mulberry32, randomSeed } from './rng'
import { robustSolitonCdf, sampleDegree } from './soliton'
import type { FountainSymbol } from './types'

/** Produces an endless stream of LT-coded symbols over a fixed set of equal-size source blocks. */
export class FountainEncoder {
  private readonly cdf: Float64Array
  private readonly blocks: Uint8Array[]
  readonly k: number
  readonly blockSize: number

  constructor(blocks: Uint8Array[]) {
    this.blocks = blocks
    this.k = blocks.length
    this.blockSize = blocks[0]?.length ?? 0
    this.cdf = robustSolitonCdf(this.k)
  }

  nextSymbol(seed: number = randomSeed()): FountainSymbol {
    const rand = mulberry32(seed)
    const degree = sampleDegree(rand, this.cdf)
    const indices = pickIndices(rand, this.k, degree)

    const data = new Uint8Array(this.blockSize)
    for (const idx of indices) {
      const block = this.blocks[idx]
      for (let i = 0; i < data.length; i++) data[i] ^= block[i]
    }

    return { seed, degree: indices.length, data }
  }
}
