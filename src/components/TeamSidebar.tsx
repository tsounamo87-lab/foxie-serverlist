import { useMemo, useState } from 'react'
import { Lock, Unlock } from 'lucide-react'
import type { Player } from '../lib/players'
import type { RelayModeInfo, TeamStat } from '../lib/useGameRelay'
import { useClans, detectClanTag } from '../store/clans'
import { shipGlyph } from '../lib/ships'
import { playerColor } from '../lib/players'
import { PlayerAvatar } from './PlayerAvatar'
import { CheatBadge } from './CheatBadge'
import { analyzeEcp, isLowercaseName } from '../lib/ecpDetect'

const MEDAL = ['#ffd24a', '#cdd4dc', '#cd8b54']

type PlayerFilter = 'all' | 'ecp' | 'no-ecp' | 'modified'

interface TeamGroup {
  hue: number
  statIdx: number
  players: Player[]
  totalScore: number
  ecpCount: number
  modifiedCount: number
}

/** Convert hue → approximate colour name. */
function teamColorName(hue: number): string {
  if (hue < 20 || hue >= 340) return 'Red'
  if (hue < 50) return 'Orange'
  if (hue < 80) return 'Yellow'
  if (hue < 160) return 'Green'
  if (hue < 200) return 'Teal'
  if (hue < 260) return 'Blue'
  if (hue < 290) return 'Violet'
  if (hue < 340) return 'Pink'
  return 'Red'
}

function isModified(p: Player): boolean {
  const a = analyzeEcp(p.custom)
  return (a !== null && a.overall !== 'clean') || isLowercaseName(p.player_name)
}

export function TeamSidebar({
  players,
  modeInfo,
  teamStats,
}: {
  players: Player[]
  modeInfo: RelayModeInfo | null
  teamStats: TeamStat[] | null
}) {
  const { tags: clanTags } = useClans()
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('all')

  const totalModified = useMemo(() => players.filter(isModified).length, [players])

  const teams = useMemo<TeamGroup[]>(() => {
    if (!modeInfo?.teams?.length) return []
    return modeInfo.teams
      .map((t, idx) => {
        const members = players.filter((p) => p.hue === t.hue).sort((a, b) => b.score - a.score)
        return {
          hue: t.hue,
          statIdx: idx,
          players: members,
          totalScore: members.reduce((s, p) => s + p.score, 0),
          ecpCount: members.filter((p) => p.custom).length,
          modifiedCount: members.filter(isModified).length,
        }
      })
      .sort((a, b) => b.totalScore - a.totalScore)
  }, [players, modeInfo])

  function applyFilter(list: Player[]): Player[] {
    if (playerFilter === 'ecp')      return list.filter((p) => !!p.custom)
    if (playerFilter === 'no-ecp')   return list.filter((p) => !p.custom)
    if (playerFilter === 'modified') return list.filter(isModified)
    return list
  }

  if (!teams.length) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        Waiting for team data…
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">

      {/* ── Filter chips ────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 flex items-center gap-1 border-b border-border bg-surface px-3 py-1.5 flex-wrap">
        {(['all', 'ecp', 'no-ecp', 'modified'] as PlayerFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setPlayerFilter(f)}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
              playerFilter === f
                ? f === 'modified'
                  ? 'border-accent-2/60 bg-accent-2/10 text-accent-2'
                  : 'border-accent bg-accent-soft text-accent'
                : 'border-border text-muted hover:text-text'
            }`}
          >
            {f === 'all'    && 'All'}
            {f === 'ecp'    && 'ECP'}
            {f === 'no-ecp' && 'No ECP'}
            {f === 'modified' && (
              <span className="flex items-center gap-1">
                Modified
                {totalModified > 0 && (
                  <span className={`rounded-full px-1 text-[9px] tabular-nums ${
                    playerFilter === 'modified' ? 'bg-accent-2/20 text-accent-2' : 'bg-border text-muted'
                  }`}>
                    {totalModified}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Teams ───────────────────────────────────────────────── */}
      {teams.map((team) => {
        const stat = teamStats?.[team.statIdx]
        const teamColor = `hsl(${team.hue}, 75%, 62%)`
        const visible = applyFilter(team.players)
        if (visible.length === 0) return null

        return (
          <div key={team.hue}>
            {/* Team header (sticky, below filter bar) */}
            <div
              className="sticky top-[33px] z-10 border-b border-t border-border bg-surface px-3 py-1.5"
              style={{ borderLeftColor: teamColor, borderLeftWidth: 3 }}
            >
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span className="flex items-center gap-1 text-sm font-bold" style={{ color: teamColor }}>
                  {teamColorName(team.hue)}
                  {stat && (stat.open
                    ? <Unlock className="size-3 opacity-60" />
                    : <Lock className="size-3 opacity-60" />)}
                </span>
                <div className="flex items-center gap-3 text-[11px] text-muted">
                  <span title="ECP players">
                    ECP <span className="font-semibold text-text">{team.ecpCount}</span>
                  </span>
                  {team.modifiedCount > 0 && (
                    <span title="Modified / cheat" className="text-accent-2">
                      Mod <span className="font-semibold">{team.modifiedCount}</span>
                    </span>
                  )}
                  {stat && (
                    <>
                      <span title="Station level">
                        Lv <span className="font-semibold text-text">{stat.level}</span>
                      </span>
                      <span title="Team gems">
                        Gems <span className="font-semibold text-text">{stat.crystals.toLocaleString()}</span>
                      </span>
                    </>
                  )}
                  <span title="Total team score" className="font-semibold" style={{ color: teamColor }}>
                    {team.totalScore.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Player rows */}
            {visible.map((p, i) => {
              const tag = detectClanTag(p.player_name, clanTags)
              const glyph = shipGlyph(p.ship, 'team')
              const col = playerColor(p.hue, p.isAlive)
              const rankColor = i < 3 ? MEDAL[i] : undefined
              const isEcp = !!p.custom

              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-1.5 border-b border-border/40 px-3 py-1 ${p.isAlive ? '' : 'opacity-45'} ${isEcp ? 'bg-accent/[0.03]' : ''}`}
                >
                  <PlayerAvatar player={p} size="sm" />

                  {glyph && (
                    <span
                      className="shrink-0 leading-none"
                      style={{ fontFamily: 'StarblastVanilla', fontSize: 14, color: col }}
                    >
                      {glyph}
                    </span>
                  )}

                  <span
                    className="min-w-0 flex-1 truncate text-xs"
                    style={{ color: rankColor ?? (isEcp ? 'hsl(var(--accent) / 0.85)' : `hsl(${team.hue}, 60%, 75%)`) }}
                    title={p.player_name}
                  >
                    {p.player_name || '???'}
                    {tag && <span className="ml-1 text-[10px] opacity-50">[{tag}]</span>}
                  </span>

                  <CheatBadge custom={p.custom} playerName={p.player_name} variant="dot" />

                  {(p.kills ?? 0) > 0 && (
                    <span className="shrink-0 text-[10px] tabular-nums text-danger/80">
                      {p.kills}K
                    </span>
                  )}

                  <span className="shrink-0 text-xs font-medium tabular-nums text-text/90">
                    {p.score.toLocaleString()}
                  </span>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
