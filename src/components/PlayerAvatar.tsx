// ─── PlayerAvatar ────────────────────────────────────────────────────────────
// Shows the player's ECP badge (with finish + laser) or a fallback:
//   • custom badge / finish / laser  → full canvas-rendered ECP badge
//   • ECP, no badge                  → accent star (★) to signal ECP status
//   • normal player                  → color dot
import { playerColor, type Player } from '../lib/players'
import { EcpBadge } from './EcpBadge'

interface AvatarProps {
  player: Player
  /** px size for badge / dot */
  size?: 'sm' | 'md'
}

export function PlayerAvatar({ player, size = 'md' }: AvatarProps) {
  const dotSize  = size === 'sm' ? 'size-1.5' : 'size-2'
  // badge height; displayed width = 2× this (correct 2:1 aspect ratio)
  const badgePx  = size === 'sm' ? 14 : 18

  if (player.custom) {
    // Always render via canvas — blank badge shows the ECP shape + finish + laser
    // with no icon in the center, which is the correct "ECP without badge" look.
    return (
      <EcpBadge
        custom={player.custom}
        size={badgePx}
        className="rounded-sm"
      />
    )
  }

  // Non-ECP player — plain color dot
  return (
    <span
      className={`${dotSize} shrink-0 rounded-full`}
      style={{ background: playerColor(player.hue, player.isAlive) }}
    />
  )
}

/** Tailwind classes to apply to an ECP player's row/chip */
export function ecpRowClass(player: Player): string {
  return player.custom ? 'ring-1 ring-accent/20' : ''
}
