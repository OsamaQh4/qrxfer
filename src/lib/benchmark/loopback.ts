import { decodeImageData } from '../qr/decode'
import { renderQrToCanvas, type EccLevel } from '../qr/encode'
import { headerSize, packFrame, unpackFrame } from '../protocol/frame'
import { prepareTransfer, ReceiveSession } from '../protocol/transfer'
import { sleep } from '../util/sleep'
import { BenchmarkRecorder } from './recorder'
import type { BenchmarkSummary } from './types'

export interface LoopbackConfig {
  fps: number
  eccLevel: EccLevel
  blockSize: number
}

/**
 * Runs the full encode -> render QR -> scan QR -> decode pipeline against an
 * offscreen canvas instead of a real camera+screen pair. This isolates the
 * algorithmic/rendering pipeline from camera focus, lighting, and motion —
 * useful for comparing FPS / ECC level / block size choices repeatably.
 * Frames are still paced at the configured FPS so timing reflects what an
 * actual stream at that rate would take.
 */
export async function runLoopbackBenchmark(
  file: { name: string; bytes: Uint8Array },
  config: LoopbackConfig,
  onProgress?: (progress: number) => void,
): Promise<BenchmarkSummary> {
  const { encoder, header } = await prepareTransfer(file.bytes, config.blockSize, file.name)
  const session = new ReceiveSession(header)
  const recorder = new BenchmarkRecorder()

  const canvas = document.createElement('canvas')
  const ctx2d = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx2d) throw new Error('2D canvas context unavailable')

  const frameIntervalMs = 1000 / config.fps
  let seedCounter = 1
  let guard = 0
  const maxFrames = header.k * 50 + 200

  while (!session.isComplete && guard < maxFrames) {
    guard++
    const symbol = encoder.nextSymbol(seedCounter++)
    const wire = packFrame(header, symbol.seed, symbol.data)

    await renderQrToCanvas(canvas, wire, { errorCorrectionLevel: config.eccLevel })
    const imageData = ctx2d.getImageData(0, 0, canvas.width, canvas.height)
    const decoded = await decodeImageData(imageData)

    for (const bytes of decoded) {
      const frame = unpackFrame(bytes)
      if (!frame) continue
      const accepted = session.addSymbol(frame.seed, frame.data)
      if (accepted) recorder.recordFrame(bytes.length)
    }

    onProgress?.(session.progress)
    await sleep(frameIntervalMs)
  }

  const result = await session.finish()

  return recorder.summary({
    config: {
      role: 'loopback',
      fps: config.fps,
      eccLevel: config.eccLevel,
      blockSize: config.blockSize,
      fileSize: file.bytes.length,
      fileName: file.name,
    },
    k: header.k,
    duplicateFrames: session.duplicateFrames,
    compressionRatio: header.fileLength > 0 ? header.payloadLength / header.fileLength : 1,
    hashOk: result.status === 'complete' ? result.hashOk : null,
    headerBytesPerFrame: headerSize(new TextEncoder().encode(header.fileName).length),
  })
}
