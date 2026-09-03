import { useEffect, useRef, useState } from 'react'
import BenchmarkOverlay, { type LiveStats } from '../components/BenchmarkOverlay'
import { saveRun } from '../lib/benchmark/history'
import { BenchmarkRecorder } from '../lib/benchmark/recorder'
import { headerSize, unpackFrame, type FrameHeader } from '../lib/protocol/frame'
import { toHex } from '../lib/protocol/hash'
import { ReceiveSession } from '../lib/protocol/transfer'
import { startCameraScanner, type CameraInfo, type ScannerHandle, type ScanTiming } from '../lib/qr/decode'
import { acquireWakeLock, type WakeLockHandle } from '../lib/util/wakeLock'

export default function ReceivePage() {
  const [scanning, setScanning] = useState(false)
  const [header, setHeader] = useState<FrameHeader | null>(null)
  const [stats, setStats] = useState<LiveStats | null>(null)
  const [result, setResult] = useState<{ bytes: Uint8Array; hashOk: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null)
  const [avgTiming, setAvgTiming] = useState<ScanTiming | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<ScannerHandle | null>(null)
  const sessionRef = useRef<ReceiveSession | null>(null)
  const recorderRef = useRef<BenchmarkRecorder | null>(null)
  const historyRef = useRef<{ t: number; kbps: number }[]>([])
  const doneRef = useRef(false)
  const wakeLockRef = useRef<WakeLockHandle | null>(null)
  const timingSamplesRef = useRef<ScanTiming[]>([])
  const lastTimingUiUpdateRef = useRef(0)

  useEffect(
    () => () => {
      scannerRef.current?.stop()
      wakeLockRef.current?.release()
    },
    [],
  )

  async function start() {
    setError(null)
    setResult(null)
    setHeader(null)
    setCameraInfo(null)
    setAvgTiming(null)
    doneRef.current = false
    sessionRef.current = null
    recorderRef.current = null
    historyRef.current = []
    timingSamplesRef.current = []
    lastTimingUiUpdateRef.current = 0

    if (!videoRef.current) return
    try {
      // 60 is just an upper bound the scan loop is allowed to attempt — it never
      // overlaps decode attempts (see the `!scanning` guard in decode.ts), so the
      // *actual* rate always self-limits to however fast drawImage + WASM decode
      // really runs on this device; raising the cap just stops us from being the
      // artificial bottleneck ahead of that real hardware limit.
      const handle = await startCameraScanner(videoRef.current, 60, onFrameBytes, onScanTiming)
      scannerRef.current = handle
      setCameraInfo(handle.cameraInfo)
      // a multi-minute scan with no touch input is exactly when a phone dims/locks,
      // which would silently stall the camera feed mid-transfer
      wakeLockRef.current = await acquireWakeLock()
      setScanning(true)
    } catch {
      setError('Could not access the camera. Check permissions and try again.')
    }
  }

  function stop() {
    scannerRef.current?.stop()
    scannerRef.current = null
    wakeLockRef.current?.release()
    wakeLockRef.current = null
    setScanning(false)
  }

  function onScanTiming(timing: ScanTiming) {
    const samples = [...timingSamplesRef.current.slice(-29), timing]
    timingSamplesRef.current = samples

    const now = performance.now()
    if (now - lastTimingUiUpdateRef.current < 300) return
    lastTimingUiUpdateRef.current = now

    const avg = (key: keyof ScanTiming) => samples.reduce((s, t) => s + t[key], 0) / samples.length
    setAvgTiming({
      drawMs: avg('drawMs'),
      readbackMs: avg('readbackMs'),
      decodeMs: avg('decodeMs'),
      totalMs: avg('totalMs'),
    })
  }

  function onFrameBytes(bytes: Uint8Array) {
    if (doneRef.current) return
    const frame = unpackFrame(bytes)
    if (!frame) return

    if (!sessionRef.current) {
      sessionRef.current = new ReceiveSession(frame.header)
      recorderRef.current = new BenchmarkRecorder()
      setHeader(frame.header)
    }

    const session = sessionRef.current
    const recorder = recorderRef.current
    if (!session || !recorder) return

    const accepted = session.addSymbol(frame.seed, frame.data)
    if (accepted) recorder.recordFrame(bytes.length)

    const kbps = recorder.currentThroughputBps() / 1024
    historyRef.current = [...historyRef.current.slice(-119), { t: recorder.elapsedMs / 1000, kbps }]
    setStats({
      elapsedMs: recorder.elapsedMs,
      frames: recorder.frameCount,
      wireBytes: recorder.totalBytes,
      throughputBps: recorder.currentThroughputBps(),
      progress: session.progress,
      throughputHistory: historyRef.current,
    })

    if (session.isComplete && !doneRef.current) {
      doneRef.current = true
      void finish()
    }
  }

  async function finish() {
    const session = sessionRef.current
    const recorder = recorderRef.current
    if (!session || !recorder) return
    const res = await session.finish()
    stop()
    if (res.status !== 'complete') return

    setResult({ bytes: res.bytes, hashOk: res.hashOk })

    const summary = recorder.summary({
      config: {
        role: 'receive',
        fps: 60, // ceiling only — recorder.avgThroughputBps reflects the actual achieved rate
        eccLevel: 'M',
        blockSize: session.header.blockSize,
        fileSize: session.header.fileLength,
        fileName: session.header.fileName,
      },
      k: session.header.k,
      duplicateFrames: session.duplicateFrames,
      compressionRatio: session.header.fileLength > 0 ? session.header.payloadLength / session.header.fileLength : 1,
      hashOk: res.hashOk,
      headerBytesPerFrame: headerSize(new TextEncoder().encode(session.header.fileName).length),
    })
    await saveRun(summary)
  }

  function download() {
    if (!result || !header) return
    const blob = new Blob([result.bytes.slice().buffer as ArrayBuffer])
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = header.fileName || 'received-file'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <h1>Receive</h1>

      {!scanning && !result && (
        <div className="card">
          <p>Point your camera at the sender's screen. Scanning starts automatically.</p>
          <button type="button" onClick={() => void start()}>
            Start camera
          </button>
          {error && <p className="err">{error}</p>}
        </div>
      )}

      {/* Always mounted (just hidden) so videoRef is attached before start() ever runs —
          it needs the element to exist before the camera stream can be wired up. */}
      <div className="card" style={{ display: scanning ? 'block' : 'none' }}>
        <div className="video-frame">
          <video ref={videoRef} muted playsInline autoPlay />
        </div>

        {cameraInfo && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '0.5rem 0' }}>
            Camera: {cameraInfo.settings.width}×{cameraInfo.settings.height} @{' '}
            {cameraInfo.settings.frameRate?.toFixed(0) ?? '?'} fps
            {cameraInfo.capabilities?.frameRate &&
              ` (device reports ${cameraInfo.capabilities.frameRate.min}–${cameraInfo.capabilities.frameRate.max} fps range)`}
          </div>
        )}

        {avgTiming && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', margin: '0.5rem 0' }}>
            Per attempt (avg): draw {avgTiming.drawMs.toFixed(1)}ms · readback {avgTiming.readbackMs.toFixed(1)}ms ·
            decode {avgTiming.decodeMs.toFixed(1)}ms · total {avgTiming.totalMs.toFixed(1)}ms (
            {(1000 / avgTiming.totalMs).toFixed(1)} fps ceiling)
          </div>
        )}

        {header && (
          <div style={{ margin: '1rem 0' }}>
            <div style={{ fontSize: '1.4rem', letterSpacing: '0.2em' }}>
              {toHex(header.hash).slice(0, 6).toUpperCase()}
            </div>
            <div style={{ color: 'var(--text-dim)' }}>
              {header.fileName} — {(header.fileLength / 1024).toFixed(1)} KB, {header.k} blocks
            </div>
          </div>
        )}

        {stats && <BenchmarkOverlay stats={stats} />}

        <button type="button" className="secondary" onClick={stop}>
          Stop
        </button>
      </div>

      {result && header && (
        <div className="card">
          <h3 className={result.hashOk ? 'ok' : 'err'}>
            {result.hashOk ? 'Transfer complete — checksum verified' : 'Transfer complete — checksum MISMATCH'}
          </h3>
          <p>
            {header.fileName} ({(result.bytes.length / 1024).toFixed(1)} KB)
          </p>
          <button type="button" onClick={download}>
            Save file
          </button>
        </div>
      )}
    </div>
  )
}
