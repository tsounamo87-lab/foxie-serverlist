import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameEntry } from '../lib/starblast'

export type SortKey = 'players' | 'uptime' | 'name' | 'criminal'
export type RegionFilter = 'all' | 'America' | 'Europe' | 'Asia'
export type ViewMode = 'grid' | 'table' | 'grouped'

interface FiltersState {
  search: string
  region: RegionFilter
  modes: string[] // empty = all
  sort: SortKey
  view: ViewMode
  hideEmpty: boolean
  openOnly: boolean
  favorites: string[] // GameEntry.key list
  favoritesOnly: boolean
  customOnly: boolean
  freshMinutes: number | null   // null = off; number = max age in minutes
  setSearch: (s: string) => void
  setRegion: (r: RegionFilter) => void
  toggleMode: (m: string) => void
  clearModes: () => void
  setSort: (s: SortKey) => void
  setView: (v: ViewMode) => void
  setHideEmpty: (b: boolean) => void
  setOpenOnly: (b: boolean) => void
  toggleFavorite: (key: string) => void
  setFavoritesOnly: (b: boolean) => void
  setCustomOnly: (b: boolean) => void
  setFreshMinutes: (n: number | null) => void
}

export const useFilters = create<FiltersState>()(
  persist(
    (set) => ({
      search: '',
      region: 'all',
      modes: [],
      sort: 'players',
      view: 'grid',
      hideEmpty: false,
      openOnly: false,
      favorites: [],
      favoritesOnly: false,
      customOnly: false,
      freshMinutes: null,
      setSearch: (search) => set({ search }),
      setRegion: (region) => set({ region }),
      toggleMode: (m) =>
        set((s) => ({
          modes: s.modes.includes(m) ? s.modes.filter((x) => x !== m) : [...s.modes, m],
        })),
      clearModes: () => set({ modes: [] }),
      setSort: (sort) => set({ sort }),
      setView: (view) => set({ view }),
      setHideEmpty: (hideEmpty) => set({ hideEmpty }),
      setOpenOnly: (openOnly) => set({ openOnly }),
      toggleFavorite: (key) =>
        set((s) => ({
          favorites: s.favorites.includes(key)
            ? s.favorites.filter((k) => k !== key)
            : [...s.favorites, key],
        })),
      setFavoritesOnly: (favoritesOnly) => set({ favoritesOnly }),
      setCustomOnly: (customOnly) => set({ customOnly }),
      setFreshMinutes: (freshMinutes) => set({ freshMinutes }),
    }),
    {
      name: 'foxie-filters',
      partialize: (s) => ({
        favorites:     s.favorites,
        sort:          s.sort,
        view:          s.view,
        region:        s.region,
        modes:         s.modes,
        favoritesOnly: s.favoritesOnly,
        customOnly:    s.customOnly,
        freshMinutes:  s.freshMinutes,
        hideEmpty:     s.hideEmpty,
        openOnly:      s.openOnly,
      }),
    }
  )
)

/** Apply all active filters + sorting to a flat games list. */
export function applyFilters<T extends GameEntry>(games: T[], f: FiltersState): T[] {
  const q = f.search.trim().toLowerCase()
  let out = games.filter((g) => {
    if (f.region !== 'all' && g.location !== f.region) return false
    if (f.modes.length > 0) {
      const m = g.mode === 'modding' && g.mod_id ? `mod:${g.mod_id}` : g.mode
      if (!f.modes.includes(g.mode) && !f.modes.includes(m)) return false
    }
    if (f.hideEmpty && g.players === 0) return false
    if (f.openOnly && !g.open) return false
    if (f.favoritesOnly && !f.favorites.includes(g.key)) return false
    if (f.customOnly && !(g as Record<string, unknown>).isCustom) return false
    if (f.freshMinutes !== null && g.time > f.freshMinutes * 60) return false
    if (q) {
      const hay = `${g.name} ${g.mode} ${g.mod_id ?? ''} ${g.id} ${g.location}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  out = out.sort((a, b) => {
    switch (f.sort) {
      case 'players':
        return b.players - a.players
      case 'uptime':
        return b.time - a.time
      case 'criminal':
        return b.criminal_activity - a.criminal_activity
      case 'name':
        return a.name.localeCompare(b.name)
    }
  })
  return out
}
