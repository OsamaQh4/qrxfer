import { FountainDecoder } from '../fountain/decoder'
import { FountainEncoder } from '../fountain/encoder'
import { compress, decompress } from './compress'
import type { FrameHeader } from './frame'
import { bytesEqual, sha256 } from './hash'

export interface SenderTransfer {
  encoder: FountainEncoder
  header: FrameHeader
}

/** Compresses (if it helps), chunks into fixed-size blocks, and builds the shared frame header. */
export async function prepareTransfer(
  fileBytes: Uint8Array,
  blockSize: number,
  fileName: string,
): Promise<SenderTransfer> {
  const hash = await sha256(fileBytes)
  const compressed = compress(fileBytes)
  const useCompression = compressed.length < fileBytes.length
  const payload = useCompression ? compressed : fileBytes

  const k = Math.max(1, Math.ceil(payload.length / blockSize))
  const padded = new Uint8Array(k * blockSize)
  padded.set(payload)

  const blocks: Uint8Array[] = []
  for (let i = 0; i < k; i++) {
    blocks.push(padded.subarray(i * blockSize, (i + 1) * blockSize))
  }

  const header: FrameHeader = {
    transferId: (Math.random() * 0xffffffff) >>> 0,
    fileName,
    fileLength: fileBytes.length,
    payloadLength: payload.length,
    blockSize,
    k,
    compressed: useCompression,
    hash,
  }

  return { encoder: new FountainEncoder(blocks), header }
}

export type ReceiveResult =
  | { status: 'complete'; bytes: Uint8Array; hashOk: boolean }
  | { status: 'incomplete' }

/** Receiver-side session: accepts frames for one transferId, tracks decode progress, assembles + verifies. */
export class ReceiveSession {
  readonly header: FrameHeader
  private readonly decoder: FountainDecoder

  constructor(header: FrameHeader) {
    this.header = header
    this.decoder = new FountainDecoder(header.k, header.blockSize)
  }

  get progress(): number {
    return this.decoder.progress
  }

  get isComplete(): boolean {
    return this.decoder.isComplete
  }

  get framesAccepted(): number {
    return this.decoder.framesAccepted
  }

  get duplicateFrames(): number {
    return this.decoder.duplicateFrames
  }

  addSymbol(seed: number, data: Uint8Array): boolean {
    return this.decoder.addSymbol(seed, data)
  }

  async finish(): Promise<ReceiveResult> {
    if (!this.decoder.isComplete) return { status: 'incomplete' }

    const padded = this.decoder.assemble()
    const payload = padded.slice(0, this.header.payloadLength)
    const fileBytes = this.header.compressed ? decompress(payload) : payload
    const trimmed = fileBytes.slice(0, this.header.fileLength)

    const actualHash = await sha256(trimmed)
    const hashOk = bytesEqual(actualHash, this.header.hash)

    return { status: 'complete', bytes: trimmed, hashOk }
  }
}
