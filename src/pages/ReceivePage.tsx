import { useEffect, useRef, useState } from 'react'
import BenchmarkOverlay, { type LiveStats } from '../components/BenchmarkOverlay'
import { saveRun } from '../lib/benchmark/history'
import { BenchmarkRecorder } from '../lib/benchmark/recorder'
import { headerSize, unpackFrame, type FrameHeader } from '../lib/protocol/frame'
import { toHex } from '../lib/protocol/hash'
import { ReceiveSession } from '../lib/protocol/transfer'
import { startCameraScanner, type ScannerHandle } from '../lib/qr/decode'

export default function ReceivePage() {
  const [scanning, setScanning] = useState(false)
  const [header, setHeader] = useState<FrameHeader | null>(null)
  const [stats, setStats] = useState<LiveStats | null>(null)
  const [result, setResult] = useState<{ bytes: Uint8Array; hashOk: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<ScannerHandle | null>(null)
  const sessionRef = useRef<ReceiveSession | null>(null)
  const recorderRef = useRef<BenchmarkRecorder | null>(null)
  const historyRef = useRef<{ t: number; kbps: number }[]>([])
  const doneRef = useRef(false)

  useEffect(() => () => scannerRef.current?.stop(), [])

  async function start() {
    setError(null)
    setResult(null)
    setHeader(null)
    doneRef.current = false
    sessionRef.current = null
    recorderRef.current = null
    historyRef.current = []

    if (!videoRef.current) return
    try {
      const handle = await startCameraScanner(videoRef.current, 20, onFrameBytes)
      scannerRef.current = handle
      setScanning(true)
    } catch {
      setError('Could not access the camera. Check permissions and try again.')
    }
  }

  function stop() {
    scannerRef.current?.stop()
    scannerRef.current = null
    setScanning(false)
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
        fps: 20,
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

      {scanning && (
        <div className="card">
          <div className="video-frame">
            <video ref={videoRef} muted playsInline />
          </div>

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
      )}

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
