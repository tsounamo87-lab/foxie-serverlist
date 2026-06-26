// ─── Header ───────────────────────────────────────────────────────────────────
// Premium sticky header with:
//   • Animated gradient shimmer border
//   • Gradient brand text + floating logo
//   • Framer Motion magnetic icon buttons (spring scale + translate)
//   • Live status indicator with ring pulse
//   • Magnetic refresh pill with hover translation

import { Activity, Bell, RefreshCw, Settings, Shield, Swords } from 'lucide-react'
import { useRef } from 'react'
import { motion } from 'framer-motion'
import { FoxLogo } from './FoxLogo'

interface HeaderProps {
  loading: boolean
  countdown: number
  alertCount: number
  onRefresh: () => void
  onOpenSettings: () => void
  onOpenAlerts: () => void
  onOpenActivity: () => void
  onOpenTeamActivity: () => void
  onOpenClans: () => void
}

// ── Magnetic button wrapper ──────────────────────────────────────────────────

function MagneticBtn({
  onClick,
  title,
  badge,
  children,
}: {
  onClick: () => void
  title: string
  badge?: number
  children: React.ReactNode
}) {
  const ref = useRef<HTMLButtonElement>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top  + r.height / 2)
    el.style.transform = `translate(${dx * 0.28}px, ${dy * 0.28}px) scale(1.12)`
  }

  const handleMouseLeave = () => {
    const el = ref.current
    if (el) el.style.transform = ''
  }

  return (
    <button
      ref={ref}
      onClick={onClick}
      title={title}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="fx-btn-glow relative rounded-xl border border-border bg-surface/70 p-2 text-muted backdrop-blur transition-[transform,box-shadow,color,border-color] duration-300 hover:border-accent/40 hover:text-accent active:scale-90"
      style={{ transition: 'transform 0.45s cubic-bezier(0.23,1,0.32,1), box-shadow 0.3s ease, color 0.2s, border-color 0.2s' }}
    >
      {children}
      {badge !== undefined && (
        <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-bg ring-2 ring-bg">
          {badge}
        </span>
      )}
    </button>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Header({
  loading,
  countdown,
  alertCount,
  onRefresh,
  onOpenSettings,
  onOpenAlerts,
  onOpenActivity,
  onOpenTeamActivity,
  onOpenClans,
}: HeaderProps) {
  return (
    <header className="header-shimmer-border sticky top-0 z-20 bg-bg/55 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3.5 sm:px-6">

        {/* ── Logo + wordmark ── */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.span
            className="fx-glow-text fx-icon-float relative text-accent"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 300, damping: 10 }}
          >
            <FoxLogo className="size-8 drop-shadow-[0_0_14px_var(--c-accent)]" />
          </motion.span>

          <div className="leading-none">
            <div className="flex items-baseline gap-1.5 text-[17px] font-extrabold tracking-tight">
              <span className="gradient-text">Foxie</span>
              <span className="font-light text-text/45">Server List</span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] text-muted">
              <span className="relative flex size-1.5 shrink-0">
                <span className="live-ring" />
                <span className="relative block size-1.5 rounded-full bg-success" />
              </span>
              Live Starblast
            </div>
          </div>
        </motion.div>

        {/* ── Actions ── */}
        <motion.div
          className="ml-auto flex items-center gap-1.5"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
        >
          <MagneticBtn onClick={onOpenActivity} title="Survival Activity">
            <Activity className="size-4" />
          </MagneticBtn>

          <MagneticBtn onClick={onOpenTeamActivity} title="Team Activity">
            <Swords className="size-4" />
          </MagneticBtn>

          <MagneticBtn onClick={onOpenClans} title="Clan Management">
            <Shield className="size-4" />
          </MagneticBtn>

          <MagneticBtn onClick={onOpenAlerts} title="Alerts" badge={alertCount > 0 ? alertCount : undefined}>
            <Bell className="size-4" />
          </MagneticBtn>

          {/* Refresh pill */}
          <RefreshPill loading={loading} countdown={countdown} onRefresh={onRefresh} />

          <MagneticBtn onClick={onOpenSettings} title="Settings">
            <Settings className="size-4" />
          </MagneticBtn>
        </motion.div>
      </div>
    </header>
  )
}

// ── Magnetic refresh pill ─────────────────────────────────────────────────────

function RefreshPill({ loading, countdown, onRefresh }: { loading: boolean; countdown: number; onRefresh: () => void }) {
  const ref = useRef<HTMLButtonElement>(null)

  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top  + r.height / 2)
    el.style.transform = `translate(${dx * 0.22}px, ${dy * 0.22}px)`
  }

  const handleMouseLeave = () => {
    const el = ref.current
    if (el) el.style.transform = ''
  }

  return (
    <button
      ref={ref}
      onClick={onRefresh}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      title="Refresh"
      className="fx-btn-glow flex items-center gap-2 rounded-full border border-border bg-surface/70 px-3.5 py-2 text-xs font-medium text-muted backdrop-blur transition-[transform,box-shadow,color,border-color] duration-200 hover:border-accent/50 hover:text-text"
      style={{ transition: 'transform 0.45s cubic-bezier(0.23,1,0.32,1), box-shadow 0.3s ease, color 0.2s, border-color 0.2s' }}
    >
      <RefreshCw className={`size-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
      <span className="font-num tabular-nums">{loading ? '···' : `${countdown}s`}</span>
    </button>
  )
}
