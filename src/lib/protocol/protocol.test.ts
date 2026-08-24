import { describe, expect, it } from 'vitest'
import { headerSize, packFrame, unpackFrame } from './frame'
import type { FrameHeader } from './frame'
import { prepareTransfer, ReceiveSession } from './transfer'

function makeHeader(overrides: Partial<FrameHeader> = {}): FrameHeader {
  return {
    transferId: 0xdeadbeef,
    fileName: 'photo.jpg',
    fileLength: 1234,
    payloadLength: 999,
    blockSize: 300,
    k: 7,
    compressed: true,
    hash: new Uint8Array(32).map((_, i) => i),
    ...overrides,
  }
}

describe('packFrame / unpackFrame', () => {
  it('round-trips a header + payload exactly', () => {
    const header = makeHeader()
    const data = new Uint8Array(300).map((_, i) => (i * 7) & 0xff)
    const packed = packFrame(header, 0x12345678, data)

    expect(packed.length).toBe(headerSize(new TextEncoder().encode(header.fileName).length) + 300)

    const unpacked = unpackFrame(packed)
    expect(unpacked).not.toBeNull()
    expect(unpacked!.header).toEqual(header)
    expect(unpacked!.seed).toBe(0x12345678)
    expect(unpacked!.data).toEqual(data)
  })

  it('preserves arbitrary byte values 0x00-0xff in the payload, including bytes that break UTF-8', () => {
    const data = new Uint8Array(256)
    for (let i = 0; i < 256; i++) data[i] = i
    const packed = packFrame(makeHeader({ blockSize: 256 }), 1, data)
    const unpacked = unpackFrame(packed)
    expect(unpacked!.data).toEqual(data)
  })

  it('rejects garbage that does not start with the magic bytes', () => {
    const junk = new Uint8Array(100).fill(0xff)
    expect(unpackFrame(junk)).toBeNull()
  })

  it('rejects truncated buffers', () => {
    const packed = packFrame(makeHeader(), 1, new Uint8Array(300))
    expect(unpackFrame(packed.slice(0, 10))).toBeNull()
  })
})

describe('prepareTransfer / ReceiveSession end-to-end', () => {
  it('reconstructs an incompressible random file bit-exactly', async () => {
    const original = new Uint8Array(5000)
    let s = 42
    for (let i = 0; i < original.length; i++) {
      s = (s * 1103515245 + 12345) >>> 0
      original[i] = (s >>> 16) & 0xff
    }

    const { encoder, header } = await prepareTransfer(original, 128, 'random.bin')
    const session = new ReceiveSession(header)

    while (!session.isComplete) {
      const symbol = encoder.nextSymbol()
      session.addSymbol(symbol.seed, symbol.data)
    }

    const result = await session.finish()
    expect(result.status).toBe('complete')
    if (result.status === 'complete') {
      expect(result.hashOk).toBe(true)
      expect(result.bytes).toEqual(original)
    }
  })

  it('reconstructs a highly-compressible text file, using compression', async () => {
    const text = 'the quick brown fox jumps over the lazy dog. '.repeat(200)
    const original = new TextEncoder().encode(text)

    const { encoder, header } = await prepareTransfer(original, 64, 'quote.txt')
    expect(header.compressed).toBe(true)
    expect(header.payloadLength).toBeLessThan(original.length)

    const session = new ReceiveSession(header)
    while (!session.isComplete) {
      const symbol = encoder.nextSymbol()
      session.addSymbol(symbol.seed, symbol.data)
    }

    const result = await session.finish()
    expect(result.status).toBe('complete')
    if (result.status === 'complete') {
      expect(result.hashOk).toBe(true)
      expect(new TextDecoder().decode(result.bytes)).toBe(text)
    }
  })

  it('survives simulated dropped frames end-to-end through the wire format', async () => {
    const original = crypto.getRandomValues(new Uint8Array(3000))
    const { encoder, header } = await prepareTransfer(original, 200, 'blob.dat')
    const session = new ReceiveSession(header)

    let seedCounter = 1
    let iterations = 0
    while (!session.isComplete && iterations < header.k * 50) {
      iterations++
      const symbol = encoder.nextSymbol(seedCounter++)
      if (iterations % 3 === 0) continue // drop every 3rd frame
      const wire = packFrame(header, symbol.seed, symbol.data)
      const frame = unpackFrame(wire)!
      session.addSymbol(frame.seed, frame.data)
    }

    const result = await session.finish()
    expect(result.status).toBe('complete')
    if (result.status === 'complete') expect(result.hashOk).toBe(true)
  })
})
