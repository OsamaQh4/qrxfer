import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { useEffect, useRef } from 'react'

export interface LineChartProps {
  xs: number[]
  ys: number[]
  label: string
  yUnit?: string
  color?: string
}

/** Thin React wrapper around uPlot for a single-series live throughput/progress chart. */
export default function LineChart({ xs, ys, label, yUnit = '', color = '#7c3aed' }: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const width = containerRef.current.clientWidth || 400
    const opts: uPlot.Options = {
      width,
      height: 160,
      cursor: { show: false },
      legend: { show: false },
      scales: { x: { time: false } },
      axes: [
        { stroke: '#888', grid: { stroke: 'rgba(128,128,128,0.15)' }, size: 40 },
        {
          stroke: '#888',
          grid: { stroke: 'rgba(128,128,128,0.15)' },
          values: (_u, vals) => vals.map((v) => `${v}${yUnit}`),
        },
      ],
      series: [{}, { label, stroke: color, width: 2, fill: `${color}22` }],
    }
    const plot = new uPlot(opts, [xs, ys], containerRef.current)
    plotRef.current = plot
    return () => plot.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    plotRef.current?.setData([xs, ys])
  }, [xs, ys])

  return <div ref={containerRef} className="chart-box" />
}
