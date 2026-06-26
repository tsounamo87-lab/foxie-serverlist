import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Sample {
  t: number
  players: number
  systems: number
}

const GLOBAL_CAP = 240 // points kept for the global chart
const SYSTEM_CAP = 90 // points kept per system (in-memory only)

interface HistoryState {
  global: Sample[]
  perSystem: Record<string, Sample[]>
  record: (players: number, systems: number, perSystem: [string, number][]) => void
}

export const useHistory = create<HistoryState>()(
  persist(
    (set) => ({
      global: [],
      perSystem: {},
      record: (players, systems, perSystem) =>
        set((state) => {
          const t = Date.now()
          const global = [...state.global, { t, players, systems }].slice(-GLOBAL_CAP)
          const next: Record<string, Sample[]> = { ...state.perSystem }
          for (const [key, count] of perSystem) {
            const prev = next[key] ?? []
            next[key] = [...prev, { t, players: count, systems: 1 }].slice(-SYSTEM_CAP)
          }
          return { global, perSystem: next }
        }),
    }),
    {
      name: 'foxie-history',
      partialize: (s) => ({ global: s.global }),
    }
  )
)
