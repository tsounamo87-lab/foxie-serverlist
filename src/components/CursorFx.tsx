// ─── CursorFx ─────────────────────────────────────────────────────────────────
// Renders:
//   • A soft radial glow that follows the mouse (drawn on canvas)
//   • A sparkle particle trail while moving
//   • A burst of particles on every click
//
// Also wires up Web Audio click sounds for all buttons.
// Everything is gated by the global "effects" setting and unmounts cleanly.

import { useEffect, useRef } from 'react'
import { useSettings } from '../store/settings'
import { Sounds } from '../lib/sounds'

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number   // 1 → 0
  size: number
  color: string
  burst: boolean
}

// ── helpers ───────────────────────────────────────────────────────────────────

function readAccent(): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--c-accent').trim() || '#ff7a2f'
}

// Build a small sparkle palette from the current accent hue.
// We append two-hex-digit alpha suffixes to the base colour.
function palette(accent: string): string[] {
  // accent is always a #rrggbb hex (from our theme vars)
  return [
    accent,
    accent + 'cc',  // 80 %
    accent + '99',  // 60 %
    '#ffcc77',
    '#ffaa55',
  ]
}

// ── component ─────────────────────────────────────────────────────────────────

export function CursorFx() {
  const effects = useSettings((s) => s.effects)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particles = useRef<Particle[]>([])
  const mousePos = useRef({ x: -9999, y: -9999 })
  const lastTrail = useRef({ x: -9999, y: -9999 })
  const rafId = useRef(0)

  // ── render loop (particles + glow) ────────────────────────────────────────
  useEffect(() => {
    if (!effects) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize, { passive: true })

    let frame = 0

    const loop = () => {
      rafId.current = requestAnimationFrame(loop)
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // ── Glow spotlight ──────────────────────────────────────────────────
      const { x: mx, y: my } = mousePos.current
      if (mx > 0) {
        // Re-read accent every 90 frames (~1.5 s) to pick up theme changes.
        if (frame++ % 90 === 0) {
          // (accent is recaptured inside the gradient below)
        }
        const accent = readAccent()
        const grad = ctx.createRadialGradient(mx, my, 0, mx, my, 560)
        // hex + '18' = 9 % alpha — subtle highlight, not distracting
        grad.addColorStop(0, accent + '18')
        grad.addColorStop(0.5, accent + '08')
        grad.addColorStop(1, accent + '00')
        ctx.fillStyle = grad
        ctx.fillRect(0, 0, canvas.width, canvas.height)
      }

      // ── Particles ───────────────────────────────────────────────────────
      for (let i = particles.current.length - 1; i >= 0; i--) {
        const p = particles.current[i]
        p.life -= p.burst ? 0.042 : 0.058
        if (p.life <= 0) { particles.current.splice(i, 1); continue }

        p.x += p.vx
        p.y += p.vy
        p.vy += p.burst ? 0.11 : 0.025   // gravity
        p.vx *= 0.97

        const r = Math.max(0.15, p.life) * p.size
        ctx.save()
        ctx.globalAlpha = p.life * (p.burst ? 0.88 : 0.72)
        ctx.shadowBlur = p.burst ? 12 : 6
        ctx.shadowColor = p.color
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
    }

    rafId.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafId.current)
      window.removeEventListener('resize', resize)
      particles.current = []
    }
  }, [effects])

  // ── mouse trail ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!effects) return

    const onMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY }

      const dx = e.clientX - lastTrail.current.x
      const dy = e.clientY - lastTrail.current.y
      // Only spawn if the cursor moved at least 10 px since last spawn
      if (dx * dx + dy * dy < 100) return

      lastTrail.current = { x: e.clientX, y: e.clientY }
      const cols = palette(readAccent())

      for (let i = 0; i < 2; i++) {
        const spread = (Math.random() - 0.5) * Math.PI * 0.8
        const angle = -Math.PI / 2 + spread
        const speed = Math.random() * 1.1 + 0.25
        particles.current.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(angle) * speed * 0.5,
          vy: Math.sin(angle) * speed - 0.4,
          life: 1,
          size: Math.random() * 1.8 + 0.7,
          color: cols[Math.floor(Math.random() * cols.length)],
          burst: false,
        })
      }
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      // Reset glow when effects are toggled off
      mousePos.current = { x: -9999, y: -9999 }
    }
  }, [effects])

  // ── click burst + sound ───────────────────────────────────────────────────
  useEffect(() => {
    if (!effects) return

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const interactive = target.closest('button, a[href], [role="button"]')
      if (!interactive) return

      // Choose sound based on the button type
      const txt = (interactive.textContent ?? '').toLowerCase()
      if (txt.includes('join'))               Sounds.join()
      else if (interactive.closest('aside'))  Sounds.click()   // settings drawer
      else                                    Sounds.click()

      // Particle burst at cursor position
      const cols = palette(readAccent())
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4
        const speed = Math.random() * 4.5 + 1.2
        particles.current.push({
          x: e.clientX,
          y: e.clientY,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          size: Math.random() * 2.8 + 1,
          color: cols[Math.floor(Math.random() * cols.length)],
          burst: true,
        })
      }
    }

    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [effects])

  // When effects are off, render nothing
  if (!effects) return null

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[9999]"
      aria-hidden="true"
    />
  )
}
