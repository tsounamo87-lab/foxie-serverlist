import { useMemo } from 'react'
import type { Sample } from '../store/history'

/** Build an SVG path string from numeric values mapped into a viewbox. */
function buildPath(values: number[], w: number, h: number, pad = 2) {
  if (values.length === 0) return { line: '', area: '' }
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const span = max - min || 1
  const stepX = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0
  const pts = values.map((v, i) => {
    const x = pad + i * stepX
    const y = h - pad - ((v - min) / span) * (h - pad * 2)
    return [x, y] as const
  })
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`
  return { line, area }
}

/** Compact inline sparkline (no axes). */
export function Sparkline({
  values,
  width = 120,
  height = 32,
}: {
  values: number[]
  width?: number
  height?: number
}) {
  const { line, area } = useMemo(() => buildPath(values, width, height), [values, width, height])
  if (!line)
    return (
      <div className="text-[11px] text-muted" style={{ height }}>
        No data yet
      </div>
    )
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={area} fill="var(--c-accent)" opacity="0.12" />
      <path d={line} fill="none" stroke="var(--c-accent)" strokeWidth="1.5" />
    </svg>
  )
}

/** Larger population-over-time area chart with a baseline + last value. */
export function PopulationChart({ samples, height = 120 }: { samples: Sample[]; height?: number }) {
  const width = 600
  const values = samples.map((s) => s.players)
  const { line, area } = useMemo(() => buildPath(values, width, height, 4), [values, height])
  const last = values[values.length - 1] ?? 0
  const peak = values.length ? Math.max(...values) : 0

  if (values.length < 2)
    return (
      <div
        className="flex items-center justify-center rounded-lg border border-border bg-surface-2 text-xs text-muted"
        style={{ height }}
      >
        Collecting data… population history appears after a few refreshes.
      </div>
    )

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
      >
        <path d={area} fill="var(--c-accent)" opacity="0.14" />
        <path d={line} fill="none" stroke="var(--c-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="pointer-events-none absolute right-2 top-1 text-right">
        <div className="text-sm font-bold tabular-nums text-text">{last}</div>
        <div className="text-[10px] uppercase tracking-wide text-muted">now · peak {peak}</div>
      </div>
    </div>
  )
}
