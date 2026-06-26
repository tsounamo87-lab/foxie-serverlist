// ─── Team mode activity tracker ───────────────────────────────────────────────

import type { EnrichedGame } from './players'
import {
  saveTeamObservations,
  getTeamPlayerStatsRpc,
  countTeamObservationsSince,
} from './db'
import { fmtDuration, fmtRelative } from './survivalTracker'

export { fmtDuration, fmtRelative }

const WRITE_BUCKET_MS = 5 * 60 * 1000

export interface TeamPlayerAggregate {
  playerName: string
  totalDurationMs: number
  sessionCount: number
  maxScore: number
  lastSeen: number
  regions: string[]
}

export async function recordTeamSnapshot(games: EnrichedGame[], ts: number): Promise<void> {
  const bucketTs = Math.round(ts / WRITE_BUCKET_MS) * WRITE_BUCKET_MS
  const obs: Omit<import('./db').TeamObservation, 'id'>[] = []

  for (const game of games) {
    if (game.mode !== 'team') continue
    if (!game.livePlayers?.length) continue

    for (const p of game.livePlayers) {
      if (!p.player_name?.trim()) continue
      obs.push({
        ts:         bucketTs,
        serverId:   game.key,
        serverName: game.name || `System ${game.id}`,
        region:     game.location,
        playerName: p.player_name.trim(),
        score:      p.score ?? 0,
        ship:       p.ship ?? 0,
        team:       p.friendly ?? 0,
      })
    }
  }

  if (obs.length > 0) {
    await saveTeamObservations(obs).catch(() => {})
  }
}

export async function queryTeamActivity(since: number): Promise<{
  players: TeamPlayerAggregate[]
  totalObservations: number
}> {
  const [rows, totalObservations] = await Promise.all([
    getTeamPlayerStatsRpc(since),
    countTeamObservationsSince(since),
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
