import type { BenchmarkSample, BenchmarkSummary, RunConfig } from './types'

/** Accumulates per-frame samples during a transfer so live throughput and a final summary can be derived. */
export class BenchmarkRecorder {
  private readonly samples: BenchmarkSample[] = [{ t: 0, bytesTotal: 0, framesTotal: 0 }]
  private readonly startTime = performance.now()
  private frames = 0
  private bytes = 0

  recordFrame(wireFrameBytes: number): void {
    this.frames++
    this.bytes += wireFrameBytes
    this.samples.push({ t: this.elapsedMs, bytesTotal: this.bytes, framesTotal: this.frames })
  }

  get elapsedMs(): number {
    return performance.now() - this.startTime
  }

  get frameCount(): number {
    return this.frames
  }

  get totalBytes(): number {
    return this.bytes
  }

  /** Throughput over the trailing `windowMs`, in bytes/sec. */
  currentThroughputBps(windowMs = 1500): number {
    const now = this.elapsedMs
    const cutoff = now - windowMs
    let bytesAtCutoff = this.bytes
    let tAtCutoff = now
    for (let i = this.samples.length - 1; i >= 0; i--) {
      const s = this.samples[i]
      if (s.t <= cutoff) {
        bytesAtCutoff = s.bytesTotal
        tAtCutoff = s.t
        break
      }
      bytesAtCutoff = s.bytesTotal
      tAtCutoff = s.t
    }
    const dtMs = now - tAtCutoff
    if (dtMs <= 0) return 0
    return ((this.bytes - bytesAtCutoff) / dtMs) * 1000
  }

  private peakThroughputBps(): number {
    let peak = 0
    for (let i = 1; i < this.samples.length; i++) {
      const dt = this.samples[i].t - this.samples[i - 1].t
      if (dt <= 0) continue
      const db = this.samples[i].bytesTotal - this.samples[i - 1].bytesTotal
      peak = Math.max(peak, (db / dt) * 1000)
    }
    return peak
  }

  summary(extra: {
    config: RunConfig
    k: number
    duplicateFrames: number
    compressionRatio: number
    hashOk: boolean | null
    headerBytesPerFrame: number
  }): BenchmarkSummary {
    const durationMs = this.elapsedMs
    const headerBytes = this.frames * extra.headerBytesPerFrame
    return {
      config: extra.config,
      durationMs,
      wireBytes: this.bytes,
      frames: this.frames,
      duplicateFrames: extra.duplicateFrames,
      k: extra.k,
      avgThroughputBps: durationMs > 0 ? (this.bytes / durationMs) * 1000 : 0,
      peakThroughputBps: this.peakThroughputBps(),
      redundancyRatio: extra.k > 0 ? this.frames / extra.k : 1,
      compressionRatio: extra.compressionRatio,
      headerOverheadRatio: this.bytes > 0 ? headerBytes / this.bytes : 0,
      hashOk: extra.hashOk,
      samples: this.samples,
    }
  }
}
