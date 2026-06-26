// ------------------------------------------------------------------
//  Starblast data layer.
//  We use dankdmitron's simstatus proxy instead of starblast.io directly:
//  it returns the same data PLUS any custom games shared by players
//  (via the SV+ "Publish" button or the "Share Custom Game" feature).
//  Both APIs are CORS-open. Fallback to the official URL if needed.
// ------------------------------------------------------------------

export const SIMSTATUS_URL = 'https://starblast.dankdmitron.dev/api/simstatus.json'
const SIMSTATUS_FALLBACK_URL = 'https://game.starblast.io/simstatus.json'
const SIMSTATUS_TIMEOUT_MS = 7_000
/** POST a game URL here to share it → appears for all users on both Foxie and dankdmitron. */
export const SHARE_CUSTOM_URL = 'https://starblast.dankdmitron.dev/api/post'

/** A single live game/system running on a server. */
export interface System {
  name: string
  id: number
  mode: string
  players: number
  unlisted: boolean
  open: boolean
  survival: boolean
  time: number // seconds the system has been alive
  criminal_activity: number
  mod_id?: string
}

/** A physical server (one address) hosting several systems. */
export interface ServerUsage {
  cpu: number
  memory: number
  ctime: number
  elapsed: number
  timestamp: number
  pid: number
  ppid: number
}

export interface Server {
  location: string
  address: string
  current_players: number
  systems: System[]
  usage: ServerUsage
}

/** Flattened view: one system + its parent server context. */
export interface GameEntry extends System {
  location: string
  address: string
  /** Stable key across refreshes. */
  key: string
  /** Direct join URL into this exact system. */
  joinUrl: string
}

export const REGIONS = ['America', 'Europe', 'Asia'] as const
export type Region = (typeof REGIONS)[number]

/** Human-friendly mode labels (no emoji — clean text). */
export const MODE_LABELS: Record<string, string> = {
  team: 'Team',
  survival: 'Survival',
  deathmatch: 'Deathmatch',
  modding: 'Modded',
  invasion: 'Invasion',
}

export function modeLabel(s: System): string {
  if (s.mode === 'modding' && s.mod_id) return s.mod_id.toUpperCase()
  return MODE_LABELS[s.mode] ?? s.mode.charAt(0).toUpperCase() + s.mode.slice(1)
}

async function fetchSimstatus(url: string, signal?: AbortSignal): Promise<Server[]> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort('timeout'), SIMSTATUS_TIMEOUT_MS)
  signal?.addEventListener('abort', () => ctrl.abort())
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`simstatus ${res.status}`)
    return res.json() as Promise<Server[]>
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch + flatten all systems into a single sortable list. */
export async function fetchGames(signal?: AbortSignal): Promise<{
  servers: Server[]
  games: GameEntry[]
  fetchedAt: number
}> {
  let servers: Server[]
  try {
    servers = await fetchSimstatus(SIMSTATUS_URL, signal)
  } catch (e) {
    if (signal?.aborted) throw e
    servers = await fetchSimstatus(SIMSTATUS_FALLBACK_URL, signal)
  }

  const games: GameEntry[] = []
  const seen = new Set<string>()
  for (const server of servers) {
    for (const sys of server.systems) {
      const key = `${sys.id}@${server.address}`
      if (seen.has(key)) continue // simstatus can list a system twice
      seen.add(key)
      games.push({
        ...sys,
        location: server.location,
        address: server.address,
        key,
        joinUrl: `https://starblast.io/#${sys.id}@${server.address}`,
      })
    }
  }
  return { servers, games, fetchedAt: Date.now() }
}

/** Format seconds-alive into a compact "1h 23m" / "4m" string. */
export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${seconds}s`
}
