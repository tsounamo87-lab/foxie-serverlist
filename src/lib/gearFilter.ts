// ─── ECP gear filter ───────────────────────────────────────────────────────────
// Lets the activity lists be searched by exact material composition
// (badge + finish + laser + hue) instead of just player name.

import type { PlayerCustom } from './players'
import { VALID_FINISHES, VALID_LASER_MAX } from './ecpDetect'

export { VALID_FINISHES, VALID_LASER_MAX }

// ── Hue → colour name bucket (mirrors TeamSidebar's teamColorName) ────────────

export const HUE_COLORS = [
  { name: 'Red',    swatch: 'hsl(0, 75%, 55%)' },
  { name: 'Orange', swatch: 'hsl(35, 80%, 55%)' },
  { name: 'Yellow', swatch: 'hsl(55, 80%, 55%)' },
  { name: 'Green',  swatch: 'hsl(115, 65%, 45%)' },
  { name: 'Teal',   swatch: 'hsl(180, 60%, 42%)' },
  { name: 'Blue',   swatch: 'hsl(220, 75%, 58%)' },
  { name: 'Violet', swatch: 'hsl(270, 60%, 62%)' },
  { name: 'Pink',   swatch: 'hsl(320, 70%, 62%)' },
] as const
export type HueColorName = (typeof HUE_COLORS)[number]['name']

export function hueToColorName(hue: number): HueColorName {
  const h = ((hue % 360) + 360) % 360
  if (h < 20 || h >= 340) return 'Red'
  if (h < 50)  return 'Orange'
  if (h < 80)  return 'Yellow'
  if (h < 160) return 'Green'
  if (h < 200) return 'Teal'
  if (h < 260) return 'Blue'
  if (h < 290) return 'Violet'
  return 'Pink'
}

export const LASER_TIERS = Array.from({ length: VALID_LASER_MAX + 1 }, (_, i) => String(i))
export const FINISH_OPTIONS = [...VALID_FINISHES]

// ── Filter state ────────────────────────────────────────────────────────────────

/** Every field is either 'any' (no constraint) or a specific value. Badge also accepts 'none'. */
export interface GearFilter {
  badge:  string
  finish: string
  laser:  string
  hue:    string
}

export const EMPTY_GEAR_FILTER: GearFilter = { badge: 'any', finish: 'any', laser: 'any', hue: 'any' }

export function isGearFilterActive(f: GearFilter): boolean {
  return f.badge !== 'any' || f.finish !== 'any' || f.laser !== 'any' || f.hue !== 'any'
}

export function activeGearFilterCount(f: GearFilter): number {
  return [f.badge, f.finish, f.laser, f.hue].filter((v) => v !== 'any').length
}

/** True when `custom` satisfies every non-'any' constraint in `f`. */
export function matchesGearFilter(custom: PlayerCustom | null | undefined, f: GearFilter): boolean {
  if (!isGearFilterActive(f)) return true
  if (!custom) return false

  if (f.badge !== 'any') {
    const b = custom.badge && custom.badge !== 'blank' ? custom.badge : null
    if (f.badge === 'none') {
      if (b) return false
    } else if (b !== f.badge) {
      return false
    }
  }
  if (f.finish !== 'any' && (custom.finish ?? '') !== f.finish) return false
  if (f.laser !== 'any' && String(custom.laser ?? '0') !== f.laser) return false
  if (f.hue !== 'any' && hueToColorName(custom.hue ?? 0) !== f.hue) return false

  return true
}
