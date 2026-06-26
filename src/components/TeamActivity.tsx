// ─── Team Mode Activity ───────────────────────────────────────────────────────

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ChevronDown, ChevronUp, Database, RefreshCw, Search, Users, X } from 'lucide-react'
import {
  queryTeamActivity,
  fmtDuration,
  fmtRelative,
  type TeamPlayerAggregate,
} from '../lib/teamTracker'

// ── Period picker ─────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '24h', ms: 24 * 3600_000 },
  { label: '7d',  ms: 7 * 86_400_000 },
  { label: '30d', ms: 30 * 86_400_000 },
  { label: 'All', ms: 0 },
] as const
type PeriodLabel = (typeof PERIODS)[number]['label']

// ── Sort ──────────────────────────────────────────────────────────────────────

type SortKey = 'score' | 'time' | 'sessions' | 'lastSeen'

function sortPlayers(players: TeamPlayerAggregate[], key: SortKey, asc: boolean) {
  const k = (p: TeamPlayerAggregate): number => {
    switch (key) {
      case 'score':    return p.maxScore
      case 'time':     return p.totalDurationMs
      case 'sessions': return p.sessionCount
      case 'lastSeen': return p.lastSeen
    }
  }
  return [...players].sort((a, b) => asc ? k(a) - k(b) : k(b) - k(a))
}

// ── Column layout ─────────────────────────────────────────────────────────────

const COL_GRID = 'grid-cols-[2rem_1fr_4.5rem_4rem_3rem_5.5rem]'

function TH({
  label, col, active, asc, align = 'right', onClick,
}: {
  label: string; col: SortKey; active: boolean; asc: boolean
  align?: 'left' | 'right'; onClick: (c: SortKey) => void
}) {
  return (
    <button
      onClick={() => onClick(col)}
      className={`flex w-full items-center gap-0.5 text-[10px] uppercase tracking-wide transition-colors ${
        align === 'right' ? 'justify-end' : 'justify-start'
      } ${active ? 'text-accent' : 'text-muted hover:text-text'}`}
    >
      {label}
      {active ? (asc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />) : null}
    </button>
  )
}

// ── Player row ────────────────────────────────────────────────────────────────

const PlayerRow = memo(function PlayerRow({
  player, rank,
}: {
  player: TeamPlayerAggregate
  rank: number
}) {
  const MEDAL = ['#ffd24a', '#cdd4dc', '#cd8b54']
  return (
    <div className={`grid w-full ${COL_GRID} items-center gap-3 border-b border-border/40 px-3 py-2 text-sm last:border-0`}>
      <span
        className="text-center text-xs font-bold tabular-nums"
        style={{ color: rank <= 3 ? MEDAL[rank - 1] : undefined }}
      >
        {rank}
      </span>

      <div className="min-w-0">
        <span className="truncate font-medium text-text">{player.playerName}</span>
        <div className="flex items-center gap-1 mt-0.5">
          {player.regions.slice(0, 2).map((r) => (
            <span key={r} className="text-[10px] text-muted">{r}</span>
          ))}
          {player.regions.length > 2 && (
            <span className="text-[10px] text-muted">+{player.regions.length - 2}</span>
          )}
        </div>
      </div>

      <span className="text-right tabular-nums font-semibold text-accent">
        {player.maxScore > 0 ? player.maxScore.toLocaleString() : <span className="text-muted font-normal">—</span>}
      </span>

      <span className="text-right tabular-nums text-muted text-xs">
        {fmtDuration(player.totalDurationMs)}
      </span>

      <span className="text-right tabular-nums text-muted text-xs">
        {player.sessionCount}
      </span>

      <span className="text-right text-xs text-muted">
        {fmtRelative(player.lastSeen)}
      </span>
    </div>
  )
})

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

const PAGE_SIZE = 100

export function TeamActivity({ onClose }: Props) {
  const [period, setPeriod] = useState<PeriodLabel>('7d')
  const [loading, setLoading] = useState(false)
  const [players, setPlayers] = useState<TeamPlayerAggregate[]>([])
  const [totalObs, setTotalObs] = useState(0)
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('score')
  const [sortAsc, setSortAsc] = useState(false)
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)

  const periodMs = PERIODS.find((p) => p.label === period)!.ms

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const since = periodMs === 0 ? 0 : Date.now() - periodMs
      const result = await queryTeamActivity(since)
      setPlayers(result.players)
      setTotalObs(result.totalObservations)
    } catch (err) {
      console.error('[TeamActivity] query failed', err)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [periodMs])

  useEffect(() => {
    void load()
    const id = setInterval(() => { void load(true) }, 60_000)
    return () => clearInterval(id)
  }, [load])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = q ? players.filter((p) => p.playerName.toLowerCase().includes(q)) : players
    return sortPlayers(base, sortKey, sortAsc)
  }, [players, search, sortKey, sortAsc])

  useEffect(() => { setDisplayLimit(PAGE_SIZE) }, [filtered])

  const hasData = players.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden sm:my-4 sm:h-[calc(100vh-2rem)] sm:rounded-[var(--radius-app)] border border-border bg-surface shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Activity className="size-5 text-accent shrink-0" />
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text">Team Activity</h2>
            <p className="text-xs text-muted">
              {hasData
                ? <>{players.length} players{totalObs > 0 && <span className="ml-1 opacity-60">· {totalObs.toLocaleString()} obs</span>}</>
                : 'Browse team servers to start collecting data'}
            </p>
          </div>

          {/* Period tabs */}
          <div className="ml-auto flex items-center gap-1">
            {PERIODS.map(({ label }) => (
              <button
                key={label}
                onClick={() => setPeriod(label)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === label ? 'bg-accent text-bg' : 'text-muted hover:text-text border border-border'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={() => void load()}
            className={`rounded-md border border-border p-1.5 text-muted hover:text-text ${loading ? 'pointer-events-none' : ''}`}
            title="Refresh"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin text-accent' : ''}`} />
          </button>
          <button onClick={onClose} className="rounded-md border border-border p-1.5 text-muted hover:text-text">
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

          {/* Empty state */}
          {!loading && !hasData && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted">
              <Database className="size-10 opacity-30" />
              <p className="text-sm font-medium text-text">No data yet</p>
              <p className="max-w-xs text-xs">
                Open any team mode server — player data will be recorded automatically on every refresh.
              </p>
            </div>
          )}

          {hasData && (
            <>
              {/* Search + count */}
              <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search player name…"
                    className="w-full rounded-md border border-border bg-surface-2 py-1.5 pl-8 pr-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <span className="flex items-center gap-1 text-xs text-muted shrink-0">
                  <Users className="size-3.5" />
                  {filtered.length} players
                </span>
              </div>

              {/* Table header */}
              <div className={`grid ${COL_GRID} items-center gap-3 border-b border-border bg-surface-2/50 px-3 py-2`}>
                <span className="text-center text-[10px] uppercase tracking-wide text-muted">#</span>
                <TH label="Player"    col="score"    active={sortKey === 'score'}    asc={sortAsc} align="left"  onClick={toggleSort} />
                <TH label="Best score" col="score"   active={sortKey === 'score'}    asc={sortAsc} onClick={toggleSort} />
                <TH label="Time"      col="time"     active={sortKey === 'time'}     asc={sortAsc} onClick={toggleSort} />
                <TH label="Sessions"  col="sessions" active={sortKey === 'sessions'} asc={sortAsc} onClick={toggleSort} />
                <TH label="Last seen" col="lastSeen" active={sortKey === 'lastSeen'} asc={sortAsc} onClick={toggleSort} />
              </div>

              {/* Rows */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex h-32 items-center justify-center">
                    <RefreshCw className="size-5 animate-spin text-accent" />
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted">
                    No players match this search.
                  </div>
                ) : (
                  <>
                    {filtered.slice(0, displayLimit).map((p, i) => (
                      <PlayerRow key={p.playerName} player={p} rank={i + 1} />
                    ))}
                    {displayLimit < filtered.length && (
                      <button
                        onClick={() => setDisplayLimit((n) => n + PAGE_SIZE)}
                        className="w-full py-3 text-xs text-muted hover:text-text transition-colors border-t border-border"
                      >
                        Show more — {filtered.length - displayLimit} remaining
                      </button>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
