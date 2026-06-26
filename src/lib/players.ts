// ------------------------------------------------------------------
//  Live per-player data — enriches the simstatus server list.
//  Primary:  https://api.pixelmelt.dev/games  (full game state + seed)
//  Fallback: https://api.pixelmelt.dev/players (flat list, no seed)
// ------------------------------------------------------------------

import type { GameEntry } from './starblast'

const PM_GAMES_URL   = 'https://api.pixelmelt.dev/games'
const PM_PLAYERS_URL = 'https://api.pixelmelt.dev/players'

/** ECP customization attached to premium players. */
export interface PlayerCustom {
  badge?: string
  finish?: string
  laser?: string
  hue?: number
}

export interface Player {
  id:          number
  player_name: string
  score:       number
  kills:       number
  ship:        number
  hue:         number
  isAlive:     boolean
  x:           number
  y:           number
  custom:      PlayerCustom | null
  friendly:    number
  compositeId?: string
}

/** Seed + map info for a game — from Pixelmelt /games response.
 *  Used to generate the asteroid grid in all modes (not just team). */
export interface GameSeedInfo {
  seed:     number
  mapSize:  number
  modeId:   string
  rootMode: string   // for modded games: the underlying mode (team/survival/…)
}

export interface PlayerData {
  /** compositeId → players */
  byKey:     Map<string, Player[]>
  /** compositeId → seed info (only for games Pixelmelt is tracking) */
  seedByKey: Map<string, GameSeedInfo>
  fetchedAt: number
}

// ── Internal shape of one entry in /games ────────────────────────────────────
interface PixelmeltGame {
  compositeId?: string
  seed?:        number
  players?:     Partial<Player>[]
  mode?:        {
    map_size?: number
    id?:       string
    root_mode?: string
    [k: string]: unknown
  }
}

function normalizePlayer(p: Partial<Player>): Player {
  return {
    id:          (p.id          as number)  ?? 0,
    player_name: (p.player_name as string)  ?? '',
    score:       (p.score       as number)  ?? 0,
    kills:       (p.kills       as number)  ?? 0,
    ship:        (p.ship        as number)  ?? 0,
    hue:         (p.hue         as number)  ?? 0,
    isAlive:     (p.isAlive     as boolean) ?? true,
    x:           (p.x           as number)  ?? 0,
    y:           (p.y           as number)  ?? 0,
    custom:      (p.custom      as PlayerCustom | null) ?? null,
    friendly:    (p.friendly    as number)  ?? 0,
    compositeId: p.compositeId,
  }
}

export async function fetchPlayerData(signal?: AbortSignal): Promise<PlayerData> {
  const byKey     = new Map<string, Player[]>()
  const seedByKey = new Map<string, GameSeedInfo>()

  // ── Primary: /games — gives seed + full player state ─────────────────────
  let usedGames = false
  try {
    const res = await fetch(PM_GAMES_URL, { signal, cache: 'no-store' })
    if (!res.ok) throw new Error(`pixelmelt/games ${res.status}`)
    const games: PixelmeltGame[] = await res.json()

    for (const g of games) {
      if (!g.compositeId) continue

      // Players
      const players = (g.players ?? []).map(normalizePlayer)
      byKey.set(g.compositeId, players)

      // Seed info
      if (g.seed) {
        const modeId   = g.mode?.id        ?? 'unknown'
        const rootMode = g.mode?.root_mode ?? (modeId === 'modding' ? 'survival' : modeId)
        seedByKey.set(g.compositeId, {
          seed:     g.seed,
          mapSize:  g.mode?.map_size ?? 80,
          modeId,
          rootMode,
        })
      }
    }
    usedGames = true
  } catch { /* fall through */ }

  // ── Fallback: /players — flat list, no seed ───────────────────────────────
  if (!usedGames) {
    try {
      const res = await fetch(PM_PLAYERS_URL, { signal, cache: 'no-store' })
      if (!res.ok) throw new Error(`pixelmelt/players ${res.status}`)
      const players: Partial<Player>[] = await res.json()
      for (const raw of players) {
        if (!raw.compositeId) continue
        const p = normalizePlayer(raw)
        const arr = byKey.get(raw.compositeId) ?? []
        if (!arr.some(x => x.id === p.id)) arr.push(p)
        byKey.set(raw.compositeId, arr)
      }
    } catch { /* no data available */ }
  }

  return { byKey, seedByKey, fetchedAt: Date.now() }
}

/** Image URL for an ECP badge code (e.g. "csf" -> .../ecp/csf.png). */
export function badgeUrl(badge: string): string {
  return `https://starblast.io/ecp/${badge}.png`
}

/** A server entry plus (optionally) its live player roster and map seed. */
export type EnrichedGame = GameEntry & {
  livePlayers?: Player[]
  seedInfo?:    GameSeedInfo
  /** True when this game was manually added via "Share Custom Game". */
  isCustom?: boolean
}

/** Attach live player rosters + seed info to the server list by composite key. */
export function enrichGames(games: GameEntry[], data: PlayerData | null): EnrichedGame[] {
  if (!data) return games
  return games.map((g) => {
    const livePlayers = data.byKey.get(g.key)
    const seedInfo    = data.seedByKey.get(g.key)
    const extra: Partial<EnrichedGame> = {}
    if (livePlayers) extra.livePlayers = livePlayers
    if (seedInfo)    extra.seedInfo    = seedInfo
    return Object.keys(extra).length ? { ...g, ...extra } : g
  })
}

// ── Team stack detection ──────────────────────────────────────────────────────

export interface StackInfo {
  /** 'major' = C1/C2 triggers · 'minor' = any team ≥ 2 ECP behind · 'none' = balanced */
  level:      'none' | 'minor' | 'major'
  stacked:    boolean   // true only for major (used by alerts)
  ratio:      number
  topTeamEcp: number
  minTeamEcp: number
  totalEcp:   number
}

/**
 * Detect whether one team has a disproportionately high ECP count.
 * In team mode, all members of a team share the same hue value.
 * Returns null when there are not enough players to be meaningful.
 */
export function detectStack(players: Player[]): StackInfo | null {
  if (!players || players.length < 6) return null

  const countByHue = new Map<number, number>()
  const ecpByHue   = new Map<number, number>()

  for (const p of players) {
    // Do NOT skip hue = 0 — Red/Pink teams legitimately have hue close to 0.
    // Only skip if hue is null/undefined (normalizePlayer defaults it to 0, so
    // in practice this branch is never hit, but it keeps the intent explicit).
    if (p.hue == null) continue
    countByHue.set(p.hue, (countByHue.get(p.hue) ?? 0) + 1)
    if (p.custom) ecpByHue.set(p.hue, (ecpByHue.get(p.hue) ?? 0) + 1)
  }

  const teamHues = [...countByHue.entries()]
    .filter(([, n]) => n >= 2)
    .map(([h]) => h)

  if (teamHues.length < 2) return null

  const ecpCounts  = teamHues.map((h) => ecpByHue.get(h) ?? 0).sort((a, b) => b - a)
  const topTeamEcp = ecpCounts[0]
  const minTeamEcp = ecpCounts[ecpCounts.length - 1]
  const totalEcp   = ecpCounts.reduce((s, n) => s + n, 0)

  // Minor stack: any team is ≥ 2 ECP behind the best team
  const gap   = topTeamEcp - minTeamEcp
  const minor = gap >= 2

  if (topTeamEcp < 3) {
    const level = minor ? 'minor' : 'none'
    return { level, stacked: false, ratio: 1, topTeamEcp, minTeamEcp, totalEcp }
  }

  // Condition 1 — one team dominates the average of all others
  const others     = ecpCounts.slice(1)
  const avgOthers  = others.length ? others.reduce((s, n) => s + n, 0) / others.length : 0
  const ratioVsAvg = avgOthers > 0 ? topTeamEcp / avgOthers : topTeamEcp
  const c1 = ratioVsAvg >= 2.5

  // Condition 2 — the weakest team is severely disadvantaged vs the strongest
  const spreadRatio = topTeamEcp / Math.max(minTeamEcp, 0.5)
  const c2 = spreadRatio >= 4.0

  const ratio  = Math.max(ratioVsAvg, spreadRatio)
  const isMajor = c1 || c2
  const level   = isMajor ? 'major' : minor ? 'minor' : 'none'

  return {
    level,
    stacked: isMajor,
    ratio,
    topTeamEcp,
    minTeamEcp,
    totalEcp,
  }
}

/** Ship tier from a Starblast ship code (e.g. 701 -> 7). */
export function shipTier(ship: number): number {
  return Math.floor(ship / 100)
}

/** A player's display colour, derived from their in-game hue. */
export function playerColor(hue: number, alive = true): string {
  return `hsl(${hue}, ${alive ? 75 : 30}%, ${alive ? 58 : 40}%)`
}

export interface PlayerStats {
  alive: number
  dead: number
  topScore: number
  topKiller: Player | null
}

export function summarizePlayers(players: Player[]): PlayerStats {
  let alive = 0
  let topScore = 0
  let topKiller: Player | null = null
  for (const p of players) {
    if (p.isAlive) alive++
    if (p.score > topScore) topScore = p.score
    if ((p.kills ?? 0) > (topKiller?.kills ?? 0)) topKiller = p
  }
  return { alive, dead: players.length - alive, topScore, topKiller }
}
