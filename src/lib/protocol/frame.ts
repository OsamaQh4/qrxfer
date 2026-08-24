/**
 * Every QR frame is fully self-describing: it carries the whole transfer
 * header (ids, lengths, block layout, file name/hash) plus one LT symbol.
 * This costs a fixed ~60+ bytes of overhead per frame, but means the
 * receiver can join the stream on any frame in any order — there's no
 * separate "metadata frame" that could itself be missed.
 */
export interface FrameHeader {
  transferId: number
  fileName: string
  fileLength: number
  payloadLength: number
  blockSize: number
  k: number
  compressed: boolean
  hash: Uint8Array // 32-byte SHA-256 of the original (pre-compression) file bytes
}

export interface Frame {
  header: FrameHeader
  seed: number
  data: Uint8Array
}

const MAGIC0 = 0x51 // 'Q'
const MAGIC1 = 0x58 // 'X'
const VERSION = 1
const HASH_LEN = 32
export const MAX_NAME_BYTES = 255

/** Fixed-size portion of the header, excluding the variable-length file name. */
const FIXED_HEADER_SIZE = 2 + 1 + 4 + 4 + 4 + 2 + 4 + 1 + 1 + HASH_LEN + 4 // = 59

export function headerSize(nameByteLength: number): number {
  return FIXED_HEADER_SIZE + nameByteLength
}

export function packFrame(header: FrameHeader, seed: number, data: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(header.fileName).slice(0, MAX_NAME_BYTES)
  const buf = new Uint8Array(headerSize(nameBytes.length) + data.length)
  const view = new DataView(buf.buffer)
  let o = 0
  buf[o++] = MAGIC0
  buf[o++] = MAGIC1
  buf[o++] = VERSION
  view.setUint32(o, header.transferId >>> 0)
  o += 4
  view.setUint32(o, header.fileLength >>> 0)
  o += 4
  view.setUint32(o, header.payloadLength >>> 0)
  o += 4
  view.setUint16(o, header.blockSize)
  o += 2
  view.setUint32(o, header.k >>> 0)
  o += 4
  buf[o++] = header.compressed ? 1 : 0
  buf[o++] = nameBytes.length
  buf.set(nameBytes, o)
  o += nameBytes.length
  buf.set(header.hash, o)
  o += HASH_LEN
  view.setUint32(o, seed >>> 0)
  o += 4
  buf.set(data, o)
  return buf
}

export function unpackFrame(buf: Uint8Array): Frame | null {
  if (buf.length < FIXED_HEADER_SIZE) return null
  if (buf[0] !== MAGIC0 || buf[1] !== MAGIC1 || buf[2] !== VERSION) return null

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let o = 3
  const transferId = view.getUint32(o)
  o += 4
  const fileLength = view.getUint32(o)
  o += 4
  const payloadLength = view.getUint32(o)
  o += 4
  const blockSize = view.getUint16(o)
  o += 2
  const k = view.getUint32(o)
  o += 4
  const compressed = buf[o] === 1
  o += 1
  const nameLen = buf[o]
  o += 1

  if (buf.length < o + nameLen + HASH_LEN + 4) return null
  const fileName = new TextDecoder().decode(buf.slice(o, o + nameLen))
  o += nameLen
  const hash = buf.slice(o, o + HASH_LEN)
  o += HASH_LEN
  const seed = view.getUint32(o)
  o += 4

  if (buf.length < o + blockSize) return null
  const data = buf.slice(o, o + blockSize)

  return {
    header: { transferId, fileName, fileLength, payloadLength, blockSize, k, compressed, hash },
    seed,
    data,
  }
}
