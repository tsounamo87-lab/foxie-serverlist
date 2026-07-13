// ─── Survival activity tracker ────────────────────────────────────────────────
// Session/stat derivation for survival mode. Data collection itself happens
// server-side (supabase/functions/collect-activity), not in the browser.

import {
  getObservationsSince,
  getPlayerActivityRpc,
  countObservationsSince,
  type Observation,
} from './db'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * If no observation for a player in a server for this long, the session ended.
 */
const SESSION_GAP_MS = 12 * 60 * 1000  // 12 minutes

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Session {
  playerName: string
  serverId: string
  serverName: string
  region: string
  startTs: number
  endTs: number
  durationMs: number
  killsGained: number
  maxScore: number
}

export interface PlayerAggregate {
  playerName: string
  totalKills: number
  totalDurationMs: number
  sessionCount: number
  maxScore: number
  lastSeen: number
  regions: string[]
}

// ── Session computation ───────────────────────────────────────────────────────

/**
 * Derive play sessions from raw observations.
 * Groups by (playerName, serverId), splits when gap > SESSION_GAP_MS.
 */
export function computeSessions(observations: Observation[]): Session[] {
  const groups = new Map<string, Observation[]>()
  for (const o of observations) {
    const k = `${o.playerName}\x00${o.serverId}`
    const arr = groups.get(k)
    if (arr) arr.push(o)
    else groups.set(k, [o])
  }

  const sessions: Session[] = []

  for (const [, list] of groups) {
    list.sort((a, b) => a.ts - b.ts)

    let start = list[0]
    let prev = list[0]
    let minKills = start.kills
    let maxKills = start.kills
    let maxScore = start.score

    const flush = (last: Observation) => {
      sessions.push({
        playerName: start.playerName,
        serverId: start.serverId,
        serverName: start.serverName,
        region: start.region,
        startTs: start.ts,
        // Add half the session gap as a "left shortly after last seen" estimate
        endTs: last.ts + Math.min(SESSION_GAP_MS / 2, 120_000),
        durationMs: last.ts - start.ts + Math.min(SESSION_GAP_MS / 2, 120_000),
        killsGained: Math.max(0, maxKills - minKills),
        maxScore,
      })
    }

    for (let i = 1; i < list.length; i++) {
      const cur = list[i]
      if (cur.ts - prev.ts > SESSION_GAP_MS) {
        flush(prev)
        start = cur
        minKills = cur.kills
        maxKills = cur.kills
        maxScore = cur.score
      } else {
        minKills = Math.min(minKills, cur.kills)
        maxKills = Math.max(maxKills, cur.kills)
        maxScore = Math.max(maxScore, cur.score)
      }
      prev = cur
    }
    flush(prev)
  }

  return sessions.sort((a, b) => b.startTs - a.startTs)
}

// ── Aggregation ───────────────────────────────────────────────────────────────

export function aggregatePlayers(sessions: Session[]): PlayerAggregate[] {
  const map = new Map<string, PlayerAggregate>()

  for (const s of sessions) {
    let a = map.get(s.playerName)
    if (!a) {
      a = {
        playerName: s.playerName,
        totalKills: 0,
        totalDurationMs: 0,
        sessionCount: 0,
        maxScore: 0,
        lastSeen: 0,
        regions: [],
      }
      map.set(s.playerName, a)
    }
    a.totalKills += s.killsGained
    a.totalDurationMs += s.durationMs
    a.sessionCount++
    a.maxScore = Math.max(a.maxScore, s.maxScore)
    a.lastSeen = Math.max(a.lastSeen, s.endTs)
    if (!a.regions.includes(s.region)) a.regions.push(s.region)
  }

  return [...map.values()].sort((a, b) => b.totalKills - a.totalKills)
}

// ── High-level queries ────────────────────────────────────────────────────────

// ── How aggregation works ─────────────────────────────────────────────────────
// Player leaderboard: computed by get_player_stats_fast(p_since) RPC in PostgreSQL,
// reading from survival_buckets_cache — which retains full history, no pruning.
//   → Returns pre-aggregated rows, scales to any DB size, no client-side cap.
// Sessions (for detail modal): fetched raw but capped to a 7-day window.
//   → Modal shows recent session history; total stats in the leaderboard are always
//     accurate for the full period requested.

const SESSION_FETCH_MS = 7 * 86_400_000   // 7 days — window used for raw session fetch

/**
 * Convert a PlayerActivityRow (from the RPC) to a PlayerAggregate.
 */
function rpcRowToAggregate(r: {
  playerName: string; totalKills: number; totalDurationMs: number
  sessionCount: number; maxScore: number; lastSeen: number; regions: string[]
}): PlayerAggregate {
  return {
    playerName:      r.playerName,
    totalKills:      r.totalKills,
    totalDurationMs: r.totalDurationMs,
    sessionCount:    r.sessionCount,
    maxScore:        r.maxScore,
    lastSeen:        r.lastSeen,
    regions:         r.regions,
  }
}

/**
 * "All time" query — survival_buckets_cache retains full history (no pruning),
 * so p_since=0 on the RPC already covers everything. No separate archive needed.
 */
async function queryActivityAllTime(): Promise<{
  players: PlayerAggregate[]
  sessions: Session[]
  totalObservations: number
  hasHistory: boolean
}> {
  const sessionSince = Date.now() - SESSION_FETCH_MS

  const [rpcRows, recentObs, obsCount] = await Promise.all([
    getPlayerActivityRpc(0),
    getObservationsSince(sessionSince),
    countObservationsSince(0),
  ])

  const players  = rpcRows.map(rpcRowToAggregate)
  const sessions = computeSessions(recentObs)

  return {
    players,
    sessions,
    totalObservations: obsCount,
    hasHistory: false,
  }
}

/**
 * Fetch all data for a given time window and compute sessions + player stats.
 *
 * Player aggregates are computed server-side via RPC (no 60k row cap).
 * Sessions are fetched raw but limited to the last 7 days for the detail modal.
 */
export async function queryActivity(since: number): Promise<{
  players: PlayerAggregate[]
  sessions: Session[]
  totalObservations: number
  hasHistory: boolean
}> {
  if (since === 0) return queryActivityAllTime()

  // Server-side aggregation: scales to any DB size, no client row cap.
  // Sessions: limited to the last 7 days (or the requested window if shorter).
  const sessionSince = Math.max(since, Date.now() - SESSION_FETCH_MS)
  const [rpcRows, recentObs, obsCount] = await Promise.all([
    getPlayerActivityRpc(since),
    getObservationsSince(sessionSince),
    countObservationsSince(since),
  ])

  const players  = rpcRows.map(rpcRowToAggregate)
  const sessions = computeSessions(recentObs)

  return {
    players,
    sessions,
    totalObservations: obsCount,
    hasHistory: false,
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────

export function fmtDuration(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${Math.floor(ms / 1000)}s`
}

export function fmtRelative(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d === 1) return 'yesterday'
  return `${d} days ago`
}

/** Kill deltas per calendar day for sparklines. */
export function killsPerDay(sessions: Session[]): { date: string; kills: number }[] {
  const map = new Map<string, number>()
  for (const s of sessions) {
    const d = new Date(s.startTs).toLocaleDateString('en-CA') // YYYY-MM-DD
    map.set(d, (map.get(d) ?? 0) + s.killsGained)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, kills]) => ({ date, kills }))
}
