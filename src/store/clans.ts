// ─── Clan tags store ──────────────────────────────────────────────────────────
// Tags are fetched from JSONBin on app load (shared for all users).
// The Master Key is stored only in the admin's localStorage — visitors never
// have it and therefore cannot write to the bin.

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { remoteFetchTags } from '../lib/clansApi'

interface ClansState {
  /** Current tag list (synced from JSONBin on load, cached locally as fallback). */
  tags: string[]
  /** Whether we've completed the first remote fetch. */
  synced: boolean
  /**
   * Admin Master Key — stored only on this device's localStorage.
   * Empty string = regular visitor (read-only).
   */
  masterKey: string

  /** Internal: replace the tag list (used after a successful remote fetch/save). */
  _setTags: (tags: string[]) => void
  /** Store a master key (persisted in admin's browser). */
  setMasterKey: (key: string) => void
  /** Clear the master key (log out as admin). */
  clearMasterKey: () => void
  /** Returns true if a master key has been entered on this device. */
  isAdmin: () => boolean
  /** Load / refresh tags from JSONBin. */
  syncFromRemote: () => Promise<void>
}

export const useClans = create<ClansState>()(
  persist(
    (set, get) => ({
      tags: [],
      synced: false,
      masterKey: '',

      _setTags: (tags) => set({ tags, synced: true }),

      setMasterKey: (key) => set({ masterKey: key.trim() }),

      clearMasterKey: () => set({ masterKey: '' }),

      isAdmin: () => !!get().masterKey,

      syncFromRemote: async () => {
        const tags = await remoteFetchTags()
        // remoteFetchTags returns null on failure — only overwrite the local
        // cache when we actually got a result (empty array IS a valid result).
        if (tags !== null) {
          set({ tags, synced: true })
        }
      },
    }),
    {
      name: 'foxie-clans',
      // Persist both the local cache and the master key
      partialize: (s) => ({ tags: s.tags, masterKey: s.masterKey }),
    },
  ),
)

// ── Helpers (pure, no store access) ──────────────────────────────────────────

/**
 * Detect if a player name contains a known clan tag.
 * Returns the matching tag string, or null.
 */
export function detectClanTag(playerName: string, tags: string[]): string | null {
  if (!playerName || !tags.length) return null
  const name = playerName.trim()
  const lower = name.toLowerCase()

  for (const tag of tags) {
    const t = tag.trim()
    if (!t) continue
    const tl = t.toLowerCase()

    // Direct prefix or suffix
    if (lower.startsWith(tl) || lower.endsWith(tl)) return tag

    // Bracket-wrapped at start: "[TAG]name", "(TAG)name", "❮TAG❯name"
    const escaped = tl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`^[^\\w\\s]{0,3}${escaped}[^\\w\\s]{0,3}`, 'i').test(lower)) return tag

    // Separator-prefixed: "TAG | name", "TAG-name", "TAG·name"
    if (new RegExp(`^${escaped}\\s*[|\\-·•/.]\\s*`, 'i').test(lower)) return tag
  }
  return null
}
