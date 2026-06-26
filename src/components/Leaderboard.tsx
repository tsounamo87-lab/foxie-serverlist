// ─── Live Leaderboard ─────────────────────────────────────────────────────────
// Aggregates kills + score from pixelmelt data across ALL live servers.

import { useMemo, useState } from 'react'
import { Trophy, Swords, Star, X } from 'lucide-react'
import { type EnrichedGame, type PlayerCustom } from '../lib/players'
import { PlayerAvatar } from './PlayerAvatar'
import { CheatBadge } from './CheatBadge'
import { modeLabel } from '../lib/starblast'

interface Props {
  games: EnrichedGame[]
  onClose: () => void
  onOpenGame: (g: EnrichedGame) => void
}

type Tab = 'kills' | 'score'

export function Leaderboard({ games, onClose, onOpenGame }: Props) {
  const [tab, setTab] = useState<Tab>('kills')

  const entries = useMemo(() => {
    const map = new Map<string, {
      name: string; kills: number; score: number
      hue: number; isAlive: boolean; custom: PlayerCustom | null
      game: EnrichedGame
    }>()

    for (const g of games) {
      const players = g.livePlayers ?? []
      for (const p of players) {
        if (!p.player_name?.trim()) continue
        const key = p.player_name.toLowerCase().trim()
        const existing = map.get(key)
        if (!existing || (p.kills ?? 0) > existing.kills) {
          map.set(key, {
            name: p.player_name,
            kills: p.kills ?? 0,
            score: p.score ?? 0,
            hue: p.hue,
            isAlive: p.isAlive,
            custom: p.custom,
            game: g,
          })
        }
      }
    }

    const arr = [...map.values()]
    return arr.sort((a, b) => tab === 'kills' ? b.kills - a.kills : b.score - a.score)
      .slice(0, 50)
  }, [games, tab])

  const MEDAL = ['#ffd24a', '#cdd4dc', '#cd8b54']
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        className="animate-fade-up flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-app)] border border-border bg-surface shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <Trophy className="size-5 text-accent shrink-0" />
          <h2 className="text-base font-bold text-text flex-1">Live Leaderboard</h2>
          <div className="flex rounded-lg border border-border bg-surface-2 p-0.5">
            <button onClick={() => setTab('kills')} className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${tab === 'kills' ? 'bg-accent text-bg' : 'text-muted hover:text-text'}`}>
              <Swords className="size-3" /> Kills
            </button>
            <button onClick={() => setTab('score')} className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition-colors ${tab === 'score' ? 'bg-accent text-bg' : 'text-muted hover:text-text'}`}>
              <Star className="size-3" /> Score
            </button>
          </div>
          <button onClick={onClose} className="rounded-md border border-border p-1.5 text-muted hover:text-text">
            <X className="size-4" />
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {entries.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted">
              <Trophy className="size-8 opacity-30" />
              <p className="text-sm">No live player data available.</p>
              <p className="text-xs">Pixelmelt feed must be active.</p>
            </div>
          ) : (
            entries.map((e, i) => (
              <button
                key={e.name}
                onClick={() => { onOpenGame(e.game); onClose() }}
                className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-2.5 text-left hover:bg-surface-2/60 transition-colors last:border-0"
              >
                {/* Rank */}
                <span className={`w-6 shrink-0 text-center text-xs font-bold tabular-nums ${i < 3 ? '' : 'text-muted'}`}
                  style={{ color: i < 3 ? MEDAL[i] : undefined }}>
                  {i + 1}
                </span>
                {/* Avatar */}
                <PlayerAvatar player={{ ...e, player_name: e.name, custom: e.custom as never, ship: 0, x: 0, y: 0, friendly: 0, id: i, kills: e.kills, score: e.score }} size="sm" />
                {/* Name */}
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text flex items-center gap-1.5">
                  {e.name}
                  <CheatBadge custom={e.custom} playerName={e.name} />
                </span>
                {/* Server */}
                <span className="shrink-0 max-w-[90px] truncate text-xs text-muted" title={e.game.name || `#${e.game.id}`}>
                  {modeLabel(e.game)} · {e.game.location.slice(0,2).toUpperCase()}
                </span>
                {/* Stat */}
                <span className="shrink-0 w-16 text-right font-bold tabular-nums text-accent text-sm">
                  {tab === 'kills' ? `${e.kills}K` : e.score.toLocaleString()}
                </span>
              </button>
            ))
          )}
        </div>

        <div className="border-t border-border px-4 py-2 text-[11px] text-muted">
          Aggregated from {games.reduce((s, g) => s + (g.livePlayers?.length ?? 0), 0)} players across {games.length} servers · Live feed
        </div>
      </div>
    </div>
  )
}
