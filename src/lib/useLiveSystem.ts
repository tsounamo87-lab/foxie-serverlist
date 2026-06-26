import { useEffect, useRef, useState } from 'react'
import { fetchPlayerData, type Player } from './players'

/**
 * Fast-polls the live player feed for a SINGLE system while a detail view
 * is open, so the map updates far more often than the global list refresh.
 * Positions are CSS-interpolated over `intervalMs` for smooth motion.
 */
export function useLiveSystem(key: string | null, intervalMs = 2000) {
  const [players, setPlayers] = useState<Player[] | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!key) {
      setPlayers(null)
      return
    }
    let cancelled = false

    const load = async () => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      try {
        const data = await fetchPlayerData(ctrl.signal)
        if (!cancelled) setPlayers(data.byKey.get(key) ?? [])
      } catch {
        /* keep last frame on transient errors */
      }
    }

    load()
    const id = setInterval(load, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
      abortRef.current?.abort()
    }
  }, [key, intervalMs])

  return { players, intervalMs }
}
