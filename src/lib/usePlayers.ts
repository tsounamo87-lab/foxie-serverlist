import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPlayerData, type PlayerData } from './players'

const PM_MIN_INTERVAL_MS = 15_000

interface PlayersState {
  data: PlayerData | null
  available: boolean
  refresh: () => void
}

/** Polls the live per-player endpoint (Pixelmelt). */
export function usePlayers(refreshSeconds: number): PlayersState {
  const [data, setData] = useState<PlayerData | null>(null)
  const [available, setAvailable] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const d = await fetchPlayerData(ctrl.signal)
      setData(d)
      setAvailable(true)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setAvailable(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = Math.max(refreshSeconds * 1000, PM_MIN_INTERVAL_MS)
    const id = setInterval(load, interval)
    return () => {
      clearInterval(id)
      abortRef.current?.abort()
    }
  }, [load, refreshSeconds])

  return { data, available, refresh: load }
}
