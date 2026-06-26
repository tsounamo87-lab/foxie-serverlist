// ─── Survival activity tracker ────────────────────────────────────────────────
// Collects player observations on every poll, derives sessions + stats.

import type { EnrichedGame } from './players'
import {
  saveObservations,
  getObservationsSince,
  getObservationsBefore,
  pruneObservationsBefore,
  getPlayerActivityRpc,
  countObservationsSince,
  upsertPlayerEcpBatch,
  upsertPlayerBadgeHistoryBatch,
  upsertPlayerMonthlyStatsBatch,
  getAllPlayerMonthlyStats,
  type Observation,
  type PlayerMonthlyStats,
} from './db'

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Write bucket — ts is rounded to this interval before writing.
 * Multiple visitors watching the same server get deduplicated to one row.
 * Must be smaller than SESSION_GAP_MS.
 */
const WRITE_BUCKET_MS = 5 * 60 * 1000  // 5 minutes

/**
 * If no observation for a player in a server for this long, the session ended.
 * Must be > WRITE_BUCKET_MS so consecutive buckets stay in the same session.
 */
const SESSION_GAP_MS = 12 * 60 * 1000  // 12 minutes

/** Keep observations for this long before pruning. */
const KEEP_MS = 35 * 24 * 3600 * 1000  // 35 days

let _lastPruneTs = 0

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

// ── Data collection ───────────────────────────────────────────────────────────

/**
 * Call this after every poll. Records one observation per player seen in any
 * survival server that has live player data.
 */
export async function recordSnapshot(games: EnrichedGame[], ts: number): Promise<void> {
  // Round ts to the write bucket so concurrent visitors produce the same key
  // and the Supabase upsert deduplicates them into a single row.
  const bucketTs = Math.round(ts / WRITE_BUCKET_MS) * WRITE_BUCKET_MS

  const obs: Omit<Observation, 'id'>[] = []
  const ecpEntries: { playerName: string; custom: import('./players').PlayerCustom }[] = []

  for (const game of games) {
    if (game.mode !== 'survival') continue
    if (!game.livePlayers?.length) continue

    for (const p of game.livePlayers) {
      if (!p.player_name?.trim()) continue
      if (p.custom) ecpEntries.push({ playerName: p.player_name.trim(), custom: p.custom })
      obs.push({
        ts: bucketTs,
        serverId: game.key,
        serverName: game.name || `System ${game.id}`,
        region: game.location,
        playerName: p.player_name.trim(),
        kills: p.kills ?? 0,
        score: p.score ?? 0,
      })
    }
  }

  if (obs.length > 0) {
    await saveObservations(obs).catch(() => {/* ignore — non-critical */})
  }

  if (ecpEntries.length > 0) {
    void upsertPlayerEcpBatch(ecpEntries)
    void upsertPlayerBadgeHistoryBatch(ecpEntries, bucketTs)
  }

  // Roll up expired months + prune, at most once per hour
  if (ts - _lastPruneTs > 3600_000) {
    _lastPruneTs = ts
    rollupAndPrune().catch(() => {})
  }
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

// ── Monthly rollup helpers ────────────────────────────────────────────────────

/** Round a timestamp down to UTC month start. */
function startOfMonth(ts: number): number {
  const d = new Date(ts)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

/**
 * Returns the month-boundary timestamp that is at or before (now - KEEP_MS).
 * Only observations before this cutoff are in fully-expired months and safe
 * to roll up without risking partial-month data.
 */
function getRollupCutoff(): number {
  return startOfMonth(Date.now() - KEEP_MS)
}

/**
 * Aggregate session list into the PlayerMonthlyStats shape, keyed by player+month.
 * Used internally by the rollup job.
 */
function buildMonthlyStatsMap(sessions: Session[]): Map<string, PlayerMonthlyStats> {
  const map = new Map<string, PlayerMonthlyStats>()
  for (const s of sessions) {
    const yearMonth = new Date(s.startTs).toISOString().slice(0, 7) // 'YYYY-MM'
    const key = `${s.playerName}\x00${yearMonth}`
    let st = map.get(key)
    if (!st) {
      st = {
        playerName:   s.playerName,
        yearMonth,
        kills:        0,
        durationMs:   0,
        sessionCount: 0,
        maxScore:     0,
        lastSeenTs:   0,
        regions:      [],
      }
      map.set(key, st)
    }
    st.kills        += s.killsGained
    st.durationMs   += s.durationMs
    st.sessionCount++
    st.maxScore      = Math.max(st.maxScore, s.maxScore)
    st.lastSeenTs    = Math.max(st.lastSeenTs, s.endTs)
    if (!st.regions.includes(s.region)) st.regions.push(s.region)
  }
  return map
}

/**
 * Core maintenance job — runs at most once per hour.
 * 1. Fetches observations older than the month-aligned prune cutoff.
 * 2. Computes sessions from them and upserts permanent monthly stats.
 * 3. Deletes those expired observations (up to however many were fetched).
 *
 * Month-alignment ensures only complete calendar months are rolled up,
 * so sessions are never split across rollup boundaries.
 */
async function rollupAndPrune(): Promise<void> {
  const cutoff = getRollupCutoff()
  if (cutoff <= 0) return

  const expiredObs = await getObservationsBefore(cutoff)

  if (expiredObs.length > 0) {
    const sessions = computeSessions(expiredObs)
    const statsMap = buildMonthlyStatsMap(sessions)

    // CRITICAL: only delete observations AFTER confirming the archive write
    // succeeded. If the table doesn't exist yet, we skip the prune entirely
    // and retry next hour — no data is lost.
    const archived = await upsertPlayerMonthlyStatsBatch([...statsMap.values()])
    if (!archived) return

    // Only delete as far as we fetched (protects against the MAX_ROWS cap:
    // if we hit the limit we leave the remainder for the next hourly run).
    const FETCH_CAP = 60_000
    const deleteUpTo = expiredObs.length < FETCH_CAP
      ? cutoff                                          // fetched everything
      : expiredObs[expiredObs.length - 1].ts + 1       // partial — stop here
    await pruneObservationsBefore(deleteUpTo)
  } else {
    // Nothing to archive — run a plain prune (same as the old behaviour).
    await pruneObservationsBefore(cutoff)
  }
}

// ── High-level queries ────────────────────────────────────────────────────────

// ── How aggregation works ─────────────────────────────────────────────────────
// Player leaderboard: computed by get_player_activity(p_since) RPC in PostgreSQL.
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
 * Merge monthly-stat rows with RPC aggregates into a single PlayerAggregate list.
 * Used by the "All" time window to combine archived history with live raw data.
 */
async function queryActivityAllTime(): Promise<{
  players: PlayerAggregate[]
  sessions: Session[]
  totalObservations: number
  hasHistory: boolean
}> {
  const rollupCutoff = getRollupCutoff()
  const sessionSince = Date.now() - SESSION_FETCH_MS

  // Fetch in parallel: server-side aggregation + monthly archive + recent sessions + obs count
  const [rpcRows, monthlyStats, recentObs, obsCount] = await Promise.all([
    getPlayerActivityRpc(rollupCutoff),
    getAllPlayerMonthlyStats(),
    getObservationsSince(sessionSince),
    countObservationsSince(rollupCutoff),
  ])

  // Start with archived monthly stats, then layer RPC (recent raw) on top
  const merged = new Map<string, PlayerAggregate>()

  for (const m of monthlyStats) {
    let a = merged.get(m.playerName)
    if (!a) {
      a = { playerName: m.playerName, totalKills: 0, totalDurationMs: 0,
            sessionCount: 0, maxScore: 0, lastSeen: 0, regions: [] }
      merged.set(m.playerName, a)
    }
    a.totalKills      += m.kills
    a.totalDurationMs += m.durationMs
    a.sessionCount    += m.sessionCount
    a.maxScore         = Math.max(a.maxScore, m.maxScore)
    a.lastSeen         = Math.max(a.lastSeen, m.lastSeenTs)
    for (const r of m.regions) if (!a.regions.includes(r)) a.regions.push(r)
  }

  for (const p of rpcRows) {
    const agg = rpcRowToAggregate(p)
    let a = merged.get(p.playerName)
    if (!a) {
      merged.set(p.playerName, agg)
      continue
    }
    a.totalKills      += agg.totalKills
    a.totalDurationMs += agg.totalDurationMs
    a.sessionCount    += agg.sessionCount
    a.maxScore         = Math.max(a.maxScore, agg.maxScore)
    a.lastSeen         = Math.max(a.lastSeen, agg.lastSeen)
    for (const r of agg.regions) if (!a.regions.includes(r)) a.regions.push(r)
  }

  const players  = [...merged.values()].sort((a, b) => b.totalKills - a.totalKills)
  const sessions = computeSessions(recentObs)

  return {
    players,
    sessions,
    totalObservations: obsCount,
    hasHistory: monthlyStats.length > 0,
  }
}

/**
 * Fetch all data for a given time window and compute sessions + player stats.
 * When since === 0 (All time), merges archived monthly stats with recent raw data.
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
