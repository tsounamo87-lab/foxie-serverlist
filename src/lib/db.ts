// ─── Shared observation store (Supabase) ─────────────────────────────────────
// All visitors read from the same Supabase tables, populated server-side by
// supabase/functions/collect-activity (the browser never writes this data).
//
// Table schema (see README or SQL editor in Supabase):
//   observations (id, ts, server_id, server_name, region,
//                 player_name, kills, score)
//   unique constraint on (ts, server_id, player_name)
//
// RLS policies: public SELECT, no INSERT/UPDATE/DELETE for anon.

import { supabase, supabaseConfigured } from './supabase'

export interface Observation {
  id?: number
  ts: number
  serverId: string
  serverName: string
  region: string
  playerName: string
  kills: number
  score: number
  ship: number
}

// ── Read ──────────────────────────────────────────────────────────────────────

// Supabase caps every response at `max-rows` (default 1000) regardless of the
// `.limit()` we pass. To get a full page range we must paginate with `.range()`.
const PAGE = 1000

/**
 * Get the last known player roster for a specific server.
 * Returns the players seen in the most recent observation bucket for that server.
 * Used as a fallback for closed survival servers that pixelmelt no longer reports.
 */
export async function getLastRosterForServer(
  serverId: string,
): Promise<{ playerName: string; kills: number; score: number }[]> {
  if (!supabaseConfigured) return []

  // First, find the most recent bucket for this server
  const { data: latest, error: e1 } = await supabase!
    .from('observations')
    .select('ts')
    .eq('server_id', serverId)
    .order('ts', { ascending: false })
    .limit(1)

  if (e1 || !latest?.length) return []
  const lastTs = latest[0].ts as number

  // Then get all players observed in that bucket
  const { data, error: e2 } = await supabase!
    .from('observations')
    .select('player_name, kills, score')
    .eq('server_id', serverId)
    .eq('ts', lastTs)

  if (e2 || !data) return []

  type RosterRow = { player_name: string; kills: number; score: number }
  return (data as RosterRow[]).map((r) => ({
    playerName: r.player_name,
    kills: r.kills,
    score: r.score,
  }))
}

/** Dev helper — wipe everything. */
export async function clearAll(): Promise<void> {
  if (!supabaseConfigured) return
  await supabase!.from('observations').delete().gt('ts', 0)
}

// ── Server-side player activity aggregation ───────────────────────────────────
// Uses the get_player_stats_fast(p_since) RPC (PostgreSQL function) to compute
// player stats entirely in the DB, reading from survival_buckets_cache. Avoids
// fetching raw rows to the browser, which used to be capped client-side and
// caused players to "disappear" once the table grew large enough.

export interface PlayerActivityRow {
  playerName:      string
  totalKills:      number
  totalDurationMs: number
  sessionCount:    number
  maxScore:        number
  lastSeen:        number
  regions:         string[]
}

/**
 * Call the get_player_activity RPC — computes sessions and aggregates entirely
 * in PostgreSQL. Returns one row per player, sorted by kills descending.
 * Paginates automatically (Supabase caps RPC responses at 1000 rows by default).
 */
export async function getPlayerActivityRpc(since: number, maxRows = 30_000): Promise<PlayerActivityRow[]> {
  if (!supabaseConfigured) return []

  type Row = {
    player_name: string
    total_kills: number
    total_dur_ms: number
    session_count: number
    max_score: number
    last_seen_ts: number
    regions: string[]
  }

  const fetchPage = async (from: number): Promise<Row[]> => {
    const { data, error } = await supabase!
      .rpc('get_player_stats_fast', { p_since: since })
      .range(from, from + PAGE - 1)
    if (error) {
      console.warn('[db] get_player_stats_fast rpc error:', error.message)
      return []
    }
    return (data ?? []) as Row[]
  }

  // Fetch first page to know if more exist, then fire remaining pages in parallel
  const first = await fetchPage(0)
  if (first.length < PAGE) {
    return first.map(toAggregate)
  }

  const remaining: Row[][] = []
  for (let from = PAGE; from < maxRows; from += PAGE * 5) {
    const batch = await Promise.all(
      [0, 1, 2, 3, 4]
        .map((i) => from + i * PAGE)
        .filter((f) => f < maxRows)
        .map(fetchPage),
    )
    remaining.push(...batch)
    if (batch.some((b) => b.length < PAGE)) break
  }

  const all = [first, ...remaining].flat()

  function toAggregate(r: Row): PlayerActivityRow {
    return {
      playerName:      r.player_name,
      totalKills:      Number(r.total_kills),
      totalDurationMs: Number(r.total_dur_ms),
      sessionCount:    Number(r.session_count),
      maxScore:        Number(r.max_score),
      lastSeen:        Number(r.last_seen_ts),
      regions:         r.regions ?? [],
    }
  }

  return all.map(toAggregate)
}

/**
 * Fast observation count for a given window — single HEAD request, no row transfer.
 */
export async function countObservationsSince(since: number): Promise<number> {
  if (!supabaseConfigured) return 0
  let q = supabase!
    .from('survival_buckets_cache')
    .select('*', { count: 'exact', head: true })
  if (since > 0) q = q.gte('bucket_ts', since)
  const { count, error } = await q
  if (error) return 0
  return count ?? 0
}

// ── ECP badge store (shared, real-time) ───────────────────────────────────────
// Table: player_ecp(player_name text PK, badge text, finish text, laser text,
//                    hue int, updated_at bigint)
// RLS: public SELECT, public INSERT, public UPDATE (ON CONFLICT DO UPDATE)
//
// SQL to create (run in Supabase SQL editor):
//   CREATE TABLE player_ecp (
//     player_name  text primary key,
//     badge        text,
//     finish       text,
//     laser        text,
//     hue          integer default 0,
//     updated_at   bigint  not null
//   );
//   ALTER TABLE player_ecp ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "Public read"   ON player_ecp FOR SELECT USING (true);
//   CREATE POLICY "Public upsert" ON player_ecp FOR INSERT WITH CHECK (true);
//   CREATE POLICY "Public update" ON player_ecp FOR UPDATE USING (true);

import type { PlayerCustom } from './players'

/** Save or update the latest ECP badge seen for a player. */
export async function upsertPlayerEcp(
  playerName: string,
  custom: PlayerCustom,
): Promise<void> {
  if (!supabaseConfigured || !playerName?.trim()) return
  const { error } = await supabase!
    .from('player_ecp')
    .upsert(
      {
        player_name: playerName.trim(),
        badge:       custom.badge  ?? null,
        finish:      custom.finish ?? null,
        laser:       custom.laser  ?? null,
        hue:         custom.hue   ?? 0,
        updated_at:  Date.now(),
      },
      { onConflict: 'player_name' },
    )
  if (error) console.warn('[db] ecp upsert error', error.message)
}

let _ecpCache: { map: Map<string, PlayerCustom>; fetchedAt: number } | null = null

/** Fetch every known ECP badge from Supabase (paginated). Cached for 30 min. */
export async function getPlayerEcpMap(): Promise<Map<string, PlayerCustom>> {
  if (_ecpCache && Date.now() - _ecpCache.fetchedAt < 30 * 60_000) return _ecpCache.map
  if (!supabaseConfigured) return new Map()
  type EcpRow = { player_name: string; badge: string | null; finish: string | null; laser: string | null; hue: number }
  const all: EcpRow[] = []
  const MAX_ECP = 100_000
  for (let from = 0; from < MAX_ECP; from += PAGE) {
    const { data, error } = await supabase!
      .from('player_ecp')
      .select('player_name, badge, finish, laser, hue')
      .range(from, from + PAGE - 1)
    if (error) { console.warn('[db] ecp fetch error', error.message); break }
    const rows = (data ?? []) as EcpRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  const map = new Map<string, PlayerCustom>()
  for (const row of all) {
    map.set(row.player_name.toLowerCase().trim(), {
      badge:  row.badge  ?? undefined,
      finish: row.finish ?? undefined,
      laser:  row.laser  ?? undefined,
      hue:    row.hue,
    })
  }
  _ecpCache = { map, fetchedAt: Date.now() }
  return map
}

/**
 * Players whose ECP composition matches `custom` exactly — same badge, finish,
 * laser AND hue value (not just colour bucket). Queried server-side so casing
 * is preserved and the whole registry never has to be paginated client-side.
 */
export async function getPlayersWithExactGear(custom: PlayerCustom, excludeName?: string): Promise<string[]> {
  if (!supabaseConfigured) return []
  const badge  = custom.badge && custom.badge !== 'blank' ? custom.badge : null
  const finish = custom.finish ?? null
  const laser  = custom.laser !== undefined && custom.laser !== null ? String(custom.laser) : '0'
  const hue    = custom.hue ?? 0

  let q = supabase!.from('player_ecp').select('player_name')
  q = badge  === null ? q.or('badge.is.null,badge.eq.blank') : q.eq('badge', badge)
  q = finish === null ? q.is('finish', null) : q.eq('finish', finish)
  q = q.eq('laser', laser).eq('hue', hue)
  if (excludeName) q = q.neq('player_name', excludeName)

  const { data, error } = await q.limit(500)
  if (error || !data) return []
  return (data as { player_name: string }[]).map((r) => r.player_name).sort()
}

export interface PlayerSession {
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

/**
 * Recent survival "sessions" for a player, most recent first — one entry per
 * 30-min bucket from survival_buckets_cache (full history, unlike the 6h raw
 * table). No per-server breakdown at this granularity, only region.
 */
export async function getPlayerSessionsLongTerm(playerName: string, limit = 50): Promise<PlayerSession[]> {
  if (!supabaseConfigured || !playerName?.trim()) return []
  const { data, error } = await supabase!
    .from('survival_buckets_cache')
    .select('region, min_ts, max_ts, bucket_dur_ms, max_score, max_kills')
    .eq('player_name', playerName)
    .order('bucket_ts', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  type BucketRow = { region: string; min_ts: number; max_ts: number; bucket_dur_ms: number; max_score: number; max_kills: number }
  return (data as BucketRow[]).map((r) => ({
    playerName,
    serverId:   '',
    serverName: r.region,
    region:     r.region,
    startTs:    r.min_ts,
    endTs:      r.max_ts,
    durationMs: r.bucket_dur_ms,
    killsGained: r.max_kills,
    maxScore:   r.max_score,
  }))
}

// ── Badge history (shared, Supabase) ─────────────────────────────────────────
// Table: player_badge_history(player_name, badge_key, badge, finish, laser, hue,
//                              first_seen bigint, last_seen bigint)
// PK: (player_name, badge_key)  — one row per unique badge combo per player.
// first_seen is preserved via SQL RPC (never overwritten on conflict).

export interface BadgeHistoryEntry {
  playerName: string
  badgeKey:   string
  badge?:     string
  finish?:    string
  laser?:     string
  hue:        number
  firstSeen:  number
  lastSeen:   number
}

type BadgeHistoryRow = {
  player_name: string
  badge_key:   string
  badge:       string | null
  finish:      string | null
  laser:       string | null
  hue:         number
  first_seen:  number
  last_seen:   number
}

/** Fetch all badge history entries for a player, most recent first. */
export async function getPlayerBadgeHistory(playerName: string): Promise<BadgeHistoryEntry[]> {
  if (!supabaseConfigured) return []
  const { data, error } = await supabase!
    .from('player_badge_history')
    .select('player_name, badge_key, badge, finish, laser, hue, first_seen, last_seen')
    .eq('player_name', playerName)
    .order('last_seen', { ascending: false })
  if (error) { console.warn('[db] badge history fetch error', error.message); return [] }
  return (data ?? []).map((r: BadgeHistoryRow) => ({
    playerName: r.player_name,
    badgeKey:   r.badge_key,
    badge:      r.badge   || undefined,
    finish:     r.finish  || undefined,
    laser:      r.laser   || undefined,
    hue:        r.hue,
    firstSeen:  r.first_seen,
    lastSeen:   r.last_seen,
  }))
}

// ── Team observations ─────────────────────────────────────────────────────────

export interface TeamObservation {
  id?: number
  ts: number
  serverId: string
  serverName: string
  region: string
  playerName: string
  score: number
  ship: number
  team: number
}

export interface TeamPlayerRow {
  playerName: string
  totalDurationMs: number
  sessionCount: number
  maxScore: number
  lastSeen: number
  regions: string[]
}

export type TeamType = 'classic' | 'gotn' | 'aow'

export async function getTeamPlayerStatsRpc(since: number, type: TeamType = 'classic', maxRows = 30_000): Promise<TeamPlayerRow[]> {
  if (!supabaseConfigured) return []

  type TRow = {
    player_name: string
    total_dur_ms: number
    session_count: number
    max_score: number
    last_seen_ts: number
    regions: string[]
  }

  const fetchPage = async (from: number): Promise<TRow[]> => {
    const { data, error } = await supabase!
      .rpc('get_team_player_stats_fast', { p_since: since, p_type: type })
      .range(from, from + PAGE - 1)
    if (error) { console.warn('[db] team rpc error', error.message); return [] }
    return (data ?? []) as TRow[]
  }

  const toRow = (r: TRow): TeamPlayerRow => ({
    playerName:      r.player_name,
    totalDurationMs: Number(r.total_dur_ms),
    sessionCount:    Number(r.session_count),
    maxScore:        Number(r.max_score),
    lastSeen:        Number(r.last_seen_ts),
    regions:         r.regions ?? [],
  })

  const first = await fetchPage(0)
  if (first.length < PAGE) return first.map(toRow)

  const remaining: TRow[][] = []
  for (let from = PAGE; from < maxRows; from += PAGE * 5) {
    const batch = await Promise.all(
      [0, 1, 2, 3, 4].map((i) => from + i * PAGE).filter((f) => f < maxRows).map(fetchPage),
    )
    remaining.push(...batch)
    if (batch.some((b) => b.length < PAGE)) break
  }

  return [first, ...remaining].flat().map(toRow)
}

export async function countTeamObservationsSince(since: number, type: TeamType = 'classic'): Promise<number> {
  if (!supabaseConfigured) return 0
  let q = supabase!
    .from('team_buckets_cache')
    .select('*', { count: 'exact', head: true })
    .eq('type', type)
  if (since > 0) q = q.gte('bucket_ts', since)
  const { count, error } = await q
  if (error) return 0
  return count ?? 0
}

// ── Background notification subscriptions ─────────────────────────────────────
// Stored in Supabase so the Edge Function can send Discord webhooks 24/7,
// even when no browser has the site open.

export interface NotificationSubscription {
  id?: string
  webhookUrl:  string
  webhookName: string
  eventType:   string   // 'player' | 'game_of_night' | 'population' | 'newserver'
  filterJson:  Record<string, unknown>
  enabled:     boolean
  cooldownMs:  number
}

type SubRow = {
  id: string; webhook_url: string; webhook_name: string; event_type: string
  filter_json: Record<string, unknown>; enabled: boolean; cooldown_ms: number
}

/**
 * Create or replace a notification subscription.
 * Returns the Supabase row ID, or null on error.
 */
export async function upsertNotificationSubscription(
  sub: NotificationSubscription,
): Promise<string | null> {
  if (!supabaseConfigured) return null
  const row: Omit<SubRow, 'id'> & { id?: string } = {
    webhook_url:  sub.webhookUrl,
    webhook_name: sub.webhookName,
    event_type:   sub.eventType,
    filter_json:  sub.filterJson,
    enabled:      sub.enabled,
    cooldown_ms:  sub.cooldownMs,
  }
  if (sub.id) row.id = sub.id
  const { data, error } = await supabase!
    .from('notification_subscriptions')
    .upsert(row as never)
    .select('id')
    .single()
  if (error) { console.warn('[db] subscription upsert error:', error.message); return null }
  return (data as { id: string }).id
}

/** Remove a background subscription by ID. */
export async function deleteNotificationSubscription(id: string): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase!.from('notification_subscriptions').delete().eq('id', id)
  if (error) console.warn('[db] subscription delete error:', error.message)
}

/** Enable or disable a background subscription. */
export async function toggleNotificationSubscription(id: string, enabled: boolean): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase!
    .from('notification_subscriptions')
    .update({ enabled })
    .eq('id', id)
  if (error) console.warn('[db] subscription toggle error:', error.message)
}

// ── Single-player profile lookups ──────────────────────────────────────────────
// Reuse the same server-side RPCs as the leaderboards (get_player_stats_fast /
// get_team_player_stats_fast) but filter the RPC's own output down to one row
// via PostgREST — a single lightweight request instead of paginating the whole
// leaderboard just to pick out one name.

/** All-time survival totals for a single player, or null if they have none. */
export async function getPlayerSurvivalTotals(playerName: string): Promise<PlayerActivityRow | null> {
  if (!supabaseConfigured || !playerName?.trim()) return null
  const { data, error } = await supabase!
    .rpc('get_player_stats_fast', { p_since: 0 })
    .eq('player_name', playerName)
  if (error || !data?.length) return null
  const r = data[0] as {
    player_name: string; total_kills: number; total_dur_ms: number
    session_count: number; max_score: number; last_seen_ts: number; regions: string[]
  }
  return {
    playerName:      r.player_name,
    totalKills:      Number(r.total_kills),
    totalDurationMs: Number(r.total_dur_ms),
    sessionCount:    Number(r.session_count),
    maxScore:        Number(r.max_score),
    lastSeen:        Number(r.last_seen_ts),
    regions:         r.regions ?? [],
  }
}

/** All-time team totals for a single player in one team type, or null if they have none. */
export async function getPlayerTeamTotals(playerName: string, type: TeamType): Promise<TeamPlayerRow | null> {
  if (!supabaseConfigured || !playerName?.trim()) return null
  const { data, error } = await supabase!
    .rpc('get_team_player_stats_fast', { p_since: 0, p_type: type })
    .eq('player_name', playerName)
  if (error || !data?.length) return null
  const r = data[0] as {
    player_name: string; total_dur_ms: number; session_count: number
    max_score: number; last_seen_ts: number; regions: string[]
  }
  return {
    playerName:      r.player_name,
    totalDurationMs: Number(r.total_dur_ms),
    sessionCount:    Number(r.session_count),
    maxScore:        Number(r.max_score),
    lastSeen:        Number(r.last_seen_ts),
    regions:         r.regions ?? [],
  }
}

/** Current ECP customization for a single player, or null if never seen with one. */
export async function getPlayerEcp(playerName: string): Promise<PlayerCustom | null> {
  if (!supabaseConfigured || !playerName?.trim()) return null
  const { data, error } = await supabase!
    .from('player_ecp')
    .select('badge, finish, laser, hue')
    .eq('player_name', playerName)
    .maybeSingle()
  if (error || !data) return null
  const row = data as { badge: string | null; finish: string | null; laser: string | null; hue: number }
  return { badge: row.badge ?? undefined, finish: row.finish ?? undefined, laser: row.laser ?? undefined, hue: row.hue }
}

/** Fetch all recent raw observations for a specific player from a given table. */
async function getRecentRows(
  table: 'observations' | 'team_observations',
  playerName: string,
): Promise<{ server_id: string; ts: number }[]> {
  const { data, error } = await supabase!
    .from(table)
    .select('server_id, ts')
    .eq('player_name', playerName)
  if (error) return []
  return (data ?? []) as { server_id: string; ts: number }[]
}

export interface RecentTeammate {
  playerName: string
  encounters: number
}

/**
 * Players who shared the exact same (server, timestamp bucket) as `playerName`
 * recently. Raw observation tables only retain a short rolling window (a few
 * hours), so this reflects recent games only — not lifetime history.
 */
export async function getRecentTeammates(
  playerName: string,
  table: 'observations' | 'team_observations' = 'observations',
): Promise<RecentTeammate[]> {
  if (!supabaseConfigured || !playerName?.trim()) return []

  const own = await getRecentRows(table, playerName)
  if (!own.length) return []

  const serverIds = [...new Set(own.map((r) => r.server_id))]
  const ownKeys    = new Set(own.map((r) => `${r.server_id}\x00${r.ts}`))

  const { data, error } = await supabase!
    .from(table)
    .select('server_id, ts, player_name')
    .in('server_id', serverIds)
    .neq('player_name', playerName)
  if (error || !data) return []

  const counts = new Map<string, number>()
  for (const row of data as { server_id: string; ts: number; player_name: string }[]) {
    if (!ownKeys.has(`${row.server_id}\x00${row.ts}`)) continue
    counts.set(row.player_name, (counts.get(row.player_name) ?? 0) + 1)
  }

  return [...counts.entries()]
    .map(([name, encounters]) => ({ playerName: name, encounters }))
    .sort((a, b) => b.encounters - a.encounters)
    .slice(0, 8)
}

// ── Ship usage ─────────────────────────────────────────────────────────────────
// Tallied from the long-term bucket-cache tables (survival_buckets_cache /
// team_buckets_cache), so this reflects a player's full history instead of
// just the last few hours of raw observations.
//
// Every player starts each life on the tier-1 "Fly", so a raw per-snapshot
// tally would always be dominated by Fly regardless of what people actually
// fly. refresh_survival_buckets()/refresh_team_buckets() already resolve this
// server-side — each bucket row's `ship` column is the LAST observed ship in
// that 30-min window — so here we just tally that column directly.

export interface ShipUsage {
  ship: number
  count: number
}

function tallyShips(rows: { ship: number }[]): ShipUsage[] {
  const counts = new Map<number, number>()
  for (const r of rows) {
    if (!r.ship) continue // 0 / spectator — not a real ship choice
    counts.set(r.ship, (counts.get(r.ship) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([ship, count]) => ({ ship, count }))
    .sort((a, b) => b.count - a.count)
}

const SHIP_BUCKET_TABLE = {
  observations:      'survival_buckets_cache',
  team_observations: 'team_buckets_cache',
} as const

/** Which ships `playerName` has ended windows on, most-used first (full history). */
export async function getPlayerShipUsage(
  playerName: string,
  table: 'observations' | 'team_observations' = 'observations',
): Promise<ShipUsage[]> {
  if (!supabaseConfigured || !playerName?.trim()) return []
  const { data, error } = await supabase!
    .from(SHIP_BUCKET_TABLE[table])
    .select('ship')
    .eq('player_name', playerName)
  if (error || !data) return []
  return tallyShips(data as { ship: number }[])
}

/** Ships people have ended windows on across everyone, most-used first. */
export async function getMostUsedShips(
  table: 'observations' | 'team_observations' = 'observations',
  limit = 10,
): Promise<ShipUsage[]> {
  if (!supabaseConfigured) return []
  const bucketTable = SHIP_BUCKET_TABLE[table]
  // Supabase caps each response at ~1000 rows regardless of .limit(), so page
  // through the most recent buckets (ordered newest-first) for a representative
  // sample instead of whatever arbitrary 1000 rows an unordered query returns.
  const all: { ship: number }[] = []
  for (let from = 0; from < 5000; from += PAGE) {
    const { data, error } = await supabase!
      .from(bucketTable)
      .select('ship')
      .order('bucket_ts', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) break
    const rows = (data ?? []) as { ship: number }[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return tallyShips(all).slice(0, limit)
}
