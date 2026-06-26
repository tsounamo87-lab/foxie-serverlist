// ─── Badge History Store ──────────────────────────────────────────────────────
// Tracks the ECP badge snapshots seen per player over time (local only).
// Every time we see a player with a different badge than last time, we record it.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PlayerCustom } from '../lib/players'

export interface BadgeSnapshot {
  ts: number
  custom: PlayerCustom
}

interface BadgeHistoryState {
  /** player_name (lowercase) → ordered list of snapshots (newest last) */
  history: Record<string, BadgeSnapshot[]>
  /** Record a badge observation. Only adds a new entry if the badge changed. */
  observe: (playerName: string, custom: PlayerCustom | null) => void
  getHistory: (playerName: string) => BadgeSnapshot[]
}

function customKey(c: PlayerCustom): string {
  return `${c.badge ?? ''}|${c.finish ?? ''}|${c.laser ?? ''}|${c.hue ?? 0}`
}

export const useBadgeHistory = create<BadgeHistoryState>()(
  persist(
    (set, get) => ({
      history: {},

      observe: (playerName, custom) => {
        if (!custom || !playerName?.trim()) return
        const key = playerName.toLowerCase().trim()
        const existing = get().history[key] ?? []
        const last = existing.at(-1)
        // Only record if badge changed (or first time)
        if (last && customKey(last.custom) === customKey(custom)) return
        const snapshot: BadgeSnapshot = { ts: Date.now(), custom }
        set(s => ({
          history: {
            ...s.history,
            [key]: [...existing, snapshot].slice(-20), // keep last 20 snapshots
          },
        }))
      },

      getHistory: (playerName) => {
        const key = playerName.toLowerCase().trim()
        return get().history[key] ?? []
      },
    }),
    {
      name: 'foxie-badge-history',
      // Limit stored data size
      partialize: (s) => {
        // Keep only last 500 players
        const entries = Object.entries(s.history).slice(-500)
        return { history: Object.fromEntries(entries) }
      },
    }
  )
)
