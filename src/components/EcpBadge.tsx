import { useEffect, useRef } from 'react'
import { renderEcpBadge, isImageBadge, badgeImageUrl } from '../lib/ecpRenderer'
import type { PlayerCustom } from '../lib/players'

interface Props {
  custom: PlayerCustom
  /** Height in CSS px. Width = 2× (correct badge aspect ratio). Default 18. */
  size?: number
  className?: string
}

/**
 * Renders an ECP badge with finish + laser.
 *
 * Architecture (avoids canvas cross-origin restrictions):
 *  • Canvas  → badge frame: shape, finish material, laser, shadow
 *              + vector icons (SBGlyphs font, CORS-free)
 *  • <img>   → image icons (discord, csf, dev…) overlaid with CSS clip
 *
 * Both layers are inside a relative container sized at 2h × h.
 */
export function EcpBadge({ custom, size = 18, className = '' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const badgeId = custom.badge && custom.badge !== 'blank' ? custom.badge : ''
  const finish  = custom.finish ?? 'gold'
  const laser   = custom.laser  ?? '0'
  const hue     = custom.hue    ?? 0

  const useImg  = isImageBadge(badgeId)
  const imgUrl  = useImg ? badgeImageUrl(badgeId) : null

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    try {
      renderEcpBadge({ badgeId, finish, laser, hue, size }, (result) => {
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(result, 0, 0, canvas.width, canvas.height)
      })
    } catch (err) {
      console.error(`[EcpBadge] render error (badge=${badgeId || 'blank'}, finish=${finish}):`, err)
    }
  }, [badgeId, finish, laser, hue, size])

  const w = size * 2

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width: w, height: size }}
    >
      {/* Frame: shape + material + laser + shadow (+ vector icon if any) */}
      <canvas
        ref={canvasRef}
        width={w}
        height={size}
        style={{ display: 'block', width: w, height: size, imageRendering: 'crisp-edges' }}
      />

      {/* Image icon: regular <img> overlaid — no canvas CORS restrictions */}
      {imgUrl && (
        <img
          src={imgUrl}
          alt=""
          draggable={false}
          style={{
            position:     'absolute',
            width:        size * 0.88,
            height:       size * 0.88,
            top:          size * 0.06,
            left:         w / 2 - size * 0.44,
            borderRadius: '50%',
            objectFit:    'cover',
            pointerEvents: 'none',
          }}
        />
      )}
    </div>
  )
}
