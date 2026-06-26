import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchGames, type GameEntry, type Server } from './starblast'

interface GamesState {
  servers: Server[]
  games: GameEntry[]
  loading: boolean
  error: string | null
  fetchedAt: number | null
  /** Seconds remaining until the next auto refresh. */
  countdown: number
  refresh: () => void
}

/** Polls simstatus.json on an interval, exposing a live countdown. */
export function useGames(refreshSeconds: number): GamesState {
  const [servers, setServers] = useState<Server[]>([])
  const [games, setGames] = useState<GameEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)
  const [countdown, setCountdown] = useState(refreshSeconds)
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const data = await fetchGames(ctrl.signal)
      setServers(data.servers)
      setGames(data.games)
      setFetchedAt(data.fetchedAt)
      setError(null)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError((e as Error).message)
    } finally {
      setLoading(false)
      setCountdown(refreshSeconds)
    }
  }, [refreshSeconds])

  // Initial + interval-driven loads.
  useEffect(() => {
    load()
    const id = setInterval(load, refreshSeconds * 1000)
    return () => {
      clearInterval(id)
      abortRef.current?.abort()
    }
  }, [load, refreshSeconds])

  // 1s countdown ticker.
  useEffect(() => {
    const id = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000)
    return () => clearInterval(id)
  }, [])

  return { servers, games, loading, error, fetchedAt, countdown, refresh: load }
}
