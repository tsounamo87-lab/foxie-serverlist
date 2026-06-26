import { ExternalLink, Lock, Radio, Star } from 'lucide-react'
import { formatUptime, modeLabel } from '../lib/starblast'
import type { EnrichedGame } from '../lib/players'
import { useFilters } from '../store/filters'

export function ServerTable({
  games,
  onOpen,
}: {
  games: EnrichedGame[]
  onOpen: (g: EnrichedGame) => void
}) {
  const favorites = useFilters((s) => s.favorites)
  const toggleFavorite = useFilters((s) => s.toggleFavorite)

  return (
    <div className="overflow-x-auto rounded-[var(--radius-app)] border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="w-8 px-2 py-2"></th>
            <th className="px-3 py-2 text-left font-medium">System</th>
            <th className="px-2 py-2 text-left font-medium">Mode</th>
            <th className="px-2 py-2 text-left font-medium">Region</th>
            <th className="px-2 py-2 text-right font-medium">Players</th>
            <th className="px-2 py-2 text-right font-medium">Uptime</th>
            <th className="px-2 py-2 text-right font-medium">Crime</th>
            <th className="px-3 py-2 text-right font-medium">Join</th>
          </tr>
        </thead>
        <tbody>
          {games.map((g) => {
            const isFav = favorites.includes(g.key)
            const count = g.livePlayers ? g.livePlayers.length : g.players
            return (
              <tr
                key={g.key}
                onClick={() => onOpen(g)}
                className="cursor-pointer border-t border-border transition-colors hover:bg-surface-2/60"
              >
                <td className="px-2 py-2">
                  <span
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(g.key) }}
                    className="inline-flex text-muted hover:text-accent"
                  >
                    <Star className={`size-4 ${isFav ? 'fill-accent text-accent' : ''}`} />
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-text">{g.name || `System ${g.id}`}</span>
                    {!g.open && <Lock className="size-3 text-muted" />}
                    {g.livePlayers && <Radio className="live-dot size-3 text-success" />}
                    <span className="text-xs text-muted">#{g.id}</span>
                  </span>
                </td>
                <td className="px-2 py-2 text-accent-2">{modeLabel(g)}</td>
                <td className="px-2 py-2 text-muted">{g.location}</td>
                <td className="px-2 py-2 text-right font-semibold tabular-nums text-text">{count}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">{formatUptime(g.time)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-muted">{g.criminal_activity}</td>
                <td className="px-3 py-2 text-right">
                  <a
                    href={g.joinUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-semibold text-bg hover:opacity-90"
                  >
                    Join <ExternalLink className="size-3" />
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
