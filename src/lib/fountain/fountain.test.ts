import { describe, expect, it } from 'vitest'
import { FountainDecoder } from './decoder'
import { FountainEncoder } from './encoder'

function randomBlocks(k: number, blockSize: number, seed: number): Uint8Array[] {
  let s = seed >>> 0
  const rand = () => {
    s = (s * 1103515245 + 12345) >>> 0
    return s
  }
  return Array.from({ length: k }, () => {
    const b = new Uint8Array(blockSize)
    for (let i = 0; i < blockSize; i++) b[i] = rand() & 0xff
    return b
  })
}

function decodeWithLoss(k: number, blockSize: number, dropRate: number, seed: number) {
  const blocks = randomBlocks(k, blockSize, seed)
  const encoder = new FountainEncoder(blocks)
  const decoder = new FountainDecoder(k, blockSize)

  let s = (seed ^ 0x9e3779b9) >>> 0
  const rand = () => {
    s = (s * 1103515245 + 12345) >>> 0
    return (s >>> 8) / 0x1000000
  }

  let frames = 0
  const maxFrames = k * 50 + 100
  while (!decoder.isComplete && frames < maxFrames) {
    const symbol = encoder.nextSymbol()
    frames++
    if (rand() < dropRate) continue // simulate a camera-missed frame
    decoder.addSymbol(symbol.seed, symbol.data)
  }

  return { blocks, decoder, frames }
}

describe('FountainEncoder / FountainDecoder round-trip', () => {
  it('reconstructs all blocks with no loss', () => {
    const { blocks, decoder } = decodeWithLoss(20, 16, 0, 1)
    expect(decoder.isComplete).toBe(true)
    const assembled = decoder.assemble()
    const expected = new Uint8Array(blocks.length * 16)
    blocks.forEach((b, i) => expected.set(b, i * 16))
    expect(assembled).toEqual(expected)
  })

  it('reconstructs correctly even when half of all frames are dropped', () => {
    const { decoder, frames } = decodeWithLoss(40, 32, 0.5, 2)
    expect(decoder.isComplete).toBe(true)
    // fountain codes need only a small constant overhead over k frames even with loss
    expect(decoder.framesAccepted).toBeLessThan(frames)
  })

  it('handles k=1 (single block) correctly', () => {
    const { blocks, decoder } = decodeWithLoss(1, 8, 0, 3)
    expect(decoder.isComplete).toBe(true)
    expect(decoder.assemble()).toEqual(blocks[0])
  })

  it('ignores duplicate seeds without corrupting state', () => {
    const blocks = randomBlocks(10, 16, 4)
    const encoder = new FountainEncoder(blocks)
    const decoder = new FountainDecoder(10, 16)
    const symbol = encoder.nextSymbol(12345)
    expect(decoder.addSymbol(symbol.seed, symbol.data)).toBe(true)
    expect(decoder.addSymbol(symbol.seed, symbol.data)).toBe(false)
    expect(decoder.duplicateFrames).toBe(1)
  })

  it('converges across many random configurations', () => {
    for (let trial = 0; trial < 15; trial++) {
      const k = 5 + trial * 7
      const { decoder } = decodeWithLoss(k, 24, 0.2, 100 + trial)
      expect(decoder.isComplete).toBe(true)
    }
  })
})
