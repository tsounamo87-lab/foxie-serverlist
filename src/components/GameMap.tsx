import { useEffect, useMemo, useRef } from 'react'
import { playerColor, type Player } from '../lib/players'
import { shipGlyph } from '../lib/ships'
import type { RelayModeInfo } from '../lib/useGameRelay'

// ─── Constants ────────────────────────────────────────────────────────────────
const FONT_SHIP = 'StarblastVanilla'
const GRID_PCT  = [12.5, 25, 37.5, 50, 62.5, 75, 87.5]

// ─── Toroidal shortest-path delta (dankdmitron's shortestPath) ───────────────
// The Starblast map wraps around. A ship going from x=395 to x=-395 actually
// moved +10 units (not -790). Without this, interpolation yanks ships across
// the entire map every time they cross an edge.
function shortestPath1D(a: number, b: number, fullSize: number): number {
  let d = b - a
  if (d >  fullSize / 2) d -= fullSize
  if (d < -fullSize / 2) d += fullSize
  return d
}

// ─── Station theta (from dankdmitron SpectatorV2.js) ─────────────────────────
// steps = (servertime_ms + elapsed_ms) / 1000 * 60
// theta = (steps / 60 / 3600 % 1) * 2π  →  1 full orbit per game-hour
function stationTheta(mi: RelayModeInfo): number {
  const elapsed = Date.now() - mi.obtainedAt
  const steps   = (mi.servertime + elapsed) / 1000 * 60
  return (steps / 60 / 3600 % 1) * Math.PI * 2
}

// ─── Asteroid grid ────────────────────────────────────────────────────────────
function useAsteroids(grid: string | null | undefined, mapSize: number) {
  return useMemo(() => {
    if (!grid || !mapSize) return null
    const rows    = grid.split('\n')
    const cellPct = 100 / mapSize
    const dots: { cx: number; cy: number; r: number }[] = []
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      for (let j = 0; j < row.length; j++) {
        const d = row.charCodeAt(j) - 48
        if (d > 0) dots.push({ cx: (j + 0.5) * cellPct, cy: (i + 0.5) * cellPct, r: (d / 10) * (cellPct / 2) })
      }
    }
    return dots
  }, [grid, mapSize])
}

// ─── Stable starfield ─────────────────────────────────────────────────────────
const STARS = (() => {
  let s = 1337
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  return Array.from({ length: 260 }, () => ({ x: r()*100, y: r()*100, r: r()*1.1+0.2, o: r()*0.5+0.15 }))
})()

// ─── Position log buffer (dankdmitron's exact approach) ──────────────────────
// Each relay frame → one log entry with a real-time timestamp.
// The canvas loop advances activePosition toward the next log at wall-clock rate.
// Ships move at constant velocity between consecutive relay positions → smooth.
interface PosEntry {
  x: number; y: number
  vx: number; vy: number           // velocity (units/ms) — for dead-reckoning extrapolation
  ship: number; alive: boolean; score: number
}
interface PosLog {
  ts: number                        // Date.now() when relay frame arrived
  positions: Map<number, PosEntry>  // id → entry
}

// Per-player profile (name, hue) updated separately from position
interface Profile {
  hue: number; player_name: string; isAlive: boolean
  angle:       number   // current display angle (smoothed at 60fps in RAF loop)
  targetAngle: number   // raw desired angle from velocity (set on relay frames)
}

// ─── Rounded rect (cross-browser) ────────────────────────────────────────────
// ctx.roundRect() was added in Chrome 99 / Firefox 112 / Safari 15.4.
// Older browsers throw TypeError, which silently kills the RAF loop.
// Use arcTo() which works everywhere (IE5.5+).
function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y,     x + w, y + r,     r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x,     y + h, x,     y + h - r, r)
  ctx.lineTo(x,     y + r)
  ctx.arcTo(x,     y,     x + r, y,         r)
  ctx.closePath()
}

// ─── Main component ──────────────────────────────────────────────────────────
export function GameMap({
  players,
  mode,
  size = 560,
  modeInfo,
  asteroidGrid,
}: {
  players: Player[]
  mode: string
  size?: number
  modeInfo?: RelayModeInfo | null
  asteroidGrid?: string | null
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const asteroidDots = useAsteroids(asteroidGrid, modeInfo?.mapSize ?? 0)

  const half = useMemo(() => {
    if (modeInfo) return modeInfo.mapSize * 5
    let m = 160
    for (const p of players) m = Math.max(m, Math.abs(p.x), Math.abs(p.y))
    return Math.ceil((m * 1.12) / 40) * 40
  }, [players, modeInfo])

  // ── Refs shared with canvas loop ─────────────────────────────────────────
  const posLogsRef      = useRef<PosLog[]>([])
  const activePosRef    = useRef<PosLog | null>(null)
  const lastTickRef     = useRef<number>(Date.now())
  const profilesRef     = useRef<Map<number, Profile>>(new Map())
  const halfRef         = useRef(half)
  const dotsRef         = useRef(asteroidDots)
  const modeRef         = useRef(mode)
  const modeInfoRef     = useRef(modeInfo)
  halfRef.current     = half
  dotsRef.current     = asteroidDots
  modeRef.current     = mode
  modeInfoRef.current = modeInfo

  // ── On each relay frame: push to log, update profiles ─────────────────
  useEffect(() => {
    const now       = Date.now()
    const perfNow   = performance.now()
    const positions = new Map<number, PosEntry>()
    const profiles  = profilesRef.current

    for (const p of players) {
      const prev = activePosRef.current?.positions.get(p.id)
        ?? posLogsRef.current.at(-1)?.positions.get(p.id)

      // Compute velocity for dead-reckoning between relay frames
      let vx = 0, vy = 0
      if (prev) {
        const full = halfRef.current * 2
        const dt   = now - (posLogsRef.current.at(-1)?.ts ?? now)
        if (dt > 0) {
          vx = shortestPath1D(prev.x, p.x, full) / dt
          vy = shortestPath1D(prev.y, p.y, full) / dt
        }
      }

      positions.set(p.id, {
        x: p.x, y: p.y, vx, vy,
        ship: p.ship, alive: p.isAlive, score: p.score,
      })

      // Update target heading from velocity (RAF loop smooths to this angle at 60fps)
      const prof = profiles.get(p.id) ?? {
        hue: p.hue, player_name: p.player_name, isAlive: p.isAlive,
        angle: 0, targetAngle: 0,
      }
      if (prev) {
        const full = halfRef.current * 2
        const dx = shortestPath1D(prev.x, p.x, full)
        const dy = shortestPath1D(prev.y, p.y, full)
        const d2 = dx * dx + dy * dy
        if (d2 > 0.5) prof.targetAngle = Math.atan2(-dy, dx)  // screen Y flipped
      }
      prof.hue         = p.hue
      prof.player_name = p.player_name
      prof.isAlive     = p.isAlive
      profiles.set(p.id, prof)
    }

    const log: PosLog = { ts: now, positions }
    posLogsRef.current.push(log)

    // Bootstrap: set active position from first frame
    if (!activePosRef.current) {
      activePosRef.current = { ts: now, positions: new Map(Array.from(positions.entries()).map(([k, v]) => [k, { ...v }] as [number, PosEntry])) }
      lastTickRef.current  = now
    }

    void perfNow  // suppress unused warning
  }, [players])

  // ── 60fps canvas loop — mirrors dankdmitron's tickActivePosition + renderMap ─
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // DPR support: render at device pixel density for crisp visuals
    const dpr = window.devicePixelRatio || 1
    canvas.width  = size * dpr
    canvas.height = size * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)   // all drawing uses CSS-pixel coordinates

    let raf = 0

    const draw = () => {
      try {
      // ── Tick positions (dankdmitron's exact algorithm) ──────────────
      // CRITICAL: always capture now and update lastTick BEFORE ticking,
      // so deltaT never accumulates beyond one RAF frame (~16ms).
      // If lastTick is only updated inside the logs-exist branch, deltaT
      // builds up to the full relay interval (~1s) and ships snap instead of glide.
      const tickNow = Date.now()
      const active  = activePosRef.current
      const logs    = posLogsRef.current

      const rafDt = tickNow - lastTickRef.current  // ms since last RAF frame

      if (active && logs.length > 0) {
        let deltaT = rafDt

        while (deltaT > 0) {
          // Drop logs we've already passed (keep at least 1)
          while (logs.length > 1 && active.ts >= logs[0].ts) logs.shift()

          if (logs.length === 0) break
          const target       = logs[0]
          const timeRequired = target.ts - active.ts

          if (timeRequired <= 0) {
            active.ts        = target.ts
            active.positions = new Map(Array.from(target.positions.entries()).map(([k, v]) => [k, { ...v }] as [number, PosEntry]))
            logs.shift()
            continue
          }

          const timeToTick = Math.min(deltaT, timeRequired)
          deltaT          -= timeToTick
          const frac       = timeToTick / timeRequired

          const full = halfRef.current * 2
          for (const [id, cur] of active.positions) {
            const tgt = target.positions.get(id)
            if (!tgt) continue
            cur.x  += shortestPath1D(cur.x, tgt.x, full) * frac
            cur.y  += shortestPath1D(cur.y, tgt.y, full) * frac
            // Blend velocity toward target's velocity for smoother extrapolation
            cur.vx += (tgt.vx - cur.vx) * frac
            cur.vy += (tgt.vy - cur.vy) * frac
          }

          active.ts += timeToTick

          if (timeToTick >= timeRequired) {
            active.ts        = target.ts
            active.positions = new Map(Array.from(target.positions.entries()).map(([k, v]) => [k, { ...v }] as [number, PosEntry]))
            logs.shift()
          }
        }
      } else if (active && logs.length === 0 && rafDt > 0) {
        // ── Dead-reckoning: no new relay frames — extrapolate with last velocity ──
        const full = halfRef.current * 2
        for (const cur of active.positions.values()) {
          if (!cur.alive) continue
          cur.x += cur.vx * rafDt
          cur.y += cur.vy * rafDt
          // Wrap toroidally so ships don't go out of bounds
          const h = full / 2
          if (cur.x >  h) cur.x -= full
          if (cur.x < -h) cur.x += full
          if (cur.y >  h) cur.y -= full
          if (cur.y < -h) cur.y += full
          // Dampen velocity gently so extrapolation fades after ~2s
          cur.vx *= 0.998
          cur.vy *= 0.998
        }
      }

      // ── Smooth angle toward targetAngle at 60fps (time-constant ~120ms) ────
      const profiles = profilesRef.current
      for (const prof of profiles.values()) {
        let delta = prof.targetAngle - prof.angle
        while (delta >  Math.PI) delta -= Math.PI * 2
        while (delta < -Math.PI) delta += Math.PI * 2
        prof.angle += delta * (1 - Math.exp(-rafDt / 120))
      }

      // Always update lastTick so deltaT stays ≤ one RAF frame on next call
      lastTickRef.current = tickNow

      // ── Render ──────────────────────────────────────────────────────
      const W    = size   // CSS pixels (DPR-scaled via ctx.scale)
      const H    = size
      const h    = halfRef.current
      const dots = dotsRef.current
      const m    = modeRef.current
      const mi   = modeInfoRef.current

      const px = (x: number) => ((x + h) / (h * 2)) * W
      const py = (y: number) => (1 - (y + h) / (h * 2)) * H

      ctx.clearRect(0, 0, W, H)

      // Asteroids / stars
      if (dots) {
        ctx.fillStyle   = '#8899aa'
        ctx.globalAlpha = 0.55
        for (const a of dots) {
          ctx.beginPath()
          ctx.arc(a.cx * W / 100, a.cy * H / 100, a.r * W / 100, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      } else {
        ctx.fillStyle = '#ffffff'
        for (const s of STARS) {
          ctx.globalAlpha = s.o
          ctx.beginPath()
          ctx.arc(s.x * W / 100, s.y * H / 100, s.r * 0.12 * W / 100, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = 1
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth   = 0.5
      for (const g of GRID_PCT) {
        ctx.beginPath(); ctx.moveTo(g * W / 100, 0);            ctx.lineTo(g * W / 100, H);            ctx.stroke()
        ctx.beginPath(); ctx.moveTo(0,            g * H / 100); ctx.lineTo(W,            g * H / 100); ctx.stroke()
      }

      // Team stations — theta-corrected (1 orbit/game-hour, from dankdmitron)
      if (mi?.teams?.length) {
        const radius = (Math.sqrt(2) / 2) * h
        const theta  = stationTheta(mi)
        const sq     = Math.max(7, W * 0.025)

        for (const team of mi.teams) {
          const angle = theta + team.phase
          const sx    = px(radius * Math.cos(angle))
          const sy    = py(radius * Math.sin(angle))

          ctx.shadowColor = `hsl(${team.hue}, 80%, 60%)`
          ctx.shadowBlur  = 14
          ctx.fillStyle   = `hsl(${team.hue}, 80%, 50%)`
          roundedRect(ctx, sx - sq / 2, sy - sq / 2, sq, sq, 2)
          ctx.fill()
          ctx.shadowBlur  = 0
        }
      }

      // Ships (profiles already captured above for angle smoothing)
      const activePos = activePosRef.current

      if (activePos) {
        ctx.textAlign    = 'center'
        ctx.textBaseline = 'middle'

        for (const [id, pos] of activePos.positions) {
          if (!pos.alive) continue
          const prof = profiles.get(id)
          if (!prof) continue

          const screenX = px(pos.x)
          const screenY = py(pos.y)
          const glyph   = shipGlyph(pos.ship, m)
          const color   = playerColor(prof.hue, true)

          if (glyph) {
            ctx.save()
            ctx.translate(screenX, screenY)
            // StarblastVanilla glyphs point UP at angle 0.
            // atan2 gives 0 for rightward motion, so we add π/2 to align:
            // moving right → rotate +π/2 (CW) → glyph points right ✓
            // moving up    → rotate  0          → glyph points up    ✓
            ctx.rotate(prof.angle + Math.PI / 2)
            ctx.font        = `18px ${FONT_SHIP}`
            ctx.fillStyle   = color
            ctx.shadowColor = color
            ctx.shadowBlur  = 5
            ctx.fillText(glyph, 0, 0)
            ctx.shadowBlur  = 0
            ctx.restore()
          } else {
            ctx.fillStyle   = color
            ctx.shadowColor = color
            ctx.shadowBlur  = 5
            ctx.beginPath()
            ctx.arc(screenX, screenY, 4, 0, Math.PI * 2)
            ctx.fill()
            ctx.shadowBlur = 0
          }

          if (prof.player_name) {
            const name = prof.player_name.length > 14 ? prof.player_name.slice(0, 13) + '…' : prof.player_name
            ctx.textBaseline  = 'top'
            ctx.font          = '9px Inter, system-ui, sans-serif'
            ctx.fillStyle     = 'rgba(255,255,255,0.85)'
            ctx.shadowColor   = '#000'
            ctx.shadowBlur    = 2
            ctx.fillText(name, screenX, screenY + 11)
            ctx.shadowBlur    = 0
            ctx.textBaseline  = 'middle'
          }

          // Dead ships (dimmed dots)
        }

        // Dead ships
        for (const [id, pos] of activePos.positions) {
          if (pos.alive) continue
          const prof = profiles.get(id)
          if (!prof) continue
          ctx.globalAlpha = 0.3
          ctx.fillStyle   = playerColor(prof.hue, false)
          ctx.beginPath()
          ctx.arc(px(pos.x), py(pos.y), 3, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
        }
      }

      if (!activePos || activePos.positions.size === 0) {
        ctx.globalAlpha   = 1
        ctx.fillStyle     = 'rgba(255,255,255,0.35)'
        ctx.font          = '13px Inter, system-ui, sans-serif'
        ctx.textAlign     = 'center'
        ctx.textBaseline  = 'middle'
        ctx.fillText('Waiting for positions…', W / 2, H / 2)
      }

      } catch (err) {
        // Swallow any unexpected canvas error so the RAF loop survives.
        // The next frame will re-clear and redraw — no permanent black screen.
        console.error('[GameMap] draw error:', err)
      }
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-black"
      style={{ width: size, height: size, maxWidth: '100%', aspectRatio: '1 / 1' }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}
