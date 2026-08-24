import LineChart from './LineChart'

export interface LiveStats {
  elapsedMs: number
  frames: number
  wireBytes: number
  throughputBps: number
  redundancyRatio?: number
  progress?: number // 0..1, receive-side only
  throughputHistory: { t: number; kbps: number }[]
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export default function BenchmarkOverlay({ stats, dark = false }: { stats: LiveStats; dark?: boolean }) {
  return (
    <div className={dark ? 'hud' : ''}>
      <div className="stat-grid">
        <div className="stat">
          <div className="value">{(stats.elapsedMs / 1000).toFixed(1)}s</div>
          <div className="label">Elapsed</div>
        </div>
        <div className="stat">
          <div className="value">{stats.frames}</div>
          <div className="label">Frames</div>
        </div>
        <div className="stat">
          <div className="value">{formatBytes(stats.wireBytes)}</div>
          <div className="label">Wire data</div>
        </div>
        <div className="stat">
          <div className="value">{(stats.throughputBps / 1024).toFixed(1)} KB/s</div>
          <div className="label">Throughput</div>
        </div>
        {stats.redundancyRatio !== undefined && (
          <div className="stat">
            <div className="value">{stats.redundancyRatio.toFixed(2)}×</div>
            <div className="label">Redundancy</div>
          </div>
        )}
        {stats.progress !== undefined && (
          <div className="stat">
            <div className="value">{(stats.progress * 100).toFixed(0)}%</div>
            <div className="label">Decoded</div>
          </div>
        )}
      </div>

      {stats.progress !== undefined && (
        <div className="progress-bar" style={{ marginBottom: '1rem' }}>
          <div style={{ width: `${Math.min(100, stats.progress * 100)}%` }} />
        </div>
      )}

      {stats.throughputHistory.length > 1 && (
        <LineChart
          xs={stats.throughputHistory.map((s) => s.t)}
          ys={stats.throughputHistory.map((s) => s.kbps)}
          label="KB/s"
          yUnit=""
          color={dark ? '#c084fc' : '#7c3aed'}
        />
      )}
    </div>
  )
}
