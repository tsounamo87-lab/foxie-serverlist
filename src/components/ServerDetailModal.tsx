import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, Copy, Database, ExternalLink, Maximize2, MapPin, Radio, ShieldAlert, Skull, Users, X } from 'lucide-react'
import { formatUptime, modeLabel } from '../lib/starblast'
import { playerColor, summarizePlayers, type EnrichedGame, type Player } from '../lib/players'
import { shipGlyph } from '../lib/ships'
import { useGameRelay } from '../lib/useGameRelay'
import { getLastRosterForServer } from '../lib/db'
import { useHistory } from '../store/history'
import { useClans, detectClanTag } from '../store/clans'
import { PlayerAvatar } from './PlayerAvatar'
import { GameMap } from './GameMap'
import { TeamSidebar } from './TeamSidebar'
import { PlayerList } from './PlayerList'
import { Sparkline } from './charts'

export function ServerDetailModal({
  game,
  onClose,
}: {
  game: EnrichedGame
  onClose: () => void
}) {
  const isSurvival = game.mode === 'survival'
  const history = useHistory((s) => s.perSystem[game.key])

  // Relay works for ALL modes — not just team.
  // For team: provides real positions + map + team stats.
  // For survival/invasion/modding: provides player names + positions (no team data).
  const relay = useGameRelay(game.key)

  // Treat modded games with team root-mode the same as native team mode.
  // The relay tells us via modeInfo.rootMode; Pixelmelt via seedInfo.rootMode.
  // Alien Intrusion, Nautic Series, U Series all fall into this category.
  // relay must be declared first — hence placed after useGameRelay().
  const relayRootIsTeam = relay.modeInfo?.rootMode === 'team'
  const seedRootIsTeam  = game.seedInfo?.rootMode   === 'team'
  const isTeam = game.mode === 'team' || relayRootIsTeam || seedRootIsTeam

  // Last known roster from Supabase for closed survival servers (pixelmelt stops
  // reporting players when a survival server closes to new joins).
  // We wait 2.5s before loading so the relay gets a chance to provide real-time
  // data first. If relay has data, we never load the stale DB snapshot.
  const [dbRoster, setDbRoster] = useState<Player[]>([])
  useEffect(() => {
    if (!isSurvival || game.open) { setDbRoster([]); return }
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      getLastRosterForServer(game.key).then((rows) => {
        if (cancelled) return
        // If the snapshot has MORE players than simstatus currently reports, it
        // was saved before the server closed (pre-survival roster). Discard it —
        // showing 10 stale names when only 7 are still playing is misleading.
        if (rows.length > game.players) return
        setDbRoster(
          rows.map((r, i) => ({
            id: i,
            player_name: r.playerName,
            kills: r.kills,
            deaths: 0,
            score: r.score,
            ship: 0, hue: 0, isAlive: true, x: 0, y: 0,
            custom: null, friendly: 0,
          }))
        )
      }).catch(() => {/* non-critical */})
    }, 2500)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [game.key, game.open, isSurvival])

  // If relay data arrives after the DB roster was already loaded, discard the
  // stale snapshot so relay data is the single source of truth.
  useEffect(() => {
    if (relay.players && relay.players.length > 0) setDbRoster([])
  }, [relay.players])

  // Cache the last non-empty player list so the roster stays visible while
  // the relay reconnects or before the DB fallback loads.
  const cachedPlayersRef = useRef<Player[]>([])
  const cachedGameKeyRef = useRef('')
  if (game.key !== cachedGameKeyRef.current) {
    cachedGameKeyRef.current = game.key
    cachedPlayersRef.current = []
  }

  // Map is only shown in team mode — showing positions in other modes is cheating.
  // The relay provides the asteroid grid for team mode; no fallback for other modes.
  const effectiveModeInfo     = relay.modeInfo
  const effectiveAsteroidGrid = isTeam ? relay.asteroidGrid : null

  // Players: prefer relay (real positions) → pixelmelt → DB roster (closed surv)
  const players = useMemo(() => {
    const relayList = relay.players
    const pmList = game.livePlayers ?? []
    let result: Player[]

    if (relayList && relayList.length > 0) {
      // Merge real score from Pixelmelt (relay score is raw engine value)
      if (pmList.length) {
        const pmByName = new Map(pmList.map(p => [p.player_name.toLowerCase().trim(), p]))
        result = relayList.map(p => {
          const pm = pmByName.get(p.player_name.toLowerCase().trim())
          return {
              ...p,
              score:  pm?.score  ?? p.score,
              custom: p.custom   ?? pm?.custom ?? null,  // relay ECP first, Pixelmelt as fallback
            }
        })
      } else {
        result = relayList
      }
    } else if (pmList.length > 0) {
      result = pmList
    } else {
      result = dbRoster
    }

    if (result.length > 0) cachedPlayersRef.current = result
    return cachedPlayersRef.current
  }, [relay.players, game.livePlayers, dbRoster])

  const stats = useMemo(() => summarizePlayers(players), [players])
  const isFromDb = players.length > 0 && players === dbRoster && !relay.players?.length && !(game.livePlayers?.length)
  const hasLive = players.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[var(--radius-app)] border border-border bg-surface shadow-2xl"
      >
        {/* ── Header ─────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
              <MapPin className="size-3.5" /> Game Overview
              {(relay.connected || effectiveAsteroidGrid) && (
                <span className="ml-1 flex items-center gap-1 text-success">
                  <Radio className="live-dot size-3" />
                  {relay.modeInfo
                    ? (isTeam ? 'Real map · live relay' : 'Live relay')
                    : effectiveAsteroidGrid ? 'Map ready' : 'Connecting…'}
                </span>
              )}
              {isFromDb && (
                <span className="ml-1 flex items-center gap-1 text-muted">
                  <Database className="size-3" />
                  Last known roster
                </span>
              )}
            </div>
            <h2 className="truncate text-lg font-bold text-text">{game.name || `System ${game.id}`}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
              <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-accent-2">{modeLabel(game)}</span>
              <span>#{game.id}</span>
              <span className="text-border">|</span>
              <span>{game.location}</span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1"><Clock className="size-3" />{formatUptime(game.time)}</span>
              <span className="text-border">|</span>
              <span className="flex items-center gap-1"><ShieldAlert className="size-3" />crime {game.criminal_activity}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <a href={game.joinUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-bg hover:opacity-90">
              Join <ExternalLink className="size-3.5" />
            </a>
            <button
              onClick={() => {
                const el = document.querySelector('[data-gamemap]') as HTMLElement | null
                el?.requestFullscreen?.()
              }}
              className="rounded-md border border-border p-1.5 text-muted hover:text-text" title="Fullscreen map">
              <Maximize2 className="size-4" />
            </button>
            <button onClick={() => navigator.clipboard.writeText(game.joinUrl)}
              className="rounded-md border border-border p-1.5 text-muted hover:text-text" title="Copy link">
              <Copy className="size-4" />
            </button>
            <button onClick={onClose} className="rounded-md border border-border p-1.5 text-muted hover:text-text">
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        {/* Always show the layout — relay fills in player names as it connects.
            Only exception: closed survival with zero data (we truly can't show names). */}
        {isTeam ? (
          /* ── TEAM MODE: map left + team sidebar right ── */
          <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[1fr_320px]">
            <div className="flex min-w-0 flex-col gap-3 overflow-y-auto p-4">
              <div className="flex justify-center">
                <GameMap players={players} mode={game.mode} size={520}
                  modeInfo={effectiveModeInfo} asteroidGrid={effectiveAsteroidGrid} />
              </div>
              <MiniStats players={players} stats={stats} game={game} history={history} />
            </div>
            <div className="min-h-0 border-t border-border md:border-l md:border-t-0">
              {effectiveModeInfo?.teams?.length
                ? <TeamSidebar players={players} modeInfo={effectiveModeInfo} teamStats={relay.teamStats} />
                : <PlayerList players={players} mode={game.mode}
                    connecting={!hasLive && relay.connected}
                    expectedCount={game.players} />
              }
            </div>
          </div>
        ) : effectiveAsteroidGrid ? (
          /* ── ALL MODES with map (relay or Pixelmelt seed) ── */
          <div className="grid min-h-0 flex-1 overflow-hidden md:grid-cols-[1fr_300px]">
            <div className="flex min-w-0 flex-col gap-3 overflow-y-auto p-4">
              <div className="flex justify-center">
                <GameMap players={players} mode={game.mode} size={520}
                  modeInfo={effectiveModeInfo} asteroidGrid={effectiveAsteroidGrid} />
              </div>
              <MiniStats players={players} stats={stats} game={game} history={history} />
              <ClanSection players={players} mode={game.mode} compact />
            </div>
            <div className="min-h-0 border-t border-border md:border-l md:border-t-0">
              <PlayerList players={players} mode={game.mode}
                connecting={!hasLive && relay.connected}
                expectedCount={game.players} />
            </div>
          </div>
        ) : isSurvival && !game.open && !hasLive ? (
          /* ── CLOSED SURVIVAL with no data: genuine unknown-names state ── */
          <div className="flex flex-col items-center gap-2 px-5 py-16 text-center text-muted">
            <Radio className={`size-8 ${relay.connected ? 'text-success' : ''}`} />
            <p className="text-sm font-medium text-text">
              {game.players} player{game.players !== 1 ? 's' : ''} still in game
            </p>
            <p className="text-xs text-muted">
              {relay.connected
                ? 'Relay connected — waiting for first position frame…'
                : 'Relay not tracking this server — player names unavailable.'}
            </p>
          </div>
        ) : (
          /* ── ALL OTHER MODES (deathmatch / invasion / modding / open survival / custom)
             Always render the layout. Player list shows a connecting indicator
             while the relay is joining, then fills in names automatically.   */
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 p-4">
              <MiniStats players={players} stats={stats} game={game} history={history} />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_300px]">
                <ClanSection players={players} mode={game.mode} />
                <PlayerList
                  players={players}
                  mode={game.mode}
                  scrollable={false}
                  connecting={!hasLive && relay.connected}
                  expectedCount={game.players}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniStats({
  players, stats, game, history,
}: {
  players: Player[]
  stats: ReturnType<typeof summarizePlayers>
  game: EnrichedGame
  history: { players: number }[] | undefined
}) {
  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {/* Use simstatus count as fallback while relay is connecting */}
        <MiniStat icon={<Users className="size-3.5" />} label="Online" value={players.length || game.players} />
        <MiniStat icon={<Skull className="size-3.5" />} label="Alive" value={players.length ? `${stats.alive}/${players.length}` : '—'} />
        <MiniStat icon={<ExternalLink className="size-3.5" />} label="Top score" value={stats.topScore > 0 ? stats.topScore.toLocaleString() : '—'} />
        <MiniStat icon={<Clock className="size-3.5" />} label="Uptime" value={formatUptime(game.time)} />
      </div>
      <div className="rounded-lg border border-border bg-surface-2 p-3">
        <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Population over time</div>
        <Sparkline values={(history ?? []).map((s) => s.players)} width={460} height={44} />
      </div>
    </>
  )
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">{icon}{label}</div>
      <div className="mt-0.5 text-base font-bold tabular-nums text-text">{value}</div>
    </div>
  )
}

// ── Player chip — small colored pill used in ClanSection ─────────────────────
function PlayerChip({ p, mode = '' }: { p: Player; mode?: string }) {
  const col   = playerColor(p.hue, p.isAlive)
  const glyph = shipGlyph(p.ship, mode)
  const isEcp = !!p.custom
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-surface px-2 py-0.5 text-[11px] transition-opacity border ${isEcp ? 'border-accent/35' : 'border-border/40'} ${p.isAlive ? '' : 'opacity-40'}`}>
      <PlayerAvatar player={p} size="sm" />
      {glyph && (
        <span className="shrink-0 leading-none" style={{ fontFamily: 'StarblastVanilla', fontSize: 12, color: col }}>
          {glyph}
        </span>
      )}
      <span className={`max-w-[110px] truncate ${isEcp ? 'text-accent/90' : ''}`}>{p.player_name || '?'}</span>
    </span>
  )
}

// ── Clan + players overview ───────────────────────────────────────────────────
// compact=true → used below a map (no card wrapper, tighter spacing)
// compact=false (default) → standalone card layout for the no-map view
function ClanSection({ players, mode = '', compact = false }: { players: Player[]; mode?: string; compact?: boolean }) {
  const { tags: clanTags } = useClans()

  const { clanGroups, untagged, topKillers } = useMemo(() => {
    const map = new Map<string, Player[]>()
    const untagged: Player[] = []
    for (const p of players) {
      const tag = detectClanTag(p.player_name, clanTags)
      if (tag) {
        const arr = map.get(tag) ?? []
        arr.push(p)
        map.set(tag, arr)
      } else {
        untagged.push(p)
      }
    }
    const groups = [...map.entries()]
      .map(([tag, members]) => ({ tag, members: [...members].sort((a, b) => b.score - a.score) }))
      .sort((a, b) => b.members.length - a.members.length)
    const topKillers = [...players]
      .filter(p => (p.kills ?? 0) > 0)
      .sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0))
      .slice(0, 5)
    return { clanGroups: groups, untagged, topKillers }
  }, [players, clanTags])

  if (players.length === 0) return null

  const card = compact
    ? 'py-2'
    : 'rounded-[var(--radius-app)] border border-border bg-surface-2 p-3'

  const sectionHeader = 'mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted'

  return (
    <div className="flex flex-col gap-3">
      {/* ── Clan groups ──────────────────────────────────── */}
      {clanGroups.map(({ tag, members }) => (
        <div
          key={tag}
          className={card}
          style={compact ? undefined : { borderLeftColor: 'hsl(var(--accent) / 0.6)', borderLeftWidth: 2 }}
        >
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent">{tag}</span>
            <span className="text-[11px] text-muted">{members.length} player{members.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {members.map(p => <PlayerChip key={p.id} p={p} mode={mode} />)}
          </div>
        </div>
      ))}

      {/* ── Untagged / all players ────────────────────────── */}
      {untagged.length > 0 && (
        <div className={card}>
          <div className={sectionHeader}>
            <Users className="size-3" />
            {clanGroups.length > 0 ? 'Untagged players' : 'Players'}
            <span className="ml-auto font-normal normal-case text-text/40">{untagged.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {untagged.map(p => <PlayerChip key={p.id} p={p} mode={mode} />)}
          </div>
        </div>
      )}

      {/* ── Top kills (only if kill data is available) ───── */}
      {topKillers.length > 0 && (
        <div className={card}>
          <div className={sectionHeader}>
            <Skull className="size-3" />
            Top kills
          </div>
          <div className="space-y-1.5">
            {topKillers.map((p, i) => {
              const pct = Math.round(((p.kills ?? 0) / (topKillers[0].kills ?? 1)) * 100)
              const col = playerColor(p.hue, p.isAlive)
              return (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="w-3.5 shrink-0 text-[10px] tabular-nums text-muted/60">{i + 1}</span>
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: col }} />
                  <span className="min-w-0 flex-1 truncate text-xs text-text">{p.player_name || 'Unknown'}</span>
                  {/* Progress bar */}
                  <div className="h-1 w-16 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-danger/50 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-danger/80">{p.kills ?? 0}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
