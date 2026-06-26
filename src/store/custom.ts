import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface CustomState {
  keys: string[]
  add: (key: string) => void
  remove: (key: string) => void
}

export const useCustom = create<CustomState>()(
  persist(
    (set) => ({
      keys: [],
      add: (key) =>
        set((s) => ({ keys: s.keys.includes(key) ? s.keys : [...s.keys, key] })),
      remove: (key) =>
        set((s) => ({ keys: s.keys.filter((k) => k !== key) })),
    }),
    { name: 'foxie-custom' }
  )
)

/**
 * Parse any Starblast URL/fragment/key into a composite key "id@address".
 * Accepts:
 *   https://starblast.io/#1234@1.2.3.4
 *   starblast.io/#1234@1.2.3.4
 *   #1234@1.2.3.4
 *   1234@1.2.3.4
 * Returns null if the string doesn't look like a valid Starblast game ref.
 */
export function parseCustomUrl(raw: string): string | null {
  const m = raw.trim().match(/(\d+@[\d.]+)/)
  return m ? m[1] : null
}
