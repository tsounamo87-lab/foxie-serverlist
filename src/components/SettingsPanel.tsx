import { Check, Volume2, X } from 'lucide-react'
import {
  BG_EFFECTS,
  FONTS, FONT_META,
  RADIUS_META, RADIUS_STYLES,
  SOUND_PRESET_META, SOUND_PRESETS,
  THEMES, THEME_META,
  useSettings,
} from '../store/settings'
import { Sounds } from '../lib/sounds'

// ── tiny SVG previews for background modes ─────────────────────────────────

function BgPreviewGalaxy() {
  return (
    <svg width="36" height="24" viewBox="0 0 36 24" className="opacity-80">
      {/* stars */}
      {[[3,3],[8,18],[14,5],[20,20],[28,4],[33,15],[6,11],[25,12],[17,14]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.4 : 0.9} fill="currentColor" opacity={i % 2 === 0 ? 0.9 : 0.5} />
      ))}
      {/* network lines */}
      <line x1="14" y1="5"  x2="17" y2="14" stroke="currentColor" strokeWidth="0.7" opacity="0.35"/>
      <line x1="17" y1="14" x2="25" y2="12" stroke="currentColor" strokeWidth="0.7" opacity="0.35"/>
      <line x1="17" y1="14" x2="20" y2="20" stroke="currentColor" strokeWidth="0.7" opacity="0.35"/>
      {/* gem */}
      <polygon points="28,4 31,8 28,11 25,8" fill="none" stroke="currentColor" strokeWidth="0.9" opacity="0.6"/>
    </svg>
  )
}

function BgPreviewNetwork() {
  const nodes: [number,number][] = [[4,4],[15,3],[26,6],[33,4],[8,13],[18,12],[28,14],[5,21],[14,20],[24,20],[33,20]]
  const edges: [number,number,number,number][] = [
    [4,4,15,3],[15,3,26,6],[15,3,18,12],[18,12,8,13],[18,12,28,14],
    [18,12,14,20],[8,13,14,20],[14,20,24,20],[24,20,28,14],[26,6,28,14]
  ]
  return (
    <svg width="36" height="24" viewBox="0 0 36 24" className="opacity-80">
      {edges.map(([x1,y1,x2,y2],i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="0.8" opacity="0.3"/>
      ))}
      {nodes.map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="1.5" fill="currentColor" opacity={i < 4 ? 0.9 : 0.7}/>
      ))}
    </svg>
  )
}

function BgPreviewStars() {
  const stars: [number,number,number][] = [
    [2,2,1.3],[8,5,0.8],[15,2,1.1],[22,6,0.7],[30,3,1.4],[34,8,0.9],
    [5,12,0.8],[12,15,1.2],[19,11,0.9],[26,14,1.1],[33,12,0.8],
    [3,20,1.0],[9,22,0.7],[17,19,1.3],[24,21,0.8],[31,20,1.1],
  ]
  return (
    <svg width="36" height="24" viewBox="0 0 36 24" className="opacity-80">
      {stars.map(([x,y,r],i) => (
        <circle key={i} cx={x} cy={y} r={r} fill="currentColor" opacity={0.4 + (r - 0.7) * 0.8}/>
      ))}
    </svg>
  )
}

function BgPreviewMinimal() {
  const pts: [number,number][] = [[4,4],[18,6],[32,3],[9,15],[25,18],[35,13],[12,22]]
  return (
    <svg width="36" height="24" viewBox="0 0 36 24" className="opacity-80">
      {pts.map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r="0.9" fill="currentColor" opacity={0.25 + i * 0.04}/>
      ))}
    </svg>
  )
}

const BG_PREVIEW: Record<string, React.ReactNode> = {
  galaxy:  <BgPreviewGalaxy />,
  network: <BgPreviewNetwork />,
  stars:   <BgPreviewStars />,
  minimal: <BgPreviewMinimal />,
  off:     <span className="flex h-[24px] w-9 items-center justify-center rounded border border-dashed border-current opacity-30 text-[10px]">—</span>,
}

const BG_LABEL: Record<string, string> = {
  galaxy:  'Galaxy',
  network: 'Network',
  stars:   'Stars',
  minimal: 'Minimal',
  off:     'None',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSettings()

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 z-40 flex h-full w-[min(400px,90vw)] flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text">Appearance</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:text-text">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">

          {/* ── Theme ──────────────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Theme</h3>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t}
                  onClick={() => { Sounds.click(); s.setTheme(t) }}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm transition-colors ${
                    s.theme === t
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-border bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  <span
                    className="size-3.5 shrink-0 rounded-full ring-1 ring-inset ring-white/10"
                    style={{ background: THEME_META[t].swatch }}
                  />
                  <span className="truncate text-xs">{THEME_META[t].label}</span>
                  {s.theme === t && <Check className="ml-auto size-3.5 shrink-0 text-accent" />}
                </button>
              ))}
            </div>
          </section>

          {/* ── Font ───────────────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Font</h3>
            <div className="grid grid-cols-2 gap-2">
              {FONTS.map((font) => (
                <button
                  key={font}
                  onClick={() => { Sounds.click(); s.setFont(font) }}
                  className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    s.font === font
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-border bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  {FONT_META[font].label}
                </button>
              ))}
            </div>
          </section>

          {/* ── Corner radius ──────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Corner radius</h3>
            <div className="grid grid-cols-3 gap-2">
              {RADIUS_STYLES.map((rs) => (
                <button
                  key={rs}
                  onClick={() => { Sounds.click(); s.setRadiusStyle(rs) }}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-xs transition-colors ${
                    s.radiusStyle === rs
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-border bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  <span className="block h-6 w-10 border-2 border-current"
                    style={{ borderRadius: RADIUS_META[rs].value }} />
                  {RADIUS_META[rs].label}
                  {s.radiusStyle === rs && <Check className="size-3 text-accent" />}
                </button>
              ))}
            </div>
          </section>

          {/* ── Background ─────────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Background</h3>
            <div className="grid grid-cols-5 gap-1.5">
              {BG_EFFECTS.map((be) => (
                <button
                  key={be}
                  onClick={() => { Sounds.click(); s.setBgEffect(be) }}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2.5 text-[9px] transition-colors ${
                    s.bgEffect === be
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-border bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  {BG_PREVIEW[be]}
                  <span className="leading-none">{BG_LABEL[be]}</span>
                  {s.bgEffect === be && <Check className="size-2.5 text-accent" />}
                </button>
              ))}
            </div>
          </section>

          {/* ── Visual effects ─────────────────────────────────────────────── */}
          <section className="flex items-center justify-between rounded-lg border border-border bg-surface-2 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-text">Visual effects</div>
              <div className="text-xs text-muted">Cursor glow, particle trail &amp; click burst</div>
            </div>
            <button
              onClick={() => { Sounds.toggle(); s.setEffects(!s.effects) }}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                s.effects ? 'bg-accent' : 'bg-border'
              }`}
            >
              <span className={`absolute top-[2px] size-5 rounded-full bg-white transition-[left] duration-150 ${
                s.effects ? 'left-[22px]' : 'left-[2px]'
              }`} />
            </button>
          </section>

          {/* ── Sound preset ───────────────────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Sound preset</h3>
            <div className="grid grid-cols-1 gap-1.5">
              {SOUND_PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    s.setSoundPreset(p)
                    // Play the click sound AFTER changing the preset so the user hears the new sound
                    requestAnimationFrame(() => Sounds.click())
                  }}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                    s.soundPreset === p
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-border bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  <span className="font-medium text-xs w-14 shrink-0">{SOUND_PRESET_META[p].label}</span>
                  <span className="text-xs text-muted">{SOUND_PRESET_META[p].desc}</span>
                  {s.soundPreset === p && <Check className="ml-auto size-4 shrink-0 text-accent" />}
                </button>
              ))}
            </div>
          </section>

          {/* ── Sound volume ───────────────────────────────────────────────── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Volume2 className="size-3.5" /> Volume
              </h3>
              <span className="text-xs tabular-nums text-accent">
                {s.soundVolume === 0 ? 'Mute' : `${s.soundVolume}%`}
              </span>
            </div>
            <input
              type="range" min={0} max={100} step={5}
              value={s.soundVolume}
              onChange={(e) => s.setSoundVolume(Number(e.target.value))}
              onMouseUp={() => { if (s.soundVolume > 0) Sounds.click() }}
              className="w-full accent-[var(--c-accent)]"
            />
          </section>

          {/* ── Refresh interval ───────────────────────────────────────────── */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Auto refresh</h3>
              <span className="text-xs tabular-nums text-accent">{s.refreshSeconds}s</span>
            </div>
            <input
              type="range" min={5} max={60} step={5}
              value={s.refreshSeconds}
              onChange={(e) => s.setRefreshSeconds(Number(e.target.value))}
              className="w-full accent-[var(--c-accent)]"
            />
          </section>

        </div>

        <div className="border-t border-border px-5 py-3 text-center text-[11px] text-muted">
          Data from the official Starblast server status
        </div>
      </aside>
    </>
  )
}
