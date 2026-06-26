// ─── HeroSection ──────────────────────────────────────────────────────────────
// Compact premium hero strip above the stats bar.
// Shows the brand identity + live galaxy stats with count-up animation.

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

// ── Count-up hook ─────────────────────────────────────────────────────────────

function useCountUp(target: number, duration = 1600) {
  const [count, setCount] = useState(0)
  const prev = useRef(0)
  useEffect(() => {
    const from = prev.current
    prev.current = target
    if (from === target) return
    let ts = 0
    const step = (now: number) => {
      if (!ts) ts = now
      const p = Math.min((now - ts) / duration, 1)
      const e = 1 - Math.pow(1 - p, 4) // easeOutQuart
      setCount(Math.round(from + (target - from) * e))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [target, duration])
  return count
}

// ── HUD stat readout ──────────────────────────────────────────────────────────

function HudStat({
  value,
  label,
  colorClass,
}: {
  value: number
  label: string
  colorClass: string
}) {
  const count = useCountUp(value)
  return (
    <div className="text-center tabular-nums">
      <div className={`font-num text-[38px] font-black leading-none ${colorClass}`}>
        {count.toLocaleString()}
      </div>
      <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-muted">
        {label}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface HeroSectionProps {
  totalPlayers: number
  activeGames: number
}

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}
const item = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
}

export function HeroSection({ totalPlayers, activeGames }: HeroSectionProps) {
  return (
    <motion.section
      className="relative mb-6 overflow-hidden"
      variants={container}
      initial="hidden"
      animate="show"
    >
      {/* Ambient glow blobs */}
      <div className="pointer-events-none absolute -left-24 -top-12 size-72 rounded-full bg-accent/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-2 size-56 rounded-full bg-accent-2/[0.05] blur-3xl" />

      <div className="relative flex items-center justify-between gap-6 py-5">
        {/* ── Left: brand identity ── */}
        <motion.div variants={item} className="min-w-0">
          <div className="mb-2 flex items-center gap-2.5">
            <div className="h-px w-7 bg-gradient-to-r from-accent to-transparent" />
            <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-accent">
              Live Network
            </span>
            <span className="relative flex size-1.5">
              <span className="live-ring" />
              <span className="relative block size-1.5 rounded-full bg-success" />
            </span>
          </div>

          <h1 className="text-[clamp(26px,4vw,42px)] font-black leading-none tracking-tighter">
            <span className="gradient-text">Starblast</span>
            {'  '}
            <span className="font-extralight text-text/50">Universe</span>
          </h1>

          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted">
            Real-time server browser. Find your battle, track the galaxy.
          </p>
        </motion.div>

        {/* ── Right: live HUD stats ── */}
        <motion.div
          variants={item}
          className="hidden shrink-0 items-center gap-8 sm:flex"
        >
          <HudStat value={totalPlayers} label="Pilots Active" colorClass="text-accent" />

          <div className="h-16 w-px bg-gradient-to-b from-transparent via-border to-transparent" />

          <HudStat value={activeGames} label="Systems Live" colorClass="text-accent-2" />
        </motion.div>
      </div>

      {/* Separator */}
      <motion.div
        variants={item}
        className="h-px bg-gradient-to-r from-transparent via-accent/25 to-transparent"
      />
    </motion.section>
  )
}
