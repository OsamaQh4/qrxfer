export interface BenchmarkSample {
  /** milliseconds since the transfer started */
  t: number
  /** cumulative raw wire bytes (QR frame bytes, header included) processed so far */
  bytesTotal: number
  framesTotal: number
}

export interface RunConfig {
  role: 'send' | 'receive' | 'loopback'
  fps: number
  eccLevel: 'L' | 'M' | 'Q' | 'H'
  blockSize: number
  fileSize: number
  fileName: string
}

export interface BenchmarkSummary {
  config: RunConfig
  durationMs: number
  wireBytes: number
  frames: number
  duplicateFrames: number
  k: number
  avgThroughputBps: number
  peakThroughputBps: number
  redundancyRatio: number // frames actually needed / k (1.0 = perfectly efficient)
  compressionRatio: number // payloadLength / fileLength (<1 means compression helped)
  headerOverheadRatio: number // header bytes / total wire bytes
  hashOk: boolean | null
  samples: BenchmarkSample[]
}
