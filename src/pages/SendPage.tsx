import { useEffect, useRef, useState } from 'react'
import BenchmarkOverlay, { type LiveStats } from '../components/BenchmarkOverlay'
import { saveRun } from '../lib/benchmark/history'
import { BenchmarkRecorder } from '../lib/benchmark/recorder'
import { headerSize, packFrame } from '../lib/protocol/frame'
import { toHex } from '../lib/protocol/hash'
import { prepareTransfer, type SenderTransfer } from '../lib/protocol/transfer'
import { renderQrToCanvas, type EccLevel } from '../lib/qr/encode'
import { sleep } from '../lib/util/sleep'

export default function SendPage() {
  const [file, setFile] = useState<File | null>(null)
  const [fps, setFps] = useState(15)
  const [eccLevel, setEccLevel] = useState<EccLevel>('M')
  const [blockSize, setBlockSize] = useState(400)
  const [streaming, setStreaming] = useState(false)
  const [matchCode, setMatchCode] = useState('')
  const [stats, setStats] = useState<LiveStats | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stopRef = useRef(false)
  const transferRef = useRef<SenderTransfer | null>(null)
  const recorderRef = useRef<BenchmarkRecorder | null>(null)
  const historyRef = useRef<{ t: number; kbps: number }[]>([])

  useEffect(() => () => void (stopRef.current = true), [])

  async function start() {
    if (!file) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    const transfer = await prepareTransfer(bytes, blockSize, file.name)
    transferRef.current = transfer
    recorderRef.current = new BenchmarkRecorder()
    historyRef.current = []
    setMatchCode(toHex(transfer.header.hash).slice(0, 6).toUpperCase())
    stopRef.current = false
    setStreaming(true)
    void loop(transfer)
  }

  async function loop(transfer: SenderTransfer) {
    const recorder = recorderRef.current
    if (!recorder) return
    const intervalMs = 1000 / fps
    let seedCounter = 1
    let lastUiUpdate = 0

    while (!stopRef.current) {
      const t0 = performance.now()
      if (!canvasRef.current) break

      const symbol = transfer.encoder.nextSymbol(seedCounter++)
      const wire = packFrame(transfer.header, symbol.seed, symbol.data)
      await renderQrToCanvas(canvasRef.current, wire, { errorCorrectionLevel: eccLevel })
      recorder.recordFrame(wire.length)

      if (t0 - lastUiUpdate > 150) {
        lastUiUpdate = t0
        const kbps = recorder.currentThroughputBps() / 1024
        historyRef.current = [...historyRef.current.slice(-119), { t: recorder.elapsedMs / 1000, kbps }]
        setStats({
          elapsedMs: recorder.elapsedMs,
          frames: recorder.frameCount,
          wireBytes: recorder.totalBytes,
          throughputBps: recorder.currentThroughputBps(),
          redundancyRatio: recorder.frameCount / transfer.header.k,
          throughputHistory: historyRef.current,
        })
      }

      const wait = intervalMs - (performance.now() - t0)
      if (wait > 0) await sleep(wait)
    }
  }

  async function stop() {
    stopRef.current = true
    setStreaming(false)
    const transfer = transferRef.current
    const recorder = recorderRef.current
    if (transfer && recorder && file && recorder.frameCount > 0) {
      const summary = recorder.summary({
        config: { role: 'send', fps, eccLevel, blockSize, fileSize: file.size, fileName: file.name },
        k: transfer.header.k,
        duplicateFrames: 0,
        compressionRatio: transfer.header.payloadLength / transfer.header.fileLength,
        hashOk: null, // the sender never learns whether the receiver actually completed
        headerBytesPerFrame: headerSize(new TextEncoder().encode(file.name).length),
      })
      await saveRun(summary)
    }
  }

  if (streaming) {
    return (
      <div className="stream-overlay">
        <canvas ref={canvasRef} />
        <div className="hud">
          <div style={{ fontSize: '1.4rem', letterSpacing: '0.2em', marginBottom: '0.5rem' }}>
            {matchCode}
          </div>
          <div style={{ opacity: 0.7, marginBottom: '1rem' }}>
            {file?.name} — check this code matches on the receiving device
          </div>
        </div>
        {stats && <BenchmarkOverlay stats={stats} dark />}
        <button type="button" className="secondary" onClick={() => void stop()}>
          Stop streaming
        </button>
      </div>
    )
  }

  return (
    <div>
      <h1>Send</h1>
      <div className="card">
        <div className="field">
          <label htmlFor="file">File</label>
          <input
            id="file"
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <div className="field-row" style={{ marginTop: '1rem' }}>
          <div className="field">
            <label htmlFor="fps">Frame rate (fps)</label>
            <input
              id="fps"
              type="number"
              min={1}
              max={30}
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label htmlFor="ecc">QR error correction</label>
            <select id="ecc" value={eccLevel} onChange={(e) => setEccLevel(e.target.value as EccLevel)}>
              <option value="L">L — low (max density)</option>
              <option value="M">M — medium</option>
              <option value="Q">Q — quartile</option>
              <option value="H">H — high (max robustness)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="blockSize">Block size (bytes)</label>
            <input
              id="blockSize"
              type="number"
              min={32}
              max={2000}
              step={16}
              value={blockSize}
              onChange={(e) => setBlockSize(Number(e.target.value))}
            />
          </div>
        </div>

        <button type="button" disabled={!file} onClick={() => void start()}>
          Start streaming
        </button>
      </div>
    </div>
  )
}
