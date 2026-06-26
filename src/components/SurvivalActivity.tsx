// ─── Survival Activity ────────────────────────────────────────────────────────
// Historical view of all survival players tracked across all regions.
// Data accumulates in IndexedDB as long as the app is open and polling.

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Database,
  RefreshCw,
  Search,
  Shield,
  Swords,
  Users,
  X,
} from 'lucide-react'
import {
  queryActivity,
  fmtDuration,
  fmtRelative,
  type PlayerAggregate,
} from '../lib/survivalTracker'
import { getPlayerEcpMap } from '../lib/db'
import type { PlayerCustom } from '../lib/players'
import { PlayerActivityModal } from './PlayerActivityModal'
import { ClanDetailModal, type ClanAggregate } from './ClanDetailModal'
import { useClans, detectClanTag } from '../store/clans'
import { EcpBadge } from './EcpBadge'
import { CheatBadge } from './CheatBadge'
import { analyzeEcp, isLowercaseName } from '../lib/ecpDetect'
import { ErrorBoundary } from './ErrorBoundary'

// ── Period picker ─────────────────────────────────────────────────────────────

const PERIODS = [
  { label: '24h',  ms: 24 * 3600_000 },
  { label: '7d',   ms: 7 * 86_400_000 },
  { label: '30d',  ms: 30 * 86_400_000 },
  { label: 'All',  ms: 0 },
] as const
type PeriodLabel = (typeof PERIODS)[number]['label']

// ── Sort options ──────────────────────────────────────────────────────────────

type SortKey = 'kills' | 'time' | 'sessions' | 'score' | 'lastSeen'
type ClanSortKey = 'kills' | 'time' | 'members' | 'lastSeen'

function sorted(players: PlayerAggregate[], key: SortKey, asc: boolean): PlayerAggregate[] {
  const k = (p: PlayerAggregate): number => {
    switch (key) {
      case 'kills':    return p.totalKills
      case 'time':     return p.totalDurationMs
      case 'sessions': return p.sessionCount
      case 'score':    return p.maxScore
      case 'lastSeen': return p.lastSeen
    }
  }
  return [...players].sort((a, b) => (asc ? k(a) - k(b) : k(b) - k(a)))
}

// ── Table header cell ─────────────────────────────────────────────────────────

// Shared column template — must match PlayerRow's grid exactly.
const COL_GRID = 'grid-cols-[2rem_1fr_3.5rem_4rem_3rem_5.5rem]'

function TH({
  label,
  col,
  active,
  asc,
  align = 'right',
  onClick,
}: {
  label: string
  col: SortKey
  active: boolean
  asc: boolean
  align?: 'left' | 'right'
  onClick: (col: SortKey) => void
}) {
  return (
    <button
      onClick={() => onClick(col)}
      className={`flex w-full items-center gap-0.5 text-[10px] uppercase tracking-wide transition-colors ${
        align === 'right' ? 'justify-end' : 'justify-start'
      } ${active ? 'text-accent' : 'text-muted hover:text-text'}`}
    >
      {label}
      {active ? (
        asc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
      ) : null}
    </button>
  )
}

// ── Player row ────────────────────────────────────────────────────────────────

// React.memo: only re-renders when props actually change (avoids re-rendering
// every row when parent state changes, e.g. on load() completing).
const PlayerRow = memo(function PlayerRow({
  player,
  rank,
  clanTags,
  latestBadge,
  onClick,
}: {
  player: PlayerAggregate
  rank: number
  clanTags: string[]
  latestBadge: PlayerCustom | null
  onClick: () => void
}) {
  const regionBadges = player.regions.slice(0, 2)
  const clan = detectClanTag(player.playerName, clanTags)

  return (
    <button
      onClick={onClick}
      className={`grid w-full ${COL_GRID} items-center gap-3 border-b border-border/40 px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-2/60 transition-colors`}
    >
      {/* Rank */}
      <span className={`text-center text-xs font-bold tabular-nums ${
        rank === 1 ? 'text-[#ffd24a]' :
        rank === 2 ? 'text-[#cdd4dc]' :
        rank === 3 ? 'text-[#cd8b54]' : 'text-muted'
      }`}>
        {rank}
      </span>

      {/* Name + clan badge + regions */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          {latestBadge && <EcpBadge custom={latestBadge} size={14} />}
          <span className={`truncate font-medium ${latestBadge ? 'text-accent' : 'text-text'}`}>{player.playerName}</span>
          <CheatBadge custom={latestBadge} playerName={player.playerName} />
          {clan && (
            <span className="shrink-0 rounded bg-accent-soft px-1 py-0.5 text-[10px] font-semibold text-accent">
              {clan}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {regionBadges.map((r) => (
            <span key={r} className="text-[10px] text-muted">{r}</span>
          ))}
          {player.regions.length > 2 && (
            <span className="text-[10px] text-muted">+{player.regions.length - 2}</span>
          )}
        </div>
      </div>

      {/* Kills */}
      <span className="text-right tabular-nums font-semibold text-accent">
        {player.totalKills > 0 ? player.totalKills : <span className="text-muted font-normal">—</span>}
      </span>

      {/* Time */}
      <span className="text-right tabular-nums text-muted text-xs">
        {fmtDuration(player.totalDurationMs)}
      </span>

      {/* Sessions */}
      <span className="text-right tabular-nums text-muted text-xs">
        {player.sessionCount}
      </span>

      {/* Last seen */}
      <span className="text-right text-xs text-muted">
        {fmtRelative(player.lastSeen)}
      </span>
    </button>
  )
})

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

export function SurvivalActivity({ onClose }: Props) {
  const [period, setPeriod] = useState<PeriodLabel>('7d')
  const [loading, setLoading] = useState(false)
  const [players, setPlayers] = useState<PlayerAggregate[]>([])
  const [totalObs, setTotalObs] = useState(0)
  const [hasHistory, setHasHistory] = useState(false)
  // Shared ECP badge map: playerName_lower → latest custom object (from Supabase)
  const [ecpMap, setEcpMap] = useState<Map<string, PlayerCustom>>(new Map())
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('kills')
  const [sortAsc, setSortAsc] = useState(false)
  const [tab, setTab] = useState<'players' | 'clans'>('players')
  const [selected, setSelected] = useState<PlayerAggregate | null>(null)
  const [selectedClan, setSelectedClan] = useState<ClanAggregate | null>(null)
  const [clanSortKey, setClanSortKey] = useState<ClanSortKey>('kills')
  const [clanSortAsc, setClanSortAsc] = useState(false)
  const { tags: clanTags } = useClans()

  // Aggregate clan stats from the player list
  const clans = useMemo<ClanAggregate[]>(() => {
    if (!clanTags.length) return []
    const map = new Map<string, ClanAggregate>()
    for (const p of players) {
      const tag = detectClanTag(p.playerName, clanTags)
      if (!tag) continue
      let c = map.get(tag)
      if (!c) {
        c = { tag, members: [], totalKills: 0, totalDurationMs: 0, sessionCount: 0, maxScore: 0, lastSeen: 0, regions: [] }
        map.set(tag, c)
      }
      c.members.push(p)
      c.totalKills += p.totalKills
      c.totalDurationMs += p.totalDurationMs
      c.sessionCount += p.sessionCount
      c.maxScore = Math.max(c.maxScore, p.maxScore)
      c.lastSeen = Math.max(c.lastSeen, p.lastSeen)
      for (const r of p.regions) if (!c.regions.includes(r)) c.regions.push(r)
    }
    return [...map.values()]
  }, [players, clanTags])

  const sortedClans = useMemo(() => {
    const k = (c: ClanAggregate): number => {
      switch (clanSortKey) {
        case 'kills':    return c.totalKills
        case 'time':     return c.totalDurationMs
        case 'members':  return c.members.length
        case 'lastSeen': return c.lastSeen
      }
    }
    return [...clans].sort((a, b) => clanSortAsc ? k(a) - k(b) : k(b) - k(a))
  }, [clans, clanSortKey, clanSortAsc])

  const toggleClanSort = (key: ClanSortKey) => {
    if (clanSortKey === key) setClanSortAsc((v) => !v)
    else { setClanSortKey(key); setClanSortAsc(false) }
  }

  const periodMs = PERIODS.find((p) => p.label === period)!.ms

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const since = periodMs === 0 ? 0 : Date.now() - periodMs
      // Load activity data and ECP badges in parallel
      const [result, newEcpMap] = await Promise.all([
        queryActivity(since),
        getPlayerEcpMap(),
      ])
      setPlayers(result.players)
      setTotalObs(result.totalObservations)
      setHasHistory(result.hasHistory ?? false)
      if (newEcpMap.size > 0) setEcpMap(newEcpMap)
    } catch (err) {
      console.error('[SurvivalActivity] query failed', err)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [periodMs])

  useEffect(() => {
    void load()
    const id = setInterval(() => { void load(true) }, 5 * 60_000)
    return () => clearInterval(id)
  }, [load])

  type EcpFilter = 'all' | 'ecp' | 'no-ecp' | 'modified'
  const [ecpFilter, setEcpFilter] = useState<EcpFilter>('all')
  // Pagination: show rows in batches of PAGE_SIZE to avoid rendering 1000+ rows at once
  const PAGE_SIZE = 100
  const [displayLimit, setDisplayLimit] = useState(PAGE_SIZE)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(false) }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let base = q ? players.filter((p) => p.playerName.toLowerCase().includes(q)) : players
    if (ecpFilter === 'ecp')
      base = base.filter((p) => ecpMap.has(p.playerName.toLowerCase().trim()))
    else if (ecpFilter === 'no-ecp')
      base = base.filter((p) => !ecpMap.has(p.playerName.toLowerCase().trim()))
    else if (ecpFilter === 'modified') {
      base = base.filter((p) => {
        const custom = ecpMap.get(p.playerName.toLowerCase().trim()) ?? null
        const a = analyzeEcp(custom)
        return (a !== null && a.overall !== 'clean') || isLowercaseName(p.playerName)
      })
    }
    return sorted(base, sortKey, sortAsc)
  }, [players, search, sortKey, sortAsc, ecpFilter, ecpMap])

  // Reset pagination when filter/sort/search changes
  useEffect(() => { setDisplayLimit(PAGE_SIZE) }, [filtered])

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="animate-fade-up mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden sm:my-4 sm:h-[calc(100vh-2rem)] sm:rounded-[var(--radius-app)] border border-border bg-surface shadow-2xl"
        >
          {/* ── Header ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <Activity className="size-5 text-accent shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-bold text-text">Survival Activity</h2>
              <p className="text-xs text-muted">
                {players.length > 0 || hasHistory
                  ? <>
                      {players.length} players · {clans.length} clans
                      {totalObs > 0 && <span className="ml-1 opacity-60">· {totalObs.toLocaleString()} obs</span>}
                      {hasHistory && period === 'All' && <span className="ml-1 text-accent-2">· archived</span>}
                    </>
                  : 'Browse survival servers to start collecting data'}
              </p>
            </div>

            {/* Tab switcher */}
            <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-0.5">
              <button
                onClick={() => setTab('players')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'players' ? 'bg-accent text-bg' : 'text-muted hover:text-text'}`}
              >
                <Users className="size-3.5" /> Players
              </button>
              <button
                onClick={() => setTab('clans')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${tab === 'clans' ? 'bg-accent text-bg' : 'text-muted hover:text-text'}`}
              >
                <Shield className="size-3.5" /> Clans
                {clans.length > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tab === 'clans' ? 'bg-bg/30 text-bg' : 'bg-accent text-bg'}`}>
                    {clans.length}
                  </span>
                )}
              </button>
            </div>

            {/* Period tabs */}
            <div className="flex items-center gap-1">
              {PERIODS.map(({ label }) => (
                <button
                  key={label}
                  onClick={() => setPeriod(label)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    period === label
                      ? 'bg-accent text-bg'
                      : 'text-muted hover:text-text border border-border'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Refresh + close */}
            <button
              onClick={() => void load()}
              className={`rounded-md border border-border p-1.5 text-muted hover:text-text ${loading ? 'pointer-events-none' : ''}`}
              title="Refresh"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin text-accent' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="rounded-md border border-border p-1.5 text-muted hover:text-text"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* ── Body ──────────────────────────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">

            {/* Empty state */}
            {!loading && players.length === 0 && !hasHistory && (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted">
                <Database className="size-10 opacity-30" />
                <p className="text-sm font-medium text-text">No data yet</p>
                <p className="max-w-xs text-xs">
                  Open any survival server — player data will be recorded automatically
                  on every refresh. Come back after a few minutes.
                </p>
              </div>
            )}

            {/* ── Players tab ────────────────────────────────────────── */}
            {(players.length > 0 || hasHistory) && tab === 'players' && (
              <>
                {/* Search + ECP filter + count */}
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
                  {/* ECP filter chips */}
                  <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-2 p-0.5 shrink-0">
                    {(['all', 'ecp', 'no-ecp', 'modified'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setEcpFilter(f)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                          f === 'modified'
                            ? ecpFilter === f
                              ? 'bg-accent-2 text-bg'
                              : 'text-muted hover:text-accent-2'
                            : ecpFilter === f
                              ? 'bg-accent text-bg'
                              : 'text-muted hover:text-text'
                        }`}
                      >
                        {f === 'all' ? 'All' : f === 'ecp' ? 'ECP' : f === 'no-ecp' ? 'Non-ECP' : 'Modified'}
                      </button>
                    ))}
                  </div>
                  <span className="flex items-center gap-1 text-xs text-muted shrink-0">
                    <Users className="size-3.5" />
                    {filtered.length} players
                  </span>
                </div>

                {/* Table header */}
                <div className={`grid ${COL_GRID} items-center gap-3 border-b border-border bg-surface-2/50 px-3 py-2`}>
                  <span className="text-center text-[10px] uppercase tracking-wide text-muted">#</span>
                  <TH label="Player"    col="kills"    active={sortKey === 'kills'}    asc={sortAsc} align="left"  onClick={toggleSort} />
                  <TH label="Kills"     col="kills"    active={sortKey === 'kills'}    asc={sortAsc} onClick={toggleSort} />
                  <TH label="Time"      col="time"     active={sortKey === 'time'}     asc={sortAsc} onClick={toggleSort} />
                  <TH label="Sessions"  col="sessions" active={sortKey === 'sessions'} asc={sortAsc} onClick={toggleSort} />
                  <TH label="Last seen" col="lastSeen" active={sortKey === 'lastSeen'} asc={sortAsc} onClick={toggleSort} />
                </div>

                {/* Rows — paginated to avoid rendering 1000+ nodes at once */}
                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="flex h-32 items-center justify-center">
                      <RefreshCw className="size-5 animate-spin text-accent" />
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted">
                      <Swords className="size-4" />
                      No players match this search.
                    </div>
                  ) : (
                    <ErrorBoundary>
                      {filtered.slice(0, displayLimit).map((p, i) => (
                        <PlayerRow
                          key={p.playerName}
                          player={p}
                          rank={i + 1}
                          clanTags={clanTags}
                          latestBadge={ecpMap.get(p.playerName.toLowerCase().trim()) ?? null}
                          onClick={() => setSelected(p)}
                        />
                      ))}
                      {displayLimit < filtered.length && (
                        <button
                          onClick={() => setDisplayLimit((n) => n + PAGE_SIZE)}
                          className="w-full py-3 text-xs text-muted hover:text-text transition-colors border-t border-border"
                        >
                          Show more — {filtered.length - displayLimit} remaining
                        </button>
                      )}
                    </ErrorBoundary>
                  )}
                </div>
              </>
            )}

            {/* ── Clans tab ──────────────────────────────────────────────── */}
            {(players.length > 0 || hasHistory) && tab === 'clans' && (
              <>
                {/* Clan table header */}
                <div className="grid grid-cols-[2rem_1fr_3.5rem_4rem_3rem_5.5rem] items-center gap-3 border-b border-border bg-surface-2/50 px-3 py-2">
                  <span className="text-center text-[10px] uppercase tracking-wide text-muted">#</span>
                  <span className="text-[10px] uppercase tracking-wide text-muted">Clan</span>
                  {(['kills', 'time', 'members', 'lastSeen'] as ClanSortKey[]).map((col) => (
                    <button
                      key={col}
                      onClick={() => toggleClanSort(col)}
                      className={`flex w-full items-center justify-end gap-0.5 text-[10px] uppercase tracking-wide transition-colors ${clanSortKey === col ? 'text-accent' : 'text-muted hover:text-text'}`}
                    >
                      {col === 'kills' ? 'Kills' : col === 'time' ? 'Time' : col === 'members' ? 'Members' : 'Last seen'}
                      {clanSortKey === col ? (clanSortAsc ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />) : null}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto">
                  {clans.length === 0 ? (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center text-muted">
                      <Shield className="size-8 opacity-30" />
                      <p className="text-sm font-medium text-text">No clans detected</p>
                      <p className="max-w-xs text-xs">
                        Add clan tags via the Clan Management button in the header, then come back here.
                      </p>
                    </div>
                  ) : (
                    sortedClans.map((clan, i) => (
                      <button
                        key={clan.tag}
                        onClick={() => setSelectedClan(clan)}
                        className="grid w-full grid-cols-[2rem_1fr_3.5rem_4rem_3rem_5.5rem] items-center gap-3 border-b border-border/40 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-surface-2/60 transition-colors"
                      >
                        <span className={`text-center text-xs font-bold tabular-nums ${i === 0 ? 'text-[#ffd24a]' : i === 1 ? 'text-[#cdd4dc]' : i === 2 ? 'text-[#cd8b54]' : 'text-muted'}`}>
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <span className="rounded bg-accent-soft px-1.5 py-0.5 font-mono text-sm font-bold text-accent">
                            {clan.tag}
                          </span>
                          <span className="ml-2 text-xs text-muted">{clan.regions.join(' · ')}</span>
                        </div>
                        <span className="text-right tabular-nums font-semibold text-accent">
                          {clan.totalKills > 0 ? clan.totalKills : <span className="font-normal text-muted">—</span>}
                        </span>
                        <span className="text-right tabular-nums text-xs text-muted">{fmtDuration(clan.totalDurationMs)}</span>
                        <span className="text-right tabular-nums text-xs text-muted">{clan.members.length}</span>
                        <span className="text-right text-xs text-muted">{fmtRelative(clan.lastSeen)}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Player detail */}
      {selected && (
        <PlayerActivityModal
          player={selected}
          ecpCustom={ecpMap.get(selected.playerName.toLowerCase().trim()) ?? null}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Clan detail */}
      {selectedClan && (
        <ClanDetailModal
          clan={selectedClan}
          onClose={() => setSelectedClan(null)}
        />
      )}
    </>
  )
}
