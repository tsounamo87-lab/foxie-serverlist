import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Map as MapIcon, Search, SearchX, Trophy, TrendingUp, WifiOff, Zap } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Header } from './components/Header'
import { StatsBar } from './components/StatsBar'
import { FilterBar } from './components/FilterBar'
import { ServerCard } from './components/ServerCard'
import { ServerTable } from './components/ServerTable'
import { ServerDetailModal } from './components/ServerDetailModal'
import { SettingsPanel } from './components/SettingsPanel'
import { AlertsPanel } from './components/AlertsPanel'
import { Toaster } from './components/Toaster'
import { CursorFx } from './components/CursorFx'
import { ThreeBg } from './components/ThreeBg'
import { PremiumCursor } from './components/PremiumCursor'
import { HeroSection } from './components/HeroSection'
import { PopulationChart } from './components/charts'
import { useGames } from './lib/useGames'
import { usePlayers } from './lib/usePlayers'
import { enrichGames, type EnrichedGame } from './lib/players'
import { applyFilters, useFilters } from './store/filters'
import { applySettings, useSettings } from './store/settings'
import { useHistory } from './store/history'
import { useAlerts } from './store/alerts'
import { useToasts } from './store/toasts'
import { Sounds } from './lib/sounds'
import { SurvivalActivity } from './components/SurvivalActivity'
import { TeamActivity } from './components/TeamActivity'
import { recordSnapshot } from './lib/survivalTracker'
import { recordTeamSnapshot } from './lib/teamTracker'
import { useClans } from './store/clans'
import { ClanManager } from './components/ClanManager'
import { useCustom } from './store/custom'
import { Leaderboard } from './components/Leaderboard'
import { FindGame } from './components/FindGame'
import { GlobalSearch } from './components/GlobalSearch'
import { WorldMap } from './components/WorldMap'

function App() {
  const { theme, font, effects, radiusStyle, refreshSeconds } = useSettings()
  const { servers, games, loading, error, fetchedAt, countdown, refresh } = useGames(refreshSeconds)

  // Declare selected first — needed to pause pixelmelt polling when modal is open.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [activityOpen, setActivityOpen] = useState(false)
  const [teamActivityOpen, setTeamActivityOpen] = useState(false)
  const [clanManagerOpen, setClanManagerOpen] = useState(false)
  const [showTrends, setShowTrends] = useState(false)
  const [showWorldMap, setShowWorldMap] = useState(false)
  const [leaderboardOpen, setLeaderboardOpen] = useState(false)
  const [findGameOpen, setFindGameOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [selected, setSelected] = useState<EnrichedGame | null>(null)

  const { data: playerData, available: playersAvailable } = usePlayers(refreshSeconds)
  const filters = useFilters()
  const rules = useAlerts((s) => s.rules)
  const globalHistory = useHistory((s) => s.global)

  // Sync clan tags from JSONBin on first load
  const syncClans = useClans((s) => s.syncFromRemote)
  useEffect(() => { void syncClans() }, [syncClans])

  // Keep <html> data-* attributes in sync with settings.
  useEffect(() => {
    applySettings({ theme, font, effects, radiusStyle })
  }, [theme, font, effects, radiusStyle])

  const customKeys = useCustom((s) => s.keys)

  // "Custom" games have two origins:
  //   1. system.unlisted === true from simstatus.json (published via SV+ "Publish" button)
  //      → same source as dankdmitron.dev, both sites show them automatically
  //   2. Manually added keys via "Share Custom Game" (local only)
  const enriched = useMemo(() => {
    const base = enrichGames(games, playerData)
    const customSet = new Set(customKeys)

    // Mark games: unlisted (SV+ published) OR manually shared by user
    const marked = base.map((g) =>
      g.unlisted || customSet.has(g.key) ? { ...g, isCustom: true } : g
    )

    // Stub entries for manually-shared keys not currently in simstatus
    const existingKeys = new Set(base.map((g) => g.key))
    const stubs: EnrichedGame[] = customKeys
      .filter((k) => !existingKeys.has(k))
      .map((k) => {
        const [idStr, address] = k.split('@')
        return {
          id: parseInt(idStr) || 0,
          name: `Custom #${idStr}`,
          mode: 'custom',
          players: 0,
          unlisted: true,
          open: false,
          survival: false,
          time: 0,
          criminal_activity: 0,
          location: 'Unknown',
          address: address ?? '',
          key: k,
          joinUrl: `https://starblast.io/#${k}`,
          isCustom: true,
        }
      })

    return [...marked, ...stubs]
  }, [games, playerData, customKeys])

  const visible = useMemo(() => applyFilters(enriched, filters), [enriched, filters])

  // ── Keyboard shortcuts (after visible is declared) ──────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        setSelected(null); setSearchOpen(false); setLeaderboardOpen(false)
        setFindGameOpen(false); setSettingsOpen(false); setAlertsOpen(false)
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true) }
      if (e.key === 'f' && !e.ctrlKey && !e.metaKey) setFindGameOpen(true)
      if (e.key === 'l' && !e.ctrlKey && !e.metaKey) setLeaderboardOpen(true)
      if (e.key === 'j') setSelected(prev => { if (prev) { window.open(prev.joinUrl, '_blank'); return prev } return prev })
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && visible.length) {
        e.preventDefault()
        setSelected(prev => {
          if (!prev) return visible[0]
          const idx = visible.findIndex((g: EnrichedGame) => g.key === prev.key)
          if (e.key === 'ArrowDown') return visible[Math.min(idx + 1, visible.length - 1)]
          return visible[Math.max(idx - 1, 0)]
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // On each server-list refresh: record history + evaluate alerts.
  useEffect(() => {
    if (!fetchedAt) return
    const totalPlayers = servers.reduce((sum, s) => sum + s.current_players, 0)
    const perSystem: [string, number][] = enriched.map((g) => [
      g.key,
      g.livePlayers ? g.livePlayers.length : g.players,
    ])
    useHistory.getState().record(totalPlayers, games.length, perSystem)

    const events = useAlerts.getState().check(enriched, playerData?.byKey ?? null)
    for (const ev of events) {
      useToasts.getState().push({ message: ev.message, detail: ev.detail })
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(ev.message, { body: ev.detail })
      }
    }

    void recordSnapshot(enriched, fetchedAt)
    void recordTeamSnapshot(enriched, fetchedAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchedAt])

  // Keep the open modal's player data fresh as polls come in.
  useEffect(() => {
    if (!selected) return
    const fresh = enriched.find((g) => g.key === selected.key)
    if (fresh && fresh !== selected) setSelected(fresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enriched])

  return (
    <>
    <ThreeBg />
    <div className="relative z-10 min-h-screen">
      <Header
        loading={loading}
        countdown={countdown}
        alertCount={rules.filter((r) => r.enabled).length}
        onRefresh={refresh}
        onOpenSettings={() => { Sounds.open(); setSettingsOpen(true) }}
        onOpenAlerts={() => { Sounds.open(); setAlertsOpen(true) }}
        onOpenActivity={() => { Sounds.open(); setActivityOpen(true) }}
        onOpenTeamActivity={() => { Sounds.open(); setTeamActivityOpen(true) }}
        onOpenClans={() => { Sounds.open(); setClanManagerOpen(true) }}
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6">
        <HeroSection
          totalPlayers={servers.reduce((s, srv) => s + srv.current_players, 0)}
          activeGames={games.length}
        />
        <StatsBar servers={servers} games={games} />

        {/* Live-data availability + toolbar */}
        <motion.div
          className="flex flex-wrap items-center gap-2 text-xs"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
        >
          {!playersAvailable && (
            <span className="flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-warning">
              <WifiOff className="size-3.5" />
              Live player feed unavailable — showing official counts only
            </span>
          )}
          <ToolbarPill icon={<TrendingUp className="size-3.5" />} label={showTrends ? 'Hide trends' : 'Trends'} active={showTrends} onClick={() => setShowTrends((v) => !v)} />
          <ToolbarPill icon={<MapIcon className="size-3.5" />} label="World map" active={showWorldMap} onClick={() => setShowWorldMap(v => !v)} />
          <ToolbarPill icon={<Trophy className="size-3.5" />} label="Leaderboard" active={false} onClick={() => setLeaderboardOpen(true)} />
          <ToolbarPill icon={<Zap className="size-3.5" />} label="Find game" active={false} onClick={() => setFindGameOpen(true)} kbd="F" />
          <ToolbarPill icon={<Search className="size-3.5" />} label="Find player" active={false} onClick={() => setSearchOpen(true)} kbd="⌘K" />
        </motion.div>

        {showTrends && (
          <div className="rounded-[var(--radius-app)] border border-border bg-surface/70 p-4 backdrop-blur">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Total players online over time
            </div>
            <PopulationChart samples={globalHistory} height={140} />
          </div>
        )}
        {showWorldMap && (
          <WorldMap
            games={enriched}
            totalPlayersOverride={servers.reduce((sum, s) => sum + s.current_players, 0)}
            onFilterRegion={(r) => { filters.setRegion(r as 'America' | 'Europe' | 'Asia') }}
            onOpenGame={(g) => { Sounds.open(); setSelected(g) }}
          />
        )}

        <FilterBar />

        {error && (
          <div className="flex items-center gap-2 rounded-[var(--radius-app)] border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
            <AlertTriangle className="size-4" />
            Failed to load server data: {error}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-muted">
          <span>
            Showing <span className="font-semibold text-text">{visible.length}</span> of{' '}
            {games.length} systems
          </span>
        </div>

        {/* Results */}
        {loading && games.length === 0 ? (
          <SkeletonGrid />
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center text-muted">
            <SearchX className="size-8" />
            <p className="text-sm">No systems match your filters.</p>
          </div>
        ) : filters.view === 'table' ? (
          <ServerTable games={visible} onOpen={(g) => { Sounds.open(); setSelected(g) }} />
        ) : filters.view === 'grouped' ? (
          <GroupedView games={visible} onOpen={(g) => { Sounds.open(); setSelected(g) }} />
        ) : (
          <CardGrid games={visible} onOpen={(g) => { Sounds.open(); setSelected(g) }} />
        )}
      </main>

      <SettingsPanel open={settingsOpen} onClose={() => { Sounds.close(); setSettingsOpen(false) }} />
      <AlertsPanel open={alertsOpen} onClose={() => { Sounds.close(); setAlertsOpen(false) }} />
      <Toaster />
      {selected && <ServerDetailModal game={selected} onClose={() => { Sounds.close(); setSelected(null) }} />}
      {activityOpen && <SurvivalActivity onClose={() => { Sounds.close(); setActivityOpen(false) }} />}
      {teamActivityOpen && <TeamActivity onClose={() => { Sounds.close(); setTeamActivityOpen(false) }} />}
      {clanManagerOpen && <ClanManager onClose={() => { Sounds.close(); setClanManagerOpen(false) }} />}
      {leaderboardOpen && <Leaderboard games={enriched} onClose={() => setLeaderboardOpen(false)} onOpenGame={(g) => { Sounds.open(); setSelected(g) }} />}
      {findGameOpen && <FindGame games={enriched} onClose={() => setFindGameOpen(false)} onOpen={(g) => { Sounds.open(); setSelected(g) }} />}
      {searchOpen && <GlobalSearch games={enriched} onOpenGame={(g) => { Sounds.open(); setSelected(g) }} onClose={() => setSearchOpen(false)} />}
      <CursorFx />
      <PremiumCursor />
    </div>
    </>
  )
}

function CardGrid({ games, onOpen }: { games: EnrichedGame[]; onOpen: (g: EnrichedGame) => void }) {
  return (
    <AnimatePresence mode="popLayout">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {games.map((g, i) => (
          <motion.div
            key={g.key}
            initial={{ opacity: 0, y: 22, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94, y: -8 }}
            transition={{
              duration: 0.45,
              delay: Math.min(i * 0.03, 0.4),
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <ServerCard game={g} onOpen={() => onOpen(g)} />
          </motion.div>
        ))}
      </div>
    </AnimatePresence>
  )
}

// ── Toolbar pill button ───────────────────────────────────────────────────────

function ToolbarPill({
  icon, label, active, onClick, kbd,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  onClick: () => void
  kbd?: string
}) {
  return (
    <motion.button
      onClick={onClick}
      className={`toolbar-pill ${active ? 'active' : ''}`}
      whileHover={{ y: -1, scale: 1.03 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
    >
      {icon}
      {label}
      {kbd && (
        <kbd className="ml-0.5 rounded border border-current/20 px-1 text-[9px] opacity-60">
          {kbd}
        </kbd>
      )}
    </motion.button>
  )
}

function GroupedView({ games, onOpen }: { games: EnrichedGame[]; onOpen: (g: EnrichedGame) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, EnrichedGame[]>()
    for (const g of games) {
      const arr = map.get(g.location) ?? []
      arr.push(g)
      map.set(g.location, arr)
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length)
  }, [games])

  return (
    <div className="space-y-6">
      {groups.map(([region, list]) => (
        <section key={region}>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-text">{region}</h2>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
              {list.length} systems · {list.reduce((s: number, g) => s + (g.livePlayers?.length ?? g.players), 0)} players
            </span>
          </div>
          <CardGrid games={list} onOpen={onOpen} />
        </section>
      ))}
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="h-36 animate-pulse rounded-[var(--radius-app)] border border-border bg-surface/60"
        />
      ))}
    </div>
  )
}

export default App
