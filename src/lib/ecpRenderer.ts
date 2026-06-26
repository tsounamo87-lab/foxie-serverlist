// ─── ECP Badge Canvas Renderer ────────────────────────────────────────────────
// Ports bhpsngum.github.io/starblast/ecp/customization.js to TypeScript.
// Renders a full ECP badge (shape + finish material + icon + laser + shadow)
// onto a canvas element. Output is 2:1 aspect (width = 2 * height = 2 * size).
import { BADGES } from './badges'

// ── Badge decoration data (from ecp.json) ────────────────────────────────────
export interface BadgeDeco {
  fill: string
  stroke: string
  unicode?: number       // codepoint in SBGlyphs font
  custom?: number[][]    // 8-row × 11-col pixel art grid
}

const DECORATIONS: Record<string, BadgeDeco> = {
  star:     { unicode: 83,  fill: 'hsl(200,50%,20%)', stroke: 'hsl(50,100%,70%)' },
  reddit:   { unicode: 126, fill: '#246',              stroke: '#FFF' },
  pirate:   { unicode: 127, fill: '#111',              stroke: '#FFF' },
  youtube:  { unicode: 90,  fill: '#B11',              stroke: '#FFF' },
  empire:   { unicode: 82,  fill: '#111',              stroke: '#FFF' },
  alliance: { unicode: 88,  fill: '#111',              stroke: '#F00' },
  sdf:      { unicode: 89,  fill: '#111',              stroke: '#FFF' },
  paw:      { unicode: 86,  fill: '#DA5',              stroke: '#000' },
  invader:  {
    fill: '#111', stroke: 'hsl(120,100%,50%)',
    custom: [
      [0,0,1,0,0,0,0,0,1,0,0],
      [0,0,0,1,0,0,0,1,0,0,0],
      [0,0,1,1,1,1,1,1,1,0,0],
      [0,1,1,0,1,1,1,0,1,1,0],
      [1,1,1,1,1,1,1,1,1,1,1],
      [1,0,1,1,1,1,1,1,1,0,1],
      [1,0,1,0,0,0,0,0,1,0,1],
      [0,0,0,1,1,0,1,1,0,0,0],
    ],
  },
}

/** Image URL for image-based badges, or null for vector/no-image badges. */
function badgeImageUrl(id: string): string | null {
  if (!id || id === 'blank') return null
  // Some players store the image URL directly as the badge ID
  // (e.g. "http://starblast.io/ecp/srcchamp.png"). Use it as-is, upgrading to https.
  if (/^https?:\/\//.test(id)) return id.replace(/^http:\/\//, 'https://')
  const def = BADGES[id]
  if (def) {
    // Known badge: use exact filename (correct extension — may be .jpg or .png)
    return def.file ? `https://starblast.io/ecp/${def.file}` : null
  }
  // Unknown badge code: fall back to conventional .png path
  if (!DECORATIONS[id]) return `https://starblast.io/ecp/${id}.png`
  return null
}

// ── Laser shape generators (from l0OlO in customization.js) ──────────────────
function getLaserShape(n: number): number[][][] {
  switch (n) {
    case 0: { // smooth wave
      const s: number[][] = []
      for (let i = 0; i <= 20; i++) {
        const t = i / 20 * Math.PI * 2
        let x = Math.cos(t), y = Math.sin(t)
        x = x < 0 ? -Math.sqrt(-x) : Math.sqrt(x)
        y = y < 0 ? -Math.sqrt(-y) : Math.sqrt(y)
        s.push([x, y / 3])
      }
      return [s]
    }
    case 1: { // double
      const a: number[][] = [], b: number[][] = []
      for (let i = 0; i <= 20; i++) {
        const t = i / 20 * Math.PI * 2
        let x = Math.cos(t), y = Math.sin(t)
        x = x < 0 ? -Math.sqrt(-x) : Math.sqrt(x)
        y = y < 0 ? -1 : Math.sqrt(y)
        a.push([1.4 * x, 0.2 + y / 10])
      }
      for (let i = 0; i <= 20; i++) {
        const t = i / 20 * Math.PI * 2
        let x = Math.cos(t), y = Math.sin(t)
        x = x < 0 ? -Math.sqrt(-x) : Math.sqrt(x)
        y = y < 0 ? -Math.sqrt(-y) : 1
        b.push([1.4 * x, y / 10 - 0.2])
      }
      return [a, b]
    }
    case 2: return [[[2,0],[1,.1],[.55,.8],[.35,-.1],[.05,.8],[-.25,-.1],[-.55,.8],
      [-1,.1],[-2,0],[-1,-.1],[-.85,-.8],[-.55,.1],[-.25,-.8],[.05,.1],
      [.35,-.8],[.55,.1],[.75,-.8],[1,-.1],[2,0]]]   // lightning
    case 3: return [  // digital
      [[1.4,-.6],[1.1,-.6],[1.1,.6],[1.4,.6]],
      [[.55,-.6],[.25,-.6],[.25,.6],[.55,.6]],
      [[-.55,-.6],[-.25,-.6],[-.25,.6],[-.55,.6]],
      [[-1.4,-.6],[-1.1,-.6],[-1.1,.6],[-1.4,.6]],
    ]
    case 4: { // alien
      const pts: number[][] = []
      const ts = [0,70,90,110,180,250,270,290,360], rs = [1,1,.7,1,1,1,.7,1,1]
      ts.forEach((deg, i) => pts.push([
        Math.cos(deg * Math.PI / 180) * rs[i],
        Math.sin(deg * Math.PI / 180) * rs[i] / 2,
      ]))
      return [pts]
    }
    case 5: return [  // healing (cross)
      [[2,.4],[2,-.4],[-2,-.4],[-2,.4]],
      [[.4,2],[.4,-2],[-.4,-2],[-.4,2]],
    ]
    case 6: { // circle
      const s: number[][] = []
      for (let i = 0; i <= 20; i++) {
        const t = i / 20 * Math.PI * 2
        s.push([Math.cos(t), Math.sin(t)])
      }
      return [s]
    }
    default: return getLaserShape(0)
  }
}

// ── Material (finish) drawing ─────────────────────────────────────────────────
function drawMaterial(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  finish: string, hue: number, size: number,
): void {
  let grad: CanvasGradient | null = null
  const lg = () => ctx.createLinearGradient(0, 0, 0, h)

  switch (finish) {
    case 'x27':
      grad = lg()
      grad.addColorStop(0,   'hsla(220,100%,30%)')
      grad.addColorStop(0.5, 'hsla(200,100%,70%)')
      grad.addColorStop(0.5, 'hsla(220,100%,40%)')
      grad.addColorStop(1,   'hsla(200,100%,70%)')
      break
    case 'alloy':
      grad = lg()
      grad.addColorStop(0,   '#68A')
      grad.addColorStop(0.5, '#FFF')
      grad.addColorStop(0.5, '#765')
      grad.addColorStop(1,   '#CCC')
      break
    case 'fullcolor':
      grad = lg()
      grad.addColorStop(0,   `hsl(${hue},90%,50%)`)
      grad.addColorStop(0.5, `hsl(${hue},90%,70%)`)
      grad.addColorStop(0.5, `hsl(${hue},90%,30%)`)
      grad.addColorStop(1,   `hsl(${hue},90%,60%)`)
      break
    case 'titanium':
      grad = lg()
      grad.addColorStop(0,   '#444')
      grad.addColorStop(0.5, '#AAA')
      grad.addColorStop(0.5, '#444')
      grad.addColorStop(1,   '#111')
      break
    case 'gold':
      grad = lg()
      grad.addColorStop(0,   'hsl(40,100%,50%)')
      grad.addColorStop(0.5, 'hsl(40,100%,80%)')
      grad.addColorStop(0.5, 'hsl(20,100%,30%)')
      grad.addColorStop(1,   'hsl(40,100%,50%)')
      break
    case 'carbon': {
      // O controls the number of carbon-stripe cycles.
      // Minimum 2 so that loop offsets (a+1)/O and (a+0.5)/O stay ≤ 1,
      // avoiding DOMException from addColorStop with offset > 1 on small badges.
      const O = Math.min(10, Math.max(2, size / 10))
      const l1 = lg(), l2 = lg()
      for (let a = 0; a < O; a++) {
        l1.addColorStop(a / O, '#000')
        l1.addColorStop(Math.min(1, (a + 1) / O), '#888')
      }
      l2.addColorStop(0,   '#333')
      l2.addColorStop(0.1, '#888')
      for (let a = 0; a < O; a++) {
        l2.addColorStop(Math.min(1, (a + 0.5) / O), '#000')
        l2.addColorStop(Math.min(1, (a + 1.5) / O), '#888')
      }
      ctx.globalCompositeOperation = 'source-atop'
      for (let a = 0; a < 4 * O; a++) {
        ctx.fillStyle = a % 2 === 0 ? l1 : l2
        ctx.fillRect(a * w / (4 * O), 0, w / (4 * O), h)
      }
      const overlay = lg()
      overlay.addColorStop(0.3, 'rgba(0,0,0,.5)')
      overlay.addColorStop(0.5, 'rgba(0,0,0,0)')
      overlay.addColorStop(0.7, 'rgba(0,0,0,.5)')
      ctx.fillStyle = overlay
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'source-over'
      return
    }
    default: // zinc / silver
      grad = lg()
      grad.addColorStop(0, '#EEE')
      grad.addColorStop(1, '#666')
  }

  ctx.globalCompositeOperation = 'source-atop'
  ctx.fillStyle = grad!
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'source-over'
}

// ── Laser drawing ─────────────────────────────────────────────────────────────
function drawOneSideLaser(
  ctx: CanvasRenderingContext2D,
  h: number, laserIdx: number,
): void {
  const shapes = getLaserShape(laserIdx)
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, h / 6)
  grad.addColorStop(0, 'hsl(50,100%,100%)')
  grad.addColorStop(1, 'hsl(50,80%,40%)')

  for (const poly of shapes) {
    ctx.beginPath()
    for (const [px, py] of poly) ctx.lineTo(px * h / 10, py * h / 9)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.strokeStyle = 'rgba(0,0,0,.8)'
    ctx.lineWidth = h / 24
    ctx.stroke()
    ctx.fill()
  }
}

function drawLaser(
  ctx: CanvasRenderingContext2D,
  w: number, h: number, laserStr: string,
): void {
  const idx = parseInt(laserStr) || 0
  ctx.save()
  ctx.translate(0.12 * w, h / 2)
  ctx.rotate(Math.PI / 2)   // rotate shapes to stand vertical on the wing
  drawOneSideLaser(ctx, h, idx)
  ctx.restore()
  ctx.save()
  ctx.translate(0.88 * w, h / 2)
  ctx.rotate(Math.PI / 2)
  drawOneSideLaser(ctx, h, idx)
  ctx.restore()
}

// ── Main render function ──────────────────────────────────────────────────────
export interface RenderOptions {
  badgeId:  string
  finish:   string   // 'gold' | 'titanium' | 'carbon' | 'alloy' | 'fullcolor' | 'x27' | 'zinc'
  laser:    string   // '0'–'6'
  hue:      number   // ECP hue (for fullcolor finish)
  size:     number   // canvas height in CSS px; width will be 2× this
}

/**
 * Renders the ECP badge FRAME onto a canvas (2:1 aspect):
 *   shape + finish material + laser + highlight + shadow.
 * The icon is intentionally omitted — overlay it separately as an <img>
 * or a vector canvas to avoid cross-origin canvas restrictions.
 *
 * For vector badges (star, pirate…) the icon IS drawn here via the local
 * SBGlyphs font (no CORS issue).
 */
export function renderEcpBadge(
  opts: RenderOptions,
  onDone: (canvas: HTMLCanvasElement) => void,
): void {
  const { badgeId, finish, laser, hue, size: s } = opts
  const w = 2 * s, h = s

  const canvas = document.createElement('canvas')
  canvas.width  = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!

  // ── 1. Badge base shape ───────────────────────────────────────────────────
  ctx.fillStyle = '#000'
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, h / 2, 0, Math.PI * 2, true)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(0.05 * w, 0.25 * h)
  ctx.lineTo(0.05 * w, 0.75 * h)
  ctx.lineTo(w / 2,    0.9  * h)
  ctx.lineTo(0.95 * w, 0.75 * h)
  ctx.lineTo(0.95 * w, 0.25 * h)
  ctx.lineTo(w / 2,    0.1  * h)
  ctx.closePath()
  ctx.fill()

  // ── 2. Arc-ring cuts ──────────────────────────────────────────────────────
  ctx.lineWidth  = 0.07 * h
  ctx.globalCompositeOperation = 'destination-out'
  ctx.strokeStyle = '#000'
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, 0.6 * h, 0, Math.PI * 2, true)
  ctx.stroke()
  ctx.globalCompositeOperation = 'source-over'

  // ── 3. Material / finish ──────────────────────────────────────────────────
  drawMaterial(ctx, w, h, finish, hue, s)

  // ── 4. Vector icon (SBGlyphs font — no CORS) ─────────────────────────────
  const deco = badgeId && badgeId !== 'blank' ? DECORATIONS[badgeId] : undefined
  if (deco) {
    const d = Math.round(h / 2.2)
    ctx.globalCompositeOperation = 'source-atop'
    ctx.fillStyle = deco.fill
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, 0.45 * h, 0, Math.PI * 2, true)
    ctx.fill()
    ctx.fillStyle = deco.stroke

    if (deco.custom) {
      const g = 0.7 * h / 11
      for (let row = 0; row <= 10; row++)
        for (let col = 0; col <= 7; col++) {
          if ((deco.custom[col]?.[row] ?? 0) === 1)
            ctx.fillRect(
              w / 2 + g * (row - 5) - 0.4 * g,
              h / 2 + g * (col - 4) - 0.4 * g,
              0.8 * g, 0.8 * g,
            )
        }
    } else if (deco.unicode != null) {
      ctx.font         = `${d}pt SBGlyphs`
      ctx.textBaseline = 'middle'
      ctx.textAlign    = 'center'
      ctx.fillText(String.fromCodePoint(deco.unicode), w / 2, h / 2)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  // ── 5. Laser ──────────────────────────────────────────────────────────────
  drawLaser(ctx, w, h, laser)

  // ── 6. Material highlight ─────────────────────────────────────────────────
  ctx.globalCompositeOperation = 'source-atop'
  ctx.save()
  ctx.translate(w / 2, h / 2); ctx.scale(w / 2, h / 2)
  const hl = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  hl.addColorStop(0, 'rgba(255,255,255,.2)')
  hl.addColorStop(1, 'rgba(0,0,0,.2)')
  ctx.fillStyle = hl; ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()
  ctx.globalCompositeOperation = 'source-over'

  // ── 7. Icon vignette (skip for blank/vector — no icon to shade) ───────────
  if (deco || (!badgeId || badgeId === 'blank')) {
    // vector or blank: draw vignette in canvas
    _drawVignette(ctx, w, h)
  }
  // for image badges, vignette is drawn after the img is composited — skipped here

  // ── 8. Rear shadow ────────────────────────────────────────────────────────
  ctx.globalCompositeOperation = 'destination-over'
  ctx.save()
  ctx.translate(w / 2, h / 2); ctx.scale(w / 2, h / 2)
  const sh = ctx.createRadialGradient(0, 0, 0, 0, 0, 1)
  sh.addColorStop(0.7, 'rgba(0,0,0,1)')
  sh.addColorStop(1,   'rgba(0,0,0,0)')
  ctx.fillStyle = sh; ctx.fillRect(-1, -1, 2, 2)
  ctx.restore()
  ctx.globalCompositeOperation = 'source-over'

  onDone(canvas)
}

function _drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const vig = ctx.createRadialGradient(
    w / 2 - 0.25 * h, h / 2 - 0.25 * h, 0,
    w / 2, h / 2, 0.45 * h,
  )
  vig.addColorStop(0,   'rgba(0,0,0,0)')
  vig.addColorStop(0.5, 'rgba(0,0,0,0)')
  vig.addColorStop(1,   'rgba(0,0,0,.5)')
  ctx.fillStyle = vig
  ctx.beginPath()
  ctx.arc(w / 2, h / 2, 0.45 * h, 0, Math.PI * 2, true)
  ctx.fill()
}

/** Whether a badge id should be rendered as a CSS <img> (not canvas). */
export function isImageBadge(id: string): boolean {
  if (!id || id === 'blank') return false
  // Full-URL badge IDs are always image badges
  if (/^https?:\/\//.test(id)) return true
  const def = BADGES[id]
  return def ? !!def.file : !DECORATIONS[id]
}

/** The URL for an image badge (or null). */
export { badgeImageUrl }
