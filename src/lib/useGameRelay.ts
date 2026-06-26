import { useEffect, useRef, useState } from 'react'
import type { Player, PlayerCustom } from './players'
import { getMap } from './mapGen'
import { upsertPlayerEcp } from './db'

// dankdmitron runs a public relay that spectates Starblast TEAM games and
// re-broadcasts mode info (seed, teams) + binary position frames. We read it
// directly from the browser — no backend of our own. Team mode only.
const DEFAULT_RELAY = 'wss://starblast.dankdmitron.dev/api/'
const RELAY_URL = (import.meta.env.VITE_RELAY_URL as string | undefined) || DEFAULT_RELAY

export interface Station {
  hue: number
  phase: number
}

export interface RelayModeInfo {
  seed: number
  mapSize: number
  modeId: string
  /** Underlying mode — for modded games this is the root_mode (e.g. 'team' for alien intrusion). */
  rootMode: string
  teams: Station[]
  servertime: number
  obtainedAt: number
}

/** Per-team live stats from the 0x02 binary frame. */
export interface TeamStat {
  level: number
  open: boolean
  crystals: number
}

interface Profile {
  player_name: string
  hue: number
  custom: PlayerCustom | null
  friendly: number
}

export interface RelayState {
  modeInfo: RelayModeInfo | null
  /** Server-generated asteroid grid (once modeInfo arrives). */
  asteroidGrid: string | null
  /** Live players (real positions + profiles). */
  players: Player[] | null
  /** Team stats (level / gems) from the 0x02 frame. */
  teamStats: TeamStat[] | null
  connected: boolean
  enabled: boolean
}

/** Subscribe to a single system via the dankdmitron relay.
 *  compositeId must be in `"<id>@<ip>:<port>"` format (= GameEntry.key).
 *  Works for all game modes — provides player names + positions for any mode.
 *  Team mode additionally provides map seed, station phases, and team stats.
 *  Reconnects automatically if the relay drops the connection. */
export function useGameRelay(compositeId: string | null): RelayState {
  const [modeInfo, setModeInfo] = useState<RelayModeInfo | null>(null)
  const [asteroidGrid, setAsteroidGrid] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [teamStats, setTeamStats] = useState<TeamStat[] | null>(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!RELAY_URL || !compositeId) return
    setModeInfo(null)
    setAsteroidGrid(null)
    setPlayers(null)
    setTeamStats(null)

    // State shared across reconnections
    const profiles = new Map<number, Profile>()
    const requested = new Set<number>()
    let raf = 0
    let latest: Player[] = []
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null
    let stopped = false
    let attempts = 0

    const flush = () => { setPlayers(latest); raf = 0 }
    const schedule = () => { if (!raf) raf = requestAnimationFrame(flush) }

    const handleMessage = (socket: WebSocket, e: MessageEvent) => {
      // ── JSON messages ──────────────────────────────────────────────
      if (typeof e.data === 'string') {
        let msg: { name: string; data: Record<string, unknown> }
        try { msg = JSON.parse(e.data) } catch { return }

        if (msg.name === 'mode_info') {
          const d = msg.data as Record<string, unknown>
          const mode = d.mode as Record<string, unknown> | undefined
          const rawTeams = (mode?.teams as Array<Record<string, unknown>>) || []

          const teams = rawTeams.map((t) => ({
            hue: (t.hue as number) ?? 0,
            // Try t.phase first, fall back to t.station.phase (relay may vary)
            phase: (t.phase as number)
              ?? ((t.station as Record<string, number> | undefined)?.phase)
              ?? 0,
          }))

          const modeId  = (mode?.id as string) || 'team'
          const rootMode = modeId === 'modding'
            ? ((mode?.root_mode as string) || 'survival')
            : modeId

          const info: RelayModeInfo = {
            seed:       d.seed as number,
            mapSize:    (mode?.map_size as number) || 80,
            modeId,
            rootMode,
            teams,
            servertime: (d.servertime as number) ?? 0,
            obtainedAt: (d.obtainedAt as number) ?? Date.now(),
          }
          setModeInfo(info)

          // Generate the asteroid grid from the seed (runs once, CPU-bound ~50ms)
          try {
            const customMap = mode?.custom_map as string | undefined
            const grid = customMap || getMap(info.seed, info.mapSize, rootMode)
            setAsteroidGrid(grid)
          } catch (err) {
            console.warn('[relay] map gen failed', err)
          }
        }

        if (msg.name === 'player_name') {
          const d = msg.data as Record<string, unknown>
          const name = (d.player_name as string) ?? ''
          if (name) {   // only store non-empty names
            const custom = (d.custom as PlayerCustom | null) ?? null
            profiles.set(d.id as number, {
              player_name: name,
              hue:         (d.hue    as number) ?? 0,
              custom,
              friendly:    (d.friendly as number) ?? 0,
            })
            // Persist ECP to Supabase whenever the relay tells us about it
            if (custom) void upsertPlayerEcp(name, custom)
          }
          // If we have profiles but no binary position frames (non-team mode),
          // expose a name-only player list so the PlayerList can show names.
          // Positions default to 0 — the GameMap won't be shown in non-team mode.
          if (latest.length === 0 && profiles.size > 0) {
            latest = [...profiles.entries()].map(([id, prof]) => ({
              id,
              player_name: prof.player_name,
              hue:         prof.hue,
              custom:      prof.custom,
              friendly:    prof.friendly,
              score:       0,
              kills:       0,
              isAlive:     true,
              ship:        0,
              x:           0,
              y:           0,
            }))
            schedule()
          }
        }
        return
      }

      // ── Binary frames ──────────────────────────────────────────────
      const view = new DataView(e.data as ArrayBuffer)
      const type = view.getUint8(0)

      if (type === 0x01) {
        // Ship snapshot: id(u8) x(f32) y(f32) score(u32) flags(u16)
        const out: Player[] = []
        for (let off = 1; off <= view.byteLength - 15; off += 15) {
          const id = view.getUint8(off)
          const v = view.getUint16(off + 13, true)
          const prof = profiles.get(id)
          if (!prof && !requested.has(id)) {
            requested.add(id)
            try { socket.send(JSON.stringify({ name: 'get_name', data: { id } })) } catch { /* noop */ }
          }
          out.push({
            id,
            x: view.getFloat32(off + 1, true),
            y: view.getFloat32(off + 5, true),
            score: view.getUint32(off + 9, true),
            isAlive: (v & (1 << 15)) !== 0,
            ship: v & ~(1 << 15),
            player_name: prof?.player_name ?? '',
            hue: prof?.hue ?? 0,
            custom: prof?.custom ?? null,
            friendly: prof?.friendly ?? 0,
            kills: 0,
          })
        }
        latest = out
        schedule()
        return
      }

      if (type === 0x02) {
        // Team snapshot: flags(u8) crystals(u32)
        const stats: TeamStat[] = []
        for (let off = 1; off <= view.byteLength - 5; off += 5) {
          const flags = view.getUint8(off)
          stats.push({
            level: flags & 0x0f,
            open: (flags & 0xf0) !== 0,
            crystals: view.getUint32(off + 1, true),
          })
        }
        setTeamStats(stats)
      }
    }

    const connect = () => {
      if (stopped) return

      const socket = new WebSocket(RELAY_URL)
      socket.binaryType = 'arraybuffer'
      ws = socket
      wsRef.current = socket

      socket.onopen = () => {
        attempts = 0
        setConnected(true)
        socket.send(JSON.stringify({ name: 'subscribe', data: { id: compositeId } }))

        // Some relays drop idle connections — re-assert the subscription
        // periodically to keep the stream alive.
        if (heartbeat) clearInterval(heartbeat)
        heartbeat = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            try { socket.send(JSON.stringify({ name: 'subscribe', data: { id: compositeId } })) } catch { /* noop */ }
          }
        }, 25_000)
      }

      socket.onmessage = (e) => handleMessage(socket, e)

      const scheduleReconnect = () => {
        setConnected(false)
        if (heartbeat) { clearInterval(heartbeat); heartbeat = null }
        if (stopped) return
        // Exponential backoff, capped at 8s
        const delay = Math.min(1000 * 2 ** attempts, 8000)
        attempts++
        if (reconnectTimer) clearTimeout(reconnectTimer)
        reconnectTimer = setTimeout(connect, delay)
      }

      socket.onclose = scheduleReconnect
      socket.onerror = () => { try { socket.close() } catch { /* onclose handles reconnect */ } }
    }

    connect()

    return () => {
      stopped = true
      if (raf) cancelAnimationFrame(raf)
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (heartbeat) clearInterval(heartbeat)
      try { ws?.close() } catch { /* noop */ }
      wsRef.current = null
    }
  }, [compositeId])

  return { modeInfo, asteroidGrid, players, teamStats, connected, enabled: !!RELAY_URL }
}
