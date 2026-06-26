import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const THEMES = [
  'fox', 'midnight', 'nebula', 'terminal', 'daylight',
  'crimson', 'aurora', 'ember', 'void',
  // new
  'solar', 'ocean', 'rose', 'carbon', 'plasma',
] as const
export type Theme = (typeof THEMES)[number]

export const FONTS = ['inter', 'space', 'sora', 'mono'] as const
export type Font = (typeof FONTS)[number]

export const BG_EFFECTS = ['galaxy', 'network', 'stars', 'minimal', 'off'] as const
export type BgEffect = (typeof BG_EFFECTS)[number]

export const RADIUS_STYLES = ['sharp', 'default', 'round'] as const
export type RadiusStyle = (typeof RADIUS_STYLES)[number]

export const SOUND_PRESETS = ['fx', 'sci-fi', 'retro', 'holo', 'minimal', 'deep'] as const
export type SoundPreset = (typeof SOUND_PRESETS)[number]

export const THEME_META: Record<Theme, { label: string; swatch: string }> = {
  fox:      { label: 'Fox',      swatch: '#ff7a2f' },
  midnight: { label: 'Midnight', swatch: '#38bdf8' },
  nebula:   { label: 'Nebula',   swatch: '#c084fc' },
  terminal: { label: 'Terminal', swatch: '#3ddc84' },
  daylight: { label: 'Daylight', swatch: '#e9610f' },
  crimson:  { label: 'Crimson',  swatch: '#e53545' },
  aurora:   { label: 'Aurora',   swatch: '#00e5c8' },
  ember:    { label: 'Ember',    swatch: '#f5a623' },
  void:     { label: 'Void',     swatch: '#e0e0e0' },
  // new themes
  solar:    { label: 'Solar',    swatch: '#f5d000' },
  ocean:    { label: 'Ocean',    swatch: '#0097ff' },
  rose:     { label: 'Rose',     swatch: '#f544c0' },
  carbon:   { label: 'Carbon',   swatch: '#6bffb8' },
  plasma:   { label: 'Plasma',   swatch: '#aa44ff' },
}

export const FONT_META: Record<Font, { label: string }> = {
  inter: { label: 'Inter' },
  space: { label: 'Space Grotesk' },
  sora:  { label: 'Sora' },
  mono:  { label: 'JetBrains Mono' },
}

export const RADIUS_META: Record<RadiusStyle, { label: string; value: string }> = {
  sharp:   { label: 'Sharp',   value: '0.2rem' },
  default: { label: 'Default', value: '0.9rem' },
  round:   { label: 'Round',   value: '1.5rem' },
}

export const SOUND_PRESET_META: Record<SoundPreset, { label: string; desc: string }> = {
  fx:       { label: 'FX',      desc: 'Futuristic & cinematic — sci-fi SFX pack' },
  'sci-fi': { label: 'Sci-Fi',  desc: 'FM synthesis — metallic & electronic' },
  retro:    { label: 'Retro',   desc: '8-bit square waves — chiptune' },
  holo:     { label: 'Holo',    desc: 'Bell FM — crystal & ethereal' },
  minimal:  { label: 'Minimal', desc: 'Soft sines — barely there' },
  deep:     { label: 'Deep',    desc: 'Low bass — heavy & resonant' },
}

interface SettingsState {
  theme:          Theme
  font:           Font
  effects:        boolean
  bgEffect:       BgEffect
  soundVolume:    number        // 0 – 100
  soundPreset:    SoundPreset
  radiusStyle:    RadiusStyle
  refreshSeconds: number
  setTheme:          (t: Theme)        => void
  setFont:           (f: Font)         => void
  setEffects:        (e: boolean)      => void
  setBgEffect:       (b: BgEffect)     => void
  setSoundVolume:    (v: number)       => void
  setSoundPreset:    (p: SoundPreset)  => void
  setRadiusStyle:    (r: RadiusStyle)  => void
  setRefreshSeconds: (n: number)       => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme:          'fox',
      font:           'inter',
      effects:        true,
      bgEffect:       'galaxy',
      soundVolume:    70,
      soundPreset:    'fx',
      radiusStyle:    'default',
      refreshSeconds: 10,
      setTheme:          (theme)          => set({ theme }),
      setFont:           (font)           => set({ font }),
      setEffects:        (effects)        => set({ effects }),
      setBgEffect:       (bgEffect)       => set({ bgEffect }),
      setSoundVolume:    (soundVolume)    => set({ soundVolume }),
      setSoundPreset:    (soundPreset)    => set({ soundPreset }),
      setRadiusStyle:    (radiusStyle)    => set({ radiusStyle }),
      setRefreshSeconds: (refreshSeconds) => set({ refreshSeconds }),
    }),
    { name: 'foxie-settings' }
  )
)

/** Push the current settings onto the <html> element's data-* attributes. */
export function applySettings(s: Pick<SettingsState,
  'theme' | 'font' | 'effects' | 'radiusStyle'>) {
  const el = document.documentElement
  el.dataset.theme   = s.theme
  el.dataset.font    = s.font
  el.dataset.effects = s.effects ? 'on' : 'off'
  el.dataset.radius  = s.radiusStyle
}
