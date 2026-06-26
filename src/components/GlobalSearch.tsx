// ─── Global Player Search ─────────────────────────────────────────────────────
// Search for a player by name across ALL live servers and jump to their server.

import { useMemo, useState, useRef, useEffect } from 'react'
import { Search, X } from 'lucide-react'
import { type EnrichedGame } from '../lib/players'
import { modeLabel } from '../lib/starblast'
import { PlayerAvatar } from './PlayerAvatar'

interface Hit {
  player_name: string
  kills?: number
  score: number
  hue: number
  isAlive: boolean
  custom: unknown
  game: EnrichedGame
}

interface Props {
  games: EnrichedGame[]
  onOpenGame: (g: EnrichedGame) => void
  onClose: () => void
}

export function GlobalSearch({ games, onOpenGame, onClose }: Props) {
  const [q, setQ] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const hits = useMemo<Hit[]>(() => {
    const query = q.trim().toLowerCase()
    if (query.length < 2) return []
    const out: Hit[] = []
    for (const g of games) {
      const players = g.livePlayers ?? []
      for (const p of players) {
        if (p.player_name?.toLowerCase().includes(query)) {
          out.push({ ...p, game: g })
          if (out.length >= 30) break
        }
      }
      if (out.length >= 30) break
    }
    return out.sort((a, b) => (b.kills ?? 0) - (a.kills ?? 0))
  }, [games, q])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center pt-[8vh] bg-black/70 backdrop-blur-sm px-3" onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        className="animate-fade-up w-full max-w-lg rounded-[var(--radius-app)] border border-border bg-surface shadow-2xl overflow-hidden">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search player across all servers…"
            className="flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted"
          />
          {q && <button onClick={() => setQ('')} className="text-muted hover:text-text"><X className="size-4" /></button>}
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted">Esc</kbd>
        </div>

        {/* Results */}
        {q.length >= 2 && (
          <div className="max-h-[60vh] overflow-y-auto">
            {hits.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted">
                No player found matching "{q}"
              </div>
            ) : (
              hits.map((h, i) => (
                <button key={i}
                  onClick={() => { onOpenGame(h.game); onClose() }}
                  className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-2.5 text-left hover:bg-surface-2/60 transition-colors last:border-0"
                >
                  <PlayerAvatar player={{ ...h, player_name: h.player_name, custom: h.custom as never, ship: 0, x: 0, y: 0, friendly: 0, id: i, kills: h.kills ?? 0, score: h.score }} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text">{h.player_name}</p>
                    <p className="text-xs text-muted">
                      {h.game.name || `System ${h.game.id}`} · {modeLabel(h.game)} · {h.game.location}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    {(h.kills ?? 0) > 0 && <span className="block font-bold text-accent">{h.kills}K</span>}
                    <span className="text-muted">{h.score.toLocaleString()}</span>
                  </div>
                  <span className={`shrink-0 size-2 rounded-full ${h.isAlive ? 'bg-success' : 'bg-muted'}`} />
                </button>
              ))
            )}
          </div>
        )}
        {q.length < 2 && (
          <div className="px-4 py-6 text-center text-xs text-muted">
            Type at least 2 characters · requires live player data
          </div>
        )}
      </div>
    </div>
  )
}
