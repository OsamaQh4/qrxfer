import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader'
import ZXING_WASM_URL from 'zxing-wasm/reader/zxing_reader.wasm?url'

// Point the WASM loader at the copy Vite bundles locally instead of the
// default jsDelivr CDN, so decoding keeps working fully offline (this is a
// serverless, air-gap-friendly transfer tool by design).
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? ZXING_WASM_URL : prefix + path),
  },
})

/**
 * Decodes any QR codes in a frame and returns their *raw bytes* (not text).
 * ZXing's `.bytes` field is the untouched byte-mode payload — unlike jsQR-style
 * scanners that funnel byte-mode content through a UTF-8 text decode, this is
 * what lets arbitrary binary frame data (including bytes that aren't valid
 * UTF-8) survive the round trip intact.
 */
export async function decodeImageData(imageData: ImageData): Promise<Uint8Array[]> {
  const results = await readBarcodes(imageData, {
    formats: ['QRCode'],
    tryHarder: false,
    maxNumberOfSymbols: 1,
  })
  return results.filter((r) => r.isValid).map((r) => r.bytes)
}

export interface ScannerHandle {
  stop(): void
}

/** Opens the camera and repeatedly decodes frames at (up to) `targetFps`, calling `onDecode` for each QR found. */
export async function startCameraScanner(
  video: HTMLVideoElement,
  targetFps: number,
  onDecode: (bytes: Uint8Array) => void,
): Promise<ScannerHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment' },
    audio: false,
  })
  video.srcObject = stream
  await video.play()

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas context unavailable')

  let stopped = false
  let scanning = false
  const intervalMs = 1000 / targetFps
  let lastTick = 0
  let rafHandle = 0

  const scanOnce = async () => {
    if (video.videoWidth === 0 || video.videoHeight === 0) return
    scanning = true
    try {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const found = await decodeImageData(imageData)
      for (const bytes of found) onDecode(bytes)
    } catch {
      // a single unreadable frame is expected and harmless; the next tick tries again
    } finally {
      scanning = false
    }
  }

  const tick = (time: number) => {
    if (stopped) return
    if (!scanning && time - lastTick >= intervalMs) {
      lastTick = time
      void scanOnce()
    }
    rafHandle = requestAnimationFrame(tick)
  }
  rafHandle = requestAnimationFrame(tick)

  return {
    stop() {
      stopped = true
      cancelAnimationFrame(rafHandle)
      stream.getTracks().forEach((t) => t.stop())
    },
  }
}
