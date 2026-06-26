import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPlayerData, type PlayerData, type PlayerCustom } from './players'
import { upsertPlayerEcpBatch } from './db'

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

      // Persist ECP data to Supabase — collect unique ECP players across all
      // games and batch-upsert in a single request (one HTTP call total).
      const ecpEntries: { playerName: string; custom: PlayerCustom }[] = []
      const seen = new Set<string>()
      for (const players of d.byKey.values()) {
        for (const p of players) {
          if (p.custom && p.player_name && !seen.has(p.player_name)) {
            seen.add(p.player_name)
            ecpEntries.push({ playerName: p.player_name, custom: p.custom })
          }
        }
      }
      if (ecpEntries.length) void upsertPlayerEcpBatch(ecpEntries)
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
