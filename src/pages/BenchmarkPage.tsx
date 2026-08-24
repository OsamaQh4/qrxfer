import { useEffect, useState } from 'react'
import { clearRuns, listRuns, saveRun } from '../lib/benchmark/history'
import { runLoopbackBenchmark } from '../lib/benchmark/loopback'
import type { BenchmarkSummary } from '../lib/benchmark/types'
import type { EccLevel } from '../lib/qr/encode'

interface HistoryRow extends BenchmarkSummary {
  id?: number
  savedAt: number
}

function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size)
  crypto.getRandomValues(out.subarray(0, Math.min(size, 65536)))
  // getRandomValues caps at 65536 bytes per call; tile it for larger synthetic files
  for (let o = 65536; o < size; o += 65536) {
    out.set(out.subarray(0, Math.min(65536, size - o)), o)
  }
  return out
}

export default function BenchmarkPage() {
  const [fileSizeKb, setFileSizeKb] = useState(50)
  const [fps, setFps] = useState(15)
  const [eccLevel, setEccLevel] = useState<EccLevel>('M')
  const [blockSize, setBlockSize] = useState(400)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [lastResult, setLastResult] = useState<BenchmarkSummary | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])

  useEffect(() => {
    void refreshHistory()
  }, [])

  async function refreshHistory() {
    setHistory((await listRuns()) as HistoryRow[])
  }

  async function run() {
    setRunning(true)
    setProgress(0)
    setLastResult(null)
    try {
      const bytes = randomBytes(fileSizeKb * 1024)
      const summary = await runLoopbackBenchmark(
        { name: `synthetic-${fileSizeKb}kb.bin`, bytes },
        { fps, eccLevel, blockSize },
        setProgress,
      )
      setLastResult(summary)
      await saveRun(summary)
      await refreshHistory()
    } finally {
      setRunning(false)
    }
  }

  async function clear() {
    await clearRuns()
    await refreshHistory()
  }

  return (
    <div>
      <h1>Benchmark</h1>
      <div className="card">
        <p>
          Runs the full encode → render QR → scan → decode pipeline against an offscreen canvas
          (no camera needed), paced at the configured frame rate. Use this to compare FPS, QR
          error-correction level, and block size without needing a second device.
        </p>

        <div className="field-row">
          <div className="field">
            <label htmlFor="size">Synthetic file size (KB)</label>
            <input
              id="size"
              type="number"
              min={1}
              max={2000}
              value={fileSizeKb}
              onChange={(e) => setFileSizeKb(Number(e.target.value))}
              disabled={running}
            />
          </div>
          <div className="field">
            <label htmlFor="bfps">Frame rate (fps)</label>
            <input
              id="bfps"
              type="number"
              min={1}
              max={30}
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              disabled={running}
            />
          </div>
          <div className="field">
            <label htmlFor="becc">QR error correction</label>
            <select
              id="becc"
              value={eccLevel}
              onChange={(e) => setEccLevel(e.target.value as EccLevel)}
              disabled={running}
            >
              <option value="L">L</option>
              <option value="M">M</option>
              <option value="Q">Q</option>
              <option value="H">H</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="bblock">Block size (bytes)</label>
            <input
              id="bblock"
              type="number"
              min={32}
              max={2000}
              step={16}
              value={blockSize}
              onChange={(e) => setBlockSize(Number(e.target.value))}
              disabled={running}
            />
          </div>
        </div>

        <button type="button" disabled={running} onClick={() => void run()}>
          {running ? 'Running…' : 'Run benchmark'}
        </button>

        {running && (
          <div className="progress-bar" style={{ marginTop: '1rem' }}>
            <div style={{ width: `${progress * 100}%` }} />
          </div>
        )}

        {lastResult && (
          <div className="stat-grid" style={{ marginTop: '1rem' }}>
            <div className="stat">
              <div className="value">{(lastResult.durationMs / 1000).toFixed(2)}s</div>
              <div className="label">Duration</div>
            </div>
            <div className="stat">
              <div className="value">{(lastResult.avgThroughputBps / 1024).toFixed(1)} KB/s</div>
              <div className="label">Avg throughput</div>
            </div>
            <div className="stat">
              <div className="value">{lastResult.redundancyRatio.toFixed(2)}×</div>
              <div className="label">Redundancy</div>
            </div>
            <div className="stat">
              <div className="value">{(lastResult.compressionRatio * 100).toFixed(0)}%</div>
              <div className="label">Post-compression size</div>
            </div>
            <div className="stat">
              <div className="value">{(lastResult.headerOverheadRatio * 100).toFixed(1)}%</div>
              <div className="label">Header overhead</div>
            </div>
            <div className="stat">
              <div className={lastResult.hashOk ? 'value ok' : 'value err'}>
                {lastResult.hashOk ? 'OK' : 'FAIL'}
              </div>
              <div className="label">Checksum</div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3>Run history</h3>
          <button type="button" className="secondary" onClick={() => void clear()}>
            Clear
          </button>
        </div>
        {history.length === 0 ? (
          <p style={{ color: 'var(--text-dim)' }}>No runs yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="history">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Role</th>
                  <th>File</th>
                  <th>FPS</th>
                  <th>ECC</th>
                  <th>Block</th>
                  <th>Avg KB/s</th>
                  <th>Redundancy</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.savedAt).toLocaleTimeString()}</td>
                    <td>{row.config.role}</td>
                    <td>{row.config.fileName}</td>
                    <td>{row.config.fps}</td>
                    <td>{row.config.eccLevel}</td>
                    <td>{row.config.blockSize}</td>
                    <td>{(row.avgThroughputBps / 1024).toFixed(1)}</td>
                    <td>{row.redundancyRatio.toFixed(2)}×</td>
                    <td className={row.hashOk === false ? 'err' : row.hashOk ? 'ok' : ''}>
                      {row.hashOk === null ? '—' : row.hashOk ? 'OK' : 'FAIL'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
