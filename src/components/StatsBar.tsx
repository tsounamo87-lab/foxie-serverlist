import { useEffect, useRef, useState } from 'react'
import { Activity, Globe, Server as ServerIcon, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { GameEntry, Server } from '../lib/starblast'

function useCountUp(target: number, duration = 1400) {
  const [count, setCount] = useState(0)
  const prevRef = useRef(0)
  useEffect(() => {
    const from = prevRef.current
    prevRef.current = target
    if (from === target) return
    let startTs = 0
    const step = (ts: number) => {
      if (!startTs) startTs = ts
      const p = Math.min((ts - startTs) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 4)
      setCount(Math.round(from + (target - from) * eased))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])
  return count
}

interface StatConfig {
  icon: LucideIcon
  label: string
  color: string
  bg: string
  border: string
}

const STATS: StatConfig[] = [
  { icon: Users,      label: 'Players online',  color: 'text-accent',   bg: 'bg-accent/10',   border: 'border-accent/20' },
  { icon: Activity,   label: 'Active systems',  color: 'text-accent-2', bg: 'bg-accent-2/10', border: 'border-accent-2/20' },
  { icon: ServerIcon, label: 'Servers',          color: 'text-success',  bg: 'bg-success/10',  border: 'border-success/20' },
  { icon: Globe,      label: 'Regions',          color: 'text-warning',  bg: 'bg-warning/10',  border: 'border-warning/20' },
]

function StatCard({
  icon: Icon, label, value, color, bg, border,
}: StatConfig & { value: number }) {
  const count = useCountUp(value)

  return (
    <div className="fx-card-hover group relative flex items-center gap-3.5 overflow-hidden rounded-[var(--radius-app)] border border-border bg-surface/70 px-4 py-3.5 backdrop-blur-sm transition-all duration-300 hover:border-border/80">
      {/* Subtle shimmer on load */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/[0.03] to-transparent transition-transform duration-700 group-hover:translate-x-full" />

      <div className={`shrink-0 rounded-xl border ${border} ${bg} p-2.5 transition-transform duration-300 group-hover:scale-110 ${color}`}>
        <Icon className="size-[18px]" strokeWidth={2} />
      </div>

      <div className="min-w-0 leading-none">
        <div className={`font-num text-[22px] font-bold tabular-nums leading-none ${color}`}>
          {count.toLocaleString()}
        </div>
        <div className="mt-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted">
          {label}
        </div>
      </div>
    </div>
  )
}

export function StatsBar({ servers, games }: { servers: Server[]; games: GameEntry[] }) {
  const totalPlayers = servers.reduce((sum, s) => sum + s.current_players, 0)
  const regions = new Set(servers.map((s) => s.location)).size
  const values = [totalPlayers, games.length, servers.length, regions]

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {STATS.map((cfg, i) => (
        <StatCard key={cfg.label} {...cfg} value={values[i]} />
      ))}
    </div>
  )
}
