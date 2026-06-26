// ─── PremiumCursor ────────────────────────────────────────────────────────────
// Custom dual-ring cursor:
//   • Small solid dot snapping exactly to pointer
//   • Larger ring following with spring lag
//   • Both scale on hover-over interactive elements
//   • Hides on touch devices
//
// Gated by the `effects` setting — does nothing when off.

import { useEffect, useRef } from 'react'
import { useSettings } from '../store/settings'

export function PremiumCursor() {
  const effects  = useSettings((s) => s.effects)
  const dotRef   = useRef<HTMLDivElement>(null)
  const ringRef  = useRef<HTMLDivElement>(null)
  const posRef   = useRef({ x: -200, y: -200 })    // current ring position (lerped)
  const targetRef = useRef({ x: -200, y: -200 })   // exact mouse position
  const rafRef   = useRef(0)

  useEffect(() => {
    if (!effects) return

    const dot  = dotRef.current
    const ring = ringRef.current
    if (!dot || !ring) return

    // Move dot instantly
    const onMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY }
      dot.style.left = `${e.clientX}px`
      dot.style.top  = `${e.clientY}px`
    }

    // Scale up on interactive elements
    const onEnter = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('button, a[href], [role="button"], input, select, textarea')) {
        dot.style.width   = '14px'
        dot.style.height  = '14px'
        ring.style.width  = '48px'
        ring.style.height = '48px'
        ring.style.opacity = '0.4'
      }
    }
    const onLeave = () => {
      dot.style.width   = '8px'
      dot.style.height  = '8px'
      ring.style.width  = '32px'
      ring.style.height = '32px'
      ring.style.opacity = '1'
    }

    // Smooth ring following (lerp)
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)
      posRef.current.x += (targetRef.current.x - posRef.current.x) * 0.12
      posRef.current.y += (targetRef.current.y - posRef.current.y) * 0.12
      ring.style.left = `${posRef.current.x}px`
      ring.style.top  = `${posRef.current.y}px`
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseover', onEnter)
    document.addEventListener('mouseout',  onLeave)
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onEnter)
      document.removeEventListener('mouseout',  onLeave)
      cancelAnimationFrame(rafRef.current)
    }
  }, [effects])

  if (!effects) return null

  return (
    <>
      <div ref={dotRef}  className="cursor-dot"  aria-hidden />
      <div ref={ringRef} className="cursor-ring" aria-hidden />
    </>
  )
}
