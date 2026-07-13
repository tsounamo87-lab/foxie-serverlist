// ─── Survival activity tracker ────────────────────────────────────────────────
// Session/stat derivation for survival mode. Data collection itself happens
// server-side (supabase/functions/collect-activity), not in the browser.

import {
  getPlayerActivityRpc,
  countObservationsSince,
} from './db'

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

// ── High-level queries ────────────────────────────────────────────────────────

// Player leaderboard: computed by get_player_stats_fast(p_since) RPC in PostgreSQL,
// reading from survival_buckets_cache — which retains full history, no pruning.
//   → Returns pre-aggregated rows, scales to any DB size, no client-side cap.

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
 * Fetch player stats for a given time window (0 = all time).
 * Aggregates are computed server-side via RPC (no client row cap).
 */
export async function queryActivity(since: number): Promise<{
  players: PlayerAggregate[]
  totalObservations: number
  hasHistory: boolean
}> {
  const [rpcRows, obsCount] = await Promise.all([
    getPlayerActivityRpc(since),
    countObservationsSince(since),
  ])

  return {
    players: rpcRows.map(rpcRowToAggregate),
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
