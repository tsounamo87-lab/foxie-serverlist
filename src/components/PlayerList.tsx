import { useMemo, useState } from 'react'
import { Filter, Radio, Users } from 'lucide-react'
import { playerColor, type Player } from '../lib/players'
import { shipGlyph } from '../lib/ships'
import { useClans, detectClanTag } from '../store/clans'
import { PlayerAvatar } from './PlayerAvatar'
import { CheatBadge } from './CheatBadge'
import { analyzeEcp, isLowercaseName } from '../lib/ecpDetect'

type PlayerFilter = 'all' | 'ecp' | 'no-ecp' | 'modified'

const MEDAL = ['#ffd24a', '#cdd4dc', '#cd8b54'] // gold / silver / bronze

/** scrollable=true (default) → fixed-height column with overflow-y-auto (sidebar use)
 *  scrollable=false          → natural height, no inner scroll (flat layout use) */
export function PlayerList({ players, mode = '', scrollable = true, connecting = false, expectedCount = 0 }: { players: Player[]; mode?: string; scrollable?: boolean; connecting?: boolean; expectedCount?: number }) {
  const { tags: clanTags } = useClans()
  const [clan, setClan] = useState('all')
  const [playerFilter, setPlayerFilter] = useState<PlayerFilter>('all')

  const clans = useMemo(() => {
    const set = new Set<string>()
    for (const p of players) {
      const t = detectClanTag(p.player_name, clanTags)
      if (t) set.add(t)
    }
    return [...set].sort()
  }, [players, clanTags])

  const modifiedCount = useMemo(() =>
    players.filter((p) => {
      const a = analyzeEcp(p.custom)
      return (a && a.overall !== 'clean') || isLowercaseName(p.player_name)
    }).length
  , [players])

  const sorted = useMemo(() => {
    let arr = clan === 'all'
      ? players
      : players.filter((p) => detectClanTag(p.player_name, clanTags) === clan)
    if (playerFilter === 'ecp')      arr = arr.filter((p) => !!p.custom)
    if (playerFilter === 'no-ecp')   arr = arr.filter((p) => !p.custom)
    if (playerFilter === 'modified') arr = arr.filter((p) => {
      const a = analyzeEcp(p.custom)
      return (a && a.overall !== 'clean') || isLowercaseName(p.player_name)
    })
    return [...arr].sort((a, b) => b.score - a.score)
  }, [players, clan, clanTags, playerFilter])

  const outer = scrollable
    ? 'flex h-full flex-col'
    : 'flex flex-col rounded-[var(--radius-app)] border border-border overflow-hidden'

  const rowsWrap = scrollable
    ? 'min-h-0 flex-1 overflow-y-auto'
    : ''

  return (
    <div className={outer}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Users className="size-4 text-accent" />
        <span className="text-sm font-bold text-text">Players</span>
        <span className="ml-auto text-xs text-muted">
          {connecting ? (
            <span className="flex items-center gap-1 text-muted">
              <Radio className="live-dot size-3" />
              Connecting…
            </span>
          ) : `${players.length} online`}
        </span>
      </div>

      {/* Player type filter */}
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5 flex-wrap">
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
            {f === 'all'      && 'All'}
            {f === 'ecp'      && 'ECP'}
            {f === 'no-ecp'   && 'No ECP'}
            {f === 'modified' && (
              <span className="flex items-center gap-1">
                Modified
                {modifiedCount > 0 && (
                  <span className={`rounded-full px-1 text-[9px] tabular-nums ${
                    playerFilter === 'modified' ? 'bg-accent-2/20 text-accent-2' : 'bg-border text-muted'
                  }`}>
                    {modifiedCount}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Clan filter */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Filter className="size-3.5 text-muted" />
        <select
          value={clan}
          onChange={(e) => setClan(e.target.value)}
          className="flex-1 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text outline-none focus:border-accent"
        >
          <option value="all">All Players</option>
          {clans.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-muted">
          {clans.length} clan{clans.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Rows */}
      <div className={rowsWrap}>
        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col />{/* Name */}
            <col style={{ width: 32 }} />{/* K */}
            <col style={{ width: 68 }} />{/* Score */}
          </colgroup>
          <thead className="sticky top-0 bg-surface text-[10px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-1.5 text-left font-medium">Name</th>
              <th className="px-2 py-1.5 text-right font-medium" title="Kills">K</th>
              <th className="px-4 py-1.5 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {/* Placeholder rows while relay is connecting and we know there are players */}
            {connecting && sorted.length === 0 && expectedCount > 0 && (
              Array.from({ length: Math.min(expectedCount, 10) }).map((_, i) => (
                <tr key={`ph-${i}`} className="border-t border-border/60 animate-pulse">
                  <td className="px-4 py-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 shrink-0 rounded-full bg-border" />
                      <span className="h-3 w-24 rounded bg-border" />
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right"><span className="inline-block h-3 w-4 rounded bg-border" /></td>
                  <td className="px-4 py-1.5 text-right"><span className="inline-block h-3 w-10 rounded bg-border" /></td>
                </tr>
              ))
            )}
            {sorted.map((p, i) => {
              const tag   = detectClanTag(p.player_name, clanTags)
              const glyph = shipGlyph(p.ship, mode)
              const col   = playerColor(p.hue, p.isAlive)
              const isEcp = !!p.custom
              return (
                <tr
                  key={p.id}
                  className={`border-t border-border/60 ${p.isAlive ? '' : 'opacity-45'} ${isEcp ? 'bg-accent/[0.03]' : ''}`}
                >
                  <td className="min-w-0 px-4 py-1.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <PlayerAvatar player={p} size="md" />
                      {glyph && (
                        <span className="shrink-0 leading-none" style={{ fontFamily: 'StarblastVanilla', fontSize: 14, color: col }}>
                          {glyph}
                        </span>
                      )}
                      <span className="min-w-0 truncate" style={{ color: i < 3 ? MEDAL[i] : isEcp ? 'hsl(var(--accent) / 0.9)' : undefined }}>
                        {p.player_name || <span className="italic text-muted/50">anonymous</span>}
                      </span>
                      {tag && (
                        <span className="shrink-0 rounded bg-accent-soft px-1 py-0.5 text-[9px] font-semibold text-accent">{tag}</span>
                      )}
                      <CheatBadge custom={p.custom} playerName={p.player_name} />
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted">{p.kills}</td>
                  <td className="px-4 py-1.5 text-right font-medium tabular-nums text-accent">
                    {p.score.toLocaleString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
