// ─── Player Profile Modal ─────────────────────────────────────────────────────
// Unified cross-mode profile for a single player: survival + team totals,
// ECP/badge history, recent sessions, and recently-played-with players.
// Self-sufficient — only needs a player name, fetches everything else itself.

import { useEffect, useMemo, useState } from 'react'
import { X, Swords, Clock, Target, Trophy, MapPin, RefreshCw, Users, Shield, Search } from 'lucide-react'
import { useClans, detectClanTag } from '../store/clans'
import { EcpBadge } from './EcpBadge'
import { CheatBadge } from './CheatBadge'
import { analyzeEcp } from '../lib/ecpDetect'
import type { CheatLevel } from '../lib/ecpDetect'
import type { PlayerCustom } from '../lib/players'
import {
  type Session,
  fmtDuration,
  fmtRelative,
  killsPerDay,
} from '../lib/survivalTracker'
import {
  getPlayerSessionsLongTerm,
  getPlayerBadgeHistory,
  getPlayerSurvivalTotals,
  getPlayerTeamTotals,
  getPlayerEcp,
  getRecentTeammates,
  getPlayersWithExactGear,
  getPlayerShipUsage,
  type BadgeHistoryEntry,
  type PlayerActivityRow,
  type TeamPlayerRow,
  type RecentTeammate,
  type TeamType,
  type ShipUsage,
} from '../lib/db'
import { shipGlyph, shipName } from '../lib/ships'

function levelColor(l: CheatLevel): string {
  if (l === 'cheat')      return 'text-danger'
  if (l === 'suspicious') return 'text-warning'
  if (l === 'clean')      return 'text-success'
  return 'text-muted'
}
function levelMark(l: CheatLevel): string {
  if (l === 'cheat')      return '✗'
  if (l === 'suspicious') return '?'
  if (l === 'clean')      return '✓'
  return ''
}

const TEAM_TYPE_LABEL: Record<TeamType, string> = { classic: 'Classic', gotn: 'GOTN', aow: 'AOW' }

// ── Mini bar chart ────────────────────────────────────────────────────────────

function KillsChart({ sessions }: { sessions: Session[] }) {
  const days = killsPerDay(sessions)
  if (!days.length) return null

  const maxKills = Math.max(...days.map((d) => d.kills), 1)
  // Show last 14 days, zero-fill missing
  const today = new Date()
  const labels: { date: string; kills: number }[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('en-CA')
    labels.push({ date: key, kills: days.find((x) => x.date === key)?.kills ?? 0 })
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="mb-2 text-[11px] uppercase tracking-wide text-muted">Kills per day</div>
      <div className="flex h-16 items-end gap-0.5">
        {labels.map(({ date, kills }) => (
          <div
            key={date}
            className="group relative flex flex-1 flex-col items-center justify-end"
            title={`${date}: ${kills} kills`}
          >
            <div
              className="w-full rounded-t-[2px] bg-accent opacity-80 transition-opacity group-hover:opacity-100"
              style={{ height: `${Math.max(2, (kills / maxKills) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted">
        <span>14 days ago</span>
        <span>Today</span>
      </div>
    </div>
  )
}

// ── Session row ───────────────────────────────────────────────────────────────

function SessionRow({ session }: { session: Session }) {
  const start = new Date(session.startTs)
  const startStr = start.toLocaleString('en-GB', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-border/40 px-3 py-2 text-xs last:border-0 hover:bg-surface-2/50">
      <div className="min-w-0">
        <div className="truncate font-medium text-text">{session.serverName}</div>
        <div className="flex items-center gap-1 text-[11px] text-muted">
          <MapPin className="size-2.5 shrink-0" />
          {session.region} · {startStr}
        </div>
      </div>
      <div className="shrink-0 text-right tabular-nums text-muted">
        {fmtDuration(session.durationMs)}
      </div>
      <div className="shrink-0 w-14 text-right tabular-nums">
        {session.killsGained > 0
          ? <span className="font-semibold text-accent">{session.killsGained}K</span>
          : <span className="text-muted">—</span>}
      </div>
      <div className="shrink-0 w-16 text-right tabular-nums text-muted">
        {session.maxScore.toLocaleString()}
      </div>
    </div>
  )
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | number
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
        {icon}{label}
      </div>
      <div className="mt-0.5 text-base font-bold tabular-nums text-text">{value}</div>
    </div>
  )
}

// ── Team totals row ───────────────────────────────────────────────────────────

function TeamTotalsRow({ type, totals }: { type: TeamType; totals: TeamPlayerRow }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 border-b border-border/40 px-3 py-2 text-xs last:border-0">
      <span className="w-14 shrink-0 font-semibold text-text">{TEAM_TYPE_LABEL[type]}</span>
      <span className="text-muted">{totals.regions.join(', ') || '—'}</span>
      <span className="tabular-nums text-muted">{fmtDuration(totals.totalDurationMs)}</span>
      <span className="tabular-nums text-muted">{totals.sessionCount} sess.</span>
      <span className="tabular-nums text-text/90">{totals.maxScore.toLocaleString()}</span>
    </div>
  )
}

// ── Recently played with ──────────────────────────────────────────────────────

function TeammateChips({
  title, teammates, onSelect,
}: {
  title: string
  teammates: RecentTeammate[]
  onSelect: (name: string) => void
}) {
  if (!teammates.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="shrink-0 text-muted">{title}</span>
      {teammates.map((t) => (
        <button
          key={t.playerName}
          onClick={() => onSelect(t.playerName)}
          className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text hover:border-accent hover:text-accent transition-colors"
        >
          {t.playerName} <span className="text-muted">×{t.encounters}</span>
        </button>
      ))}
    </div>
  )
}

// ── Ship usage chips ───────────────────────────────────────────────────────────

function ShipChips({ ships, mode }: { ships: ShipUsage[]; mode: string }) {
  if (!ships.length) return null
  const total = ships.reduce((s, u) => s + u.count, 0)
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="shrink-0 text-muted">Ships:</span>
      {ships.slice(0, 5).map((u) => {
        const glyph = shipGlyph(u.ship, mode)
        const pct = Math.round((u.count / total) * 100)
        return (
          <span
            key={u.ship}
            title={`${shipName(u.ship)} · ${pct}% of tracked play time on this ship`}
            className="flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-text"
          >
            {glyph && (
              <span style={{ fontFamily: 'StarblastVanilla', fontSize: 13 }}>{glyph}</span>
            )}
            {shipName(u.ship)}
            <span className="text-muted">{pct}%</span>
          </span>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const TEAM_TYPES: TeamType[] = ['classic', 'gotn', 'aow']

interface Props {
  playerName: string
  onClose:    () => void
}

export function PlayerActivityModal({ playerName, onClose }: Props) {
  const { tags: clanTags } = useClans()

  // The currently-viewed player can change internally when a teammate chip is
  // clicked, so the modal can be browsed without closing/reopening it.
  const [viewName, setViewName] = useState(playerName)
  useEffect(() => setViewName(playerName), [playerName])

  const [loading, setLoading] = useState(true)
  const [survivalTotals, setSurvivalTotals] = useState<PlayerActivityRow | null>(null)
  const [teamTotals, setTeamTotals] = useState<Partial<Record<TeamType, TeamPlayerRow>>>({})
  const [ecp, setEcp] = useState<PlayerCustom | null>(null)
  const [badgeHistory, setBadgeHistory] = useState<BadgeHistoryEntry[]>([])
  const [playerSessions, setPlayerSessions] = useState<Session[]>([])
  const [survivalMates, setSurvivalMates] = useState<RecentTeammate[]>([])
  const [teamMates, setTeamMates] = useState<RecentTeammate[]>([])
  const [survivalShips, setSurvivalShips] = useState<ShipUsage[]>([])
  const [teamShips, setTeamShips] = useState<ShipUsage[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [survTotals, classic, gotn, aow, ecpRow, hist, sessions, surMates, tMates, surShips, tShips] = await Promise.all([
        getPlayerSurvivalTotals(viewName),
        getPlayerTeamTotals(viewName, 'classic'),
        getPlayerTeamTotals(viewName, 'gotn'),
        getPlayerTeamTotals(viewName, 'aow'),
        getPlayerEcp(viewName),
        getPlayerBadgeHistory(viewName),
        getPlayerSessionsLongTerm(viewName),
        getRecentTeammates(viewName, 'observations'),
        getRecentTeammates(viewName, 'team_observations'),
        getPlayerShipUsage(viewName, 'observations'),
        getPlayerShipUsage(viewName, 'team_observations'),
      ])
      if (cancelled) return
      setSurvivalTotals(survTotals)
      setTeamTotals({ classic: classic ?? undefined, gotn: gotn ?? undefined, aow: aow ?? undefined })
      setEcp(ecpRow)
      setBadgeHistory(hist)
      setPlayerSessions(sessions)
      setSurvivalMates(surMates)
      setTeamMates(tMates)
      setSurvivalShips(surShips)
      setTeamShips(tShips)
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [viewName])

  const allSnaps: { custom: PlayerCustom; ts: number; isCurrent?: boolean }[] = useMemo(() => {
    if (badgeHistory.length > 0) {
      return badgeHistory.map((h) => ({
        custom: { badge: h.badge, finish: h.finish, laser: h.laser, hue: h.hue } as PlayerCustom,
        ts: h.lastSeen,
      }))
    }
    if (ecp) return [{ custom: ecp, ts: Date.now(), isCurrent: true }]
    return []
  }, [badgeHistory, ecp])

  const [selectedSnap, setSelectedSnap] = useState<{ custom: PlayerCustom; ts: number } | null>(null)
  useEffect(() => setSelectedSnap(null), [viewName])

  const [sameSetup, setSameSetup] = useState<string[] | null>(null)
  const [sameSetupLoading, setSameSetupLoading] = useState(false)
  useEffect(() => { setSameSetup(null) }, [viewName, selectedSnap])

  async function handleFindSameSetup(custom: PlayerCustom) {
    setSameSetupLoading(true)
    const names = await getPlayersWithExactGear(custom, viewName)
    setSameSetup(names)
    setSameSetupLoading(false)
  }

  const clan = detectClanTag(viewName, clanTags)
  const ecpAnalysis = analyzeEcp(ecp)

  const activeTeamTypes = TEAM_TYPES.filter((t) => teamTotals[t])
  const lastSeen = Math.max(survivalTotals?.lastSeen ?? 0, ...activeTeamTypes.map((t) => teamTotals[t]!.lastSeen))
  const allRegions = [...new Set([
    ...(survivalTotals?.regions ?? []),
    ...activeTeamTypes.flatMap((t) => teamTotals[t]!.regions),
  ])]

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-app)] border border-border bg-surface shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-text">{viewName}</h2>
              {clan && (
                <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent">
                  [{clan}]
                </span>
              )}
              {ecpAnalysis && ecpAnalysis.overall !== 'clean' && (
                <CheatBadge custom={ecp} playerName={viewName} />
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {lastSeen > 0 ? `Last seen ${fmtRelative(lastSeen)}` : 'No recorded activity'}
              {allRegions.length > 0 && ` · ${allRegions.join(', ')}`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md border border-border p-1.5 text-muted hover:text-text"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted">
              <RefreshCw className="size-3.5 animate-spin" /> Loading profile…
            </div>
          )}

          {!loading && !survivalTotals && activeTeamTypes.length === 0 && badgeHistory.length === 0 && !ecp && (
            <p className="p-6 text-center text-xs text-muted">No recorded activity for this player yet.</p>
          )}

          {/* Survival stats */}
          {survivalTotals && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
                <Target className="size-3" /> Survival
              </div>
              <div className="grid grid-cols-4 gap-2">
                <StatTile icon={<Swords className="size-3.5" />} label="Total kills" value={survivalTotals.totalKills} />
                <StatTile icon={<Clock className="size-3.5" />} label="Play time" value={fmtDuration(survivalTotals.totalDurationMs)} />
                <StatTile icon={<Target className="size-3.5" />} label="Sessions" value={survivalTotals.sessionCount} />
                <StatTile icon={<Trophy className="size-3.5" />} label="Best score" value={survivalTotals.maxScore.toLocaleString()} />
              </div>
              <div className="mt-1.5"><ShipChips ships={survivalShips} mode="survival" /></div>
            </div>
          )}

          {/* Team stats */}
          {activeTeamTypes.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
                <Shield className="size-3" /> Team
              </div>
              <div className="rounded-lg border border-border">
                {activeTeamTypes.map((t) => (
                  <TeamTotalsRow key={t} type={t} totals={teamTotals[t]!} />
                ))}
              </div>
              <div className="mt-1.5"><ShipChips ships={teamShips} mode="team" /></div>
            </div>
          )}

          {/* Recently played with */}
          {(survivalMates.length > 0 || teamMates.length > 0) && (
            <div className="space-y-1.5 rounded-lg border border-border bg-surface-2 p-3">
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted">
                <Users className="size-3" /> Recently played with
              </div>
              <TeammateChips title="Survival:" teammates={survivalMates} onSelect={setViewName} />
              <TeammateChips title="Team:" teammates={teamMates} onSelect={setViewName} />
            </div>
          )}

          {/* Kills per day chart */}
          {playerSessions.length > 0 && <KillsChart sessions={playerSessions} />}

          {/* ECP Badge history — click any badge to reveal its materials */}
          {allSnaps.length > 0 && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="border-b border-border px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">
                {badgeHistory.length > 0
                  ? `ECP Badge history (${badgeHistory.length}) · click to inspect`
                  : 'ECP Materials · click to inspect'}
              </div>

              {/* Badge strip */}
              <div className="flex flex-wrap gap-2 p-3">
                {allSnaps.map((snap, i) => {
                  const isSelected = selectedSnap === snap || (allSnaps.length === 1 && selectedSnap === null)
                  const label = (snap as { isCurrent?: boolean }).isCurrent
                    ? 'Current'
                    : new Date(snap.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedSnap(isSelected && allSnaps.length > 1 ? null : snap)}
                      className={`flex flex-col items-center gap-1 rounded-md px-2 py-1.5 transition-colors ${
                        isSelected
                          ? 'bg-accent-soft ring-1 ring-accent'
                          : 'hover:bg-surface-2'
                      }`}
                    >
                      <EcpBadge custom={snap.custom} size={22} />
                      <span className="text-[9px] text-muted">{label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Detail panel — shown for selected snap, or auto-shown for single entry */}
              {(selectedSnap ?? (allSnaps.length === 1 ? allSnaps[0] : null)) && (() => {
                const active = selectedSnap ?? allSnaps[0]
                const d = analyzeEcp(active.custom)
                const c = active.custom
                return (
                  <div className="border-t border-border bg-surface-2/50 p-3 space-y-2">
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted">
                        {(active as { isCurrent?: boolean }).isCurrent
                          ? 'Current ECP'
                          : new Date(active.ts).toLocaleDateString('en-GB', {
                              day: 'numeric', month: 'short', year: 'numeric',
                            })}
                      </span>
                      <CheatBadge custom={c} />
                    </div>

                    <div className="flex items-start gap-4">
                      {/* Large badge preview */}
                      <div className="shrink-0 rounded-md border border-border bg-surface p-2">
                        <EcpBadge custom={c} size={38} />
                      </div>

                      {/* Fields */}
                      <div className="flex-1 space-y-2">
                        {d?.badge && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted">Badge</span>
                            <span className={`flex items-center gap-1.5 font-medium ${levelColor(d.badge.level)}`}>
                              <span className="opacity-60 text-[10px]">{levelMark(d.badge.level)}</span>
                              {d.badge.value.startsWith('http') ? 'Custom URL' : d.badge.value}
                            </span>
                          </div>
                        )}
                        {d?.finish && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted">Finish</span>
                            <span className={`flex items-center gap-1.5 font-medium ${levelColor(d.finish.level)}`}>
                              <span className="opacity-60 text-[10px]">{levelMark(d.finish.level)}</span>
                              {d.finish.value}
                            </span>
                          </div>
                        )}
                        {d?.laser && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted">Laser</span>
                            <span className={`flex items-center gap-1.5 font-medium ${levelColor(d.laser.level)}`}>
                              <span className="opacity-60 text-[10px]">{levelMark(d.laser.level)}</span>
                              {d.laser.value}
                            </span>
                          </div>
                        )}
                        {c.hue !== undefined && (
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted">Hue</span>
                            <span className="flex items-center gap-1.5 text-text">
                              <span
                                className="size-3 rounded-full border border-border/50"
                                style={{ background: `hsl(${c.hue}, 70%, 55%)` }}
                              />
                              {c.hue}°
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Find players with this exact composition */}
                    <div className="border-t border-border/60 pt-2">
                      <button
                        onClick={() => void handleFindSameSetup(c)}
                        disabled={sameSetupLoading}
                        className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 disabled:opacity-50"
                      >
                        <Search className="size-3" />
                        {sameSetupLoading ? 'Searching…' : 'Find players with this exact setup'}
                      </button>

                      {sameSetup && (
                        sameSetup.length === 0 ? (
                          <p className="mt-1.5 text-xs text-muted">No other player has this exact composition right now.</p>
                        ) : (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-muted">{sameSetup.length} match{sameSetup.length !== 1 ? 'es' : ''}:</span>
                            {sameSetup.map((name) => (
                              <button
                                key={name}
                                onClick={() => setViewName(name)}
                                className="rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-text hover:border-accent hover:text-accent transition-colors"
                              >
                                {name}
                              </button>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Recent sessions (survival) — from survival_buckets_cache, full history */}
          {playerSessions.length > 0 && (
            <div className="rounded-lg border border-border">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-border px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">
                <span>Recent sessions (survival)</span>
                <span>Duration</span>
                <span className="w-14 text-right">Kills</span>
                <span className="w-16 text-right">Score</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {playerSessions.map((s, i) => <SessionRow key={i} session={s} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
