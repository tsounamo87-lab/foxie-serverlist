// ─── Team mode activity tracker ───────────────────────────────────────────────
// Stat queries for team mode. Data collection itself happens server-side
// (supabase/functions/collect-activity), not in the browser.

import {
  getTeamPlayerStatsRpc,
  countTeamObservationsSince,
} from './db'
import { fmtDuration, fmtRelative } from './survivalTracker'

export { fmtDuration, fmtRelative }

export interface TeamPlayerAggregate {
  playerName: string
  totalDurationMs: number
  sessionCount: number
  maxScore: number
  lastSeen: number
  regions: string[]
}

export async function queryTeamActivity(since: number, type: import('./db').TeamType = 'classic'): Promise<{
  players: TeamPlayerAggregate[]
  totalObservations: number
}> {
  const [rows, totalObservations] = await Promise.all([
    getTeamPlayerStatsRpc(since, type),
    countTeamObservationsSince(since, type),
  ])

  const players: TeamPlayerAggregate[] = rows.map((r) => ({
    playerName:      r.playerName,
    totalDurationMs: r.totalDurationMs,
    sessionCount:    r.sessionCount,
    maxScore:        r.maxScore,
    lastSeen:        r.lastSeen,
    regions:         r.regions,
  }))

  return { players, totalObservations }
}
