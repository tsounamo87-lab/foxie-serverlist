// ─── ServerCard ───────────────────────────────────────────────────────────────
// Premium holographic server card:
//   • Full 3D perspective tilt tracking the mouse (direct DOM manipulation,
//     no React re-renders per frame)
//   • Holographic rainbow shimmer overlay following mouse position
//   • Mode-specific neon glow on hover (via --mode-glow CSS var)
//   • Glassmorphism surface + gradient fill bar
//   • Micro-interactions on star / join / copy

import { Clock, Copy, ExternalLink, Star, Users, ShieldAlert, Lock } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { formatUptime, modeLabel } from '../lib/starblast'
import { type EnrichedGame, detectStack } from '../lib/players'
import { aggregateClans } from '../lib/clans'
import { useFilters } from '../store/filters'

// ── Mode palettes ─────────────────────────────────────────────────────────────

const REGION_SHORT: Record<string, string> = { America: 'NA', Europe: 'EU', Asia: 'AS' }

const MODE_STYLE: Record<string, { badge: string; glow: string }> = {
  team:       { badge: 'text-sky-400     bg-sky-400/10     border-sky-400/30',     glow: 'rgba(56,189,248,0.35)' },
  survival:   { badge: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', glow: 'rgba(52,211,153,0.35)' },
  deathmatch: { badge: 'text-rose-400    bg-rose-400/10    border-rose-400/30',    glow: 'rgba(251,113,133,0.35)' },
  invasion:   { badge: 'text-violet-400  bg-violet-400/10  border-violet-400/30',  glow: 'rgba(167,139,250,0.35)' },
  modding:    { badge: 'text-amber-400   bg-amber-400/10   border-amber-400/30',   glow: 'rgba(251,191,36,0.35)' },
}
const MODE_DEFAULT = { badge: 'text-muted bg-surface-2 border-border', glow: 'var(--c-accent-soft)' }

// ── Component ─────────────────────────────────────────────────────────────────

export function ServerCard({ game, onOpen }: { game: EnrichedGame; onOpen: () => void }) {
  const favorites      = useFilters((s) => s.favorites)
  const toggleFavorite = useFilters((s) => s.toggleFavorite)
  const isFav          = favorites.includes(game.key)
  const [copied, setCopied]     = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const live        = game.livePlayers
  const playerCount = live ? live.length : game.players
  const clans       = useMemo(() => (live ? aggregateClans(live) : []), [live])
  const stackInfo   = useMemo(() =>
    game.mode === 'team' && live ? detectStack(live) : null,
  [game.mode, live])

  const copyLink = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(game.joinUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const fill = Math.min(100, Math.round((playerCount / 90) * 100))
  const ms   = MODE_STYLE[game.mode] ?? MODE_DEFAULT

  // ── 3D perspective tilt ─────────────────────────────────────────────────────
  const handleMouseEnter = useCallback(() => {
    const el = cardRef.current
    if (el) el.style.transition = 'box-shadow 0.4s ease'
    setIsHovered(true)
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top)  / r.height
    el.style.transform = `perspective(900px) rotateX(${(y - 0.5) * -13}deg) rotateY(${(x - 0.5) * 13}deg) scale3d(1.028,1.028,1.028)`
    el.style.setProperty('--shine-x', `${x * 100}%`)
    el.style.setProperty('--shine-y', `${y * 100}%`)
  }, [])

  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current
    if (el) {
      el.style.transition = 'transform 0.7s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s ease'
      el.style.transform = ''
    }
    setIsHovered(false)
  }, [])

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen())}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="holo-card card-3d-wrap group relative flex cursor-pointer flex-col gap-3 rounded-[var(--radius-app)] border border-border bg-surface/80 p-4 text-left backdrop-blur-sm focus:outline-none focus-visible:border-accent"
      style={{ '--mode-glow': ms.glow } as React.CSSProperties}
    >
      {/* Holographic mouse-tracking shine */}
      <div className="card-shine-overlay" />

      {/* Hover bottom accent line */}
      <div
        className="pointer-events-none absolute bottom-0 left-6 right-6 h-px rounded-full bg-gradient-to-r from-transparent via-accent to-transparent transition-opacity duration-500"
        style={{ opacity: isHovered ? 0.55 : 0 }}
      />

      {/* ── Top row ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold leading-tight text-text">
              {game.name || `System ${game.id}`}
            </h3>
            {!game.open && <Lock className="size-3.5 shrink-0 text-muted" />}
            {live && (
              <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-success">
                <span className="relative flex size-2 shrink-0">
                  <span className="live-ring scale-75" />
                  <span className="relative block size-2 rounded-full bg-success" />
                </span>
                Live
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
            <span className={`rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${ms.badge}`}>
              {modeLabel(game)}
            </span>
            {stackInfo && stackInfo.level !== 'none' && (
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                stackInfo.level === 'major'
                  ? 'border-warning/40 bg-warning/10 text-warning'
                  : 'border-border bg-surface-2 text-muted'
              }`}>
                {stackInfo.level === 'major' ? 'Stacked' : 'Minor stack'}
              </span>
            )}
            <span className="opacity-35">#{game.id}</span>
            <span className="opacity-25">·</span>
            <span className="font-medium opacity-55">{REGION_SHORT[game.location] ?? game.location}</span>
          </div>
        </div>

        <motion.button
          onClick={(e) => { e.stopPropagation(); toggleFavorite(game.key) }}
          title={isFav ? 'Remove favorite' : 'Add favorite'}
          className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:text-accent"
          whileHover={{ scale: 1.2, rotate: 15 }}
          whileTap={{ scale: 0.85 }}
          transition={{ type: 'spring', stiffness: 400, damping: 12 }}
        >
          <Star className={`size-4 transition-all duration-200 ${isFav ? 'fill-accent text-accent drop-shadow-[0_0_6px_var(--c-accent)]' : ''}`} />
        </motion.button>
      </div>

      {/* ── Player fill bar ── */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-text">
            <Users className="size-3.5 text-muted" />
            <span className="font-num">{playerCount}</span>
            <span className="font-normal text-muted">/ 90</span>
          </span>
          <span className="flex items-center gap-1 text-muted">
            <Clock className="size-3.5" />
            <span className="font-num">{formatUptime(game.time)}</span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bar-gradient transition-all duration-700 ease-out"
            style={{ width: `${fill}%` }}
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="flex items-center gap-1" title="Criminal activity">
            <ShieldAlert className={`size-3.5 ${game.criminal_activity > 3 ? 'text-danger' : 'text-muted'}`} />
            <span className="font-num">{game.criminal_activity}</span>
          </span>
          {clans.length > 0 && (
            <span
              className="rounded-full border border-border/60 bg-surface-2/80 px-2 py-0.5 text-[10px] backdrop-blur-sm"
              title={clans.map((c) => `${c.tag} (${c.count})`).join(', ')}
            >
              {clans.length} clan{clans.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <motion.button
            onClick={copyLink}
            className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-accent/40 hover:text-text"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Copy className="size-3.5" />
            {copied ? 'Copied!' : 'Link'}
          </motion.button>

          <motion.a
            href={game.joinUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="fx-btn-glow flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-on-accent"
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.93 }}
            transition={{ type: 'spring', stiffness: 400, damping: 12 }}
          >
            Join
            <ExternalLink className="size-3" />
          </motion.a>
        </div>
      </div>
    </div>
  )
}
