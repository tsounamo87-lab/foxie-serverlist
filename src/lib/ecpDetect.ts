// ─── ECP cheat detection ──────────────────────────────────────────────────────
// Validates a player's custom (ECP) fields against the official Starblast ECP
// store values.  Returns an analysis with per-field results + an overall level.

import type { PlayerCustom } from './players'
import { BADGES } from './badges'

// ── Name-based detection ─────────────────────────────────────────────────────

/**
 * In Starblast the client forces the first letter of every name to be
 * uppercase. A name whose letters are ALL lowercase can only exist when
 * the player is using a modified/cheat client.
 * Returns true when the name contains ≥ 2 letters and every letter is lowercase.
 */
export function isLowercaseName(name: string): boolean {
  if (!name || name.length < 2) return false
  const letters = name.replace(/[^a-zA-Z]/g, '')
  if (letters.length < 2) return false   // mostly numbers/symbols — skip
  return letters === letters.toLowerCase()
}

// ── Official valid values ─────────────────────────────────────────────────────

/** Finishes sold in the official ECP store. */
export const VALID_FINISHES = new Set(['alloy', 'titanium', 'gold', 'carbon', 'zinc'])

/** Maximum valid laser index (0 = default, 1–3 = purchased upgrades). */
export const VALID_LASER_MAX = 3

// ── Types ─────────────────────────────────────────────────────────────────────

/** 'none' = field not present, 'clean' = valid, 'suspicious' = unknown/custom,
 *  'cheat' = confirmed illegal value */
export type CheatLevel = 'none' | 'clean' | 'suspicious' | 'cheat'

export interface EcpField {
  value:  string
  level:  CheatLevel
  reason: string | null
}

export interface EcpAnalysis {
  hasEcp:  boolean
  finish:  EcpField | null
  laser:   EcpField | null
  badge:   EcpField | null
  /** Worst level across all fields. */
  overall: 'clean' | 'suspicious' | 'cheat'
}

// ── Core analysis ─────────────────────────────────────────────────────────────

export function analyzeEcp(custom: PlayerCustom | null | undefined): EcpAnalysis | null {
  if (!custom) return null

  // ── Finish ─────────────────────────────────────────────────────────────────
  let finish: EcpField | null = null
  if (custom.finish) {
    const ok = VALID_FINISHES.has(custom.finish)
    finish = {
      value:  custom.finish,
      level:  ok ? 'clean' : 'cheat',
      reason: ok ? null : `"${custom.finish}" is not an official finish`,
    }
  }

  // ── Laser ──────────────────────────────────────────────────────────────────
  let laser: EcpField | null = null
  const laserRaw = custom.laser
  if (laserRaw !== undefined && laserRaw !== null && laserRaw !== '') {
    const n = Number(laserRaw)
    const ok = Number.isFinite(n) && n >= 0 && n <= VALID_LASER_MAX
    laser = {
      value:  String(laserRaw),
      level:  ok ? 'clean' : 'cheat',
      reason: ok ? null : `"${laserRaw}" is not a valid laser (0–${VALID_LASER_MAX})`,
    }
  }

  // ── Badge ──────────────────────────────────────────────────────────────────
  let badge: EcpField | null = null
  if (custom.badge && custom.badge !== 'blank') {
    const b = custom.badge
    if (b in BADGES) {
      badge = { value: b, level: 'clean', reason: null }
    } else if (b.startsWith('http')) {
      // Custom URL badge: could be a legit paid custom badge — mark suspicious
      badge = { value: b, level: 'suspicious', reason: 'Custom URL badge (not in official registry)' }
    } else {
      // Short string not in registry: definitely not official
      badge = { value: b, level: 'suspicious', reason: `"${b}" is not in the official badge registry` }
    }
  }

  // ── Overall ────────────────────────────────────────────────────────────────
  const hasEcp = !!(
    custom.finish ||
    (laserRaw !== undefined && laserRaw !== null && laserRaw !== '') ||
    (custom.badge && custom.badge !== 'blank')
  )

  const levels = [finish?.level, laser?.level, badge?.level]
  let overall: EcpAnalysis['overall'] = 'clean'
  if (levels.includes('cheat'))      overall = 'cheat'
  else if (levels.includes('suspicious')) overall = 'suspicious'

  return { hasEcp, finish, laser, badge, overall }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Short tooltip-friendly summary of why ECP is flagged. */
export function cheatSummary(a: EcpAnalysis): string {
  const parts: string[] = []
  if (a.finish && a.finish.level !== 'clean' && a.finish.level !== 'none')
    parts.push(`Finish: "${a.finish.value}"`)
  if (a.laser && a.laser.level !== 'clean' && a.laser.level !== 'none')
    parts.push(`Laser: "${a.laser.value}"`)
  if (a.badge && a.badge.level !== 'clean' && a.badge.level !== 'none')
    parts.push(`Badge: "${a.badge.value.startsWith('http') ? 'Custom URL' : a.badge.value}"`)
  return parts.join(' · ')
}
