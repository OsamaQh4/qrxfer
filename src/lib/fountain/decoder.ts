import { pickIndices } from './indices'
import { mulberry32 } from './rng'
import { robustSolitonCdf, sampleDegree } from './soliton'

interface PendingSymbol {
  id: number
  indices: Set<number>
  data: Uint8Array
}

function xorInto(dst: Uint8Array, src: Uint8Array): void {
  for (let i = 0; i < dst.length; i++) dst[i] ^= src[i]
}

/**
 * Belief-propagation ("peeling") LT decoder. Maintains, for every pending
 * symbol, the set of source-block indices it still covers plus an
 * index -> pending-symbol adjacency map so resolving one block is O(degree)
 * amortized rather than a full scan of every pending symbol.
 */
export class FountainDecoder {
  private readonly cdf: Float64Array
  private readonly blocks: (Uint8Array | undefined)[]
  private readonly byIndex: Array<Set<number>>
  private readonly pendingById = new Map<number, PendingSymbol>()
  private readonly seenSeeds = new Set<number>()
  private nextId = 0
  private resolvedCount = 0

  readonly k: number
  readonly blockSize: number
  duplicateFrames = 0
  framesAccepted = 0

  constructor(k: number, blockSize: number) {
    this.k = k
    this.blockSize = blockSize
    this.cdf = robustSolitonCdf(k)
    this.blocks = new Array(k).fill(undefined)
    this.byIndex = Array.from({ length: k }, () => new Set<number>())
  }

  get isComplete(): boolean {
    return this.resolvedCount === this.k
  }

  get progress(): number {
    return this.k === 0 ? 1 : this.resolvedCount / this.k
  }

  /** Feeds one received symbol in. Returns false if it was a duplicate (already seen this seed). */
  addSymbol(seed: number, data: Uint8Array): boolean {
    if (this.seenSeeds.has(seed)) {
      this.duplicateFrames++
      return false
    }
    this.seenSeeds.add(seed)
    this.framesAccepted++

    const rand = mulberry32(seed)
    const degree = sampleDegree(rand, this.cdf)
    const indices = pickIndices(rand, this.k, degree)

    const symData = data.slice()
    const remaining = new Set<number>()
    for (const idx of indices) {
      const known = this.blocks[idx]
      if (known) xorInto(symData, known)
      else remaining.add(idx)
    }

    this.insert(remaining, symData)
    return true
  }

  private insert(indices: Set<number>, data: Uint8Array): void {
    const queue: PendingSymbol[] = [{ id: this.nextId++, indices, data }]

    while (queue.length > 0) {
      const sym = queue.pop()!
      if (sym.indices.size === 0) continue

      if (sym.indices.size > 1) {
        this.pendingById.set(sym.id, sym)
        for (const idx of sym.indices) this.byIndex[idx].add(sym.id)
        continue
      }

      const [idx] = sym.indices
      if (this.blocks[idx]) continue

      this.blocks[idx] = sym.data
      this.resolvedCount++

      const refs = this.byIndex[idx]
      for (const refId of [...refs]) {
        const p = this.pendingById.get(refId)
        if (!p) continue
        xorInto(p.data, sym.data)
        p.indices.delete(idx)
        refs.delete(refId)
        if (p.indices.size <= 1) {
          this.pendingById.delete(refId)
          queue.push(p)
        }
      }
    }
  }

  /** Concatenates all resolved blocks. Throws if decoding hasn't completed yet. */
  assemble(): Uint8Array {
    if (!this.isComplete) throw new Error('FountainDecoder: not complete yet')
    const out = new Uint8Array(this.k * this.blockSize)
    for (let i = 0; i < this.k; i++) out.set(this.blocks[i]!, i * this.blockSize)
    return out
  }
}
