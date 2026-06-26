// ─── Player Hover Card ────────────────────────────────────────────────────────
// Shows badge, kills, score, status, and full ECP analysis on hover.

import { type Player } from '../lib/players'
import { analyzeEcp } from '../lib/ecpDetect'
import type { CheatLevel } from '../lib/ecpDetect'
import { PlayerAvatar } from './PlayerAvatar'
import { CheatBadge } from './CheatBadge'
import { Wrench, Swords, Star } from 'lucide-react'

function levelColor(l: CheatLevel): string {
  if (l === 'cheat')      return 'text-danger font-semibold'
  if (l === 'suspicious') return 'text-warning'
  if (l === 'clean')      return 'text-success'
  return 'text-muted'
}

function levelLabel(l: CheatLevel): string {
  if (l === 'cheat')      return '✗'
  if (l === 'suspicious') return '?'
  if (l === 'clean')      return '✓'
  return ''
}

export function PlayerHoverCard({ player }: { player: Player }) {
  const isEcp = !!player.custom
  const ecp   = analyzeEcp(player.custom)

  return (
    <div className="pointer-events-none absolute z-[100] min-w-[180px] rounded-lg border border-border bg-surface shadow-xl p-3 text-xs"
      style={{ bottom: '110%', left: '50%', transform: 'translateX(-50%)' }}>

      {/* Badge + name */}
      <div className="flex items-center gap-2 mb-2">
        <PlayerAvatar player={player} size="md" />
        <div className="min-w-0">
          <p className={`truncate font-semibold ${isEcp ? 'text-accent' : 'text-text'}`}>
            {player.player_name || 'Unknown'}
          </p>
          <div className="flex items-center gap-1 mt-0.5">
            {isEcp && <span className="text-[10px] text-accent/70">ECP</span>}
            {ecp && ecp.overall !== 'clean' && (
              <CheatBadge custom={player.custom} />
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-muted">
        <span className="flex items-center gap-1">
          <Swords className="size-3" />{player.kills}K
        </span>
        <span className="flex items-center gap-1">
          <Star className="size-3" />{player.score.toLocaleString()}
        </span>
        <span className={`ml-auto size-1.5 rounded-full ${player.isAlive ? 'bg-success' : 'bg-muted'}`} />
      </div>

      {/* ECP breakdown — only shown when ECP is present */}
      {ecp && ecp.hasEcp && (
        <div className="mt-2 pt-2 border-t border-border/40 space-y-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Wrench className="size-3 text-muted" />
            <span className="text-[9px] font-semibold uppercase tracking-wide text-muted">ECP Materials</span>
          </div>

          {ecp.finish && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Finish</span>
              <span className={`flex items-center gap-1 ${levelColor(ecp.finish.level)}`}>
                <span className="opacity-60 text-[9px]">{levelLabel(ecp.finish.level)}</span>
                {ecp.finish.value}
              </span>
            </div>
          )}

          {ecp.laser && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Laser</span>
              <span className={`flex items-center gap-1 ${levelColor(ecp.laser.level)}`}>
                <span className="opacity-60 text-[9px]">{levelLabel(ecp.laser.level)}</span>
                {ecp.laser.value}
              </span>
            </div>
          )}

          {ecp.badge && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Badge</span>
              <span
                className={`flex items-center gap-1 max-w-[100px] truncate ${levelColor(ecp.badge.level)}`}
                title={ecp.badge.reason ?? undefined}
              >
                <span className="opacity-60 text-[9px]">{levelLabel(ecp.badge.level)}</span>
                {ecp.badge.value.startsWith('http') ? 'Custom URL' : ecp.badge.value}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Wrap any element to show a hover card on mouseover */
export function WithHoverCard({ player, children }: { player: Player; children: React.ReactNode }) {
  return (
    <span className="relative group">
      {children}
      <span className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-opacity delay-300">
        <PlayerHoverCard player={player} />
      </span>
    </span>
  )
}
