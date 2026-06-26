// ─── Shared observation store (Supabase) ─────────────────────────────────────
// Replaces the local IndexedDB store with a Supabase table so ALL visitors
// share the same activity data in real time.
//
// Table schema (see README or SQL editor in Supabase):
//   observations (id, ts, server_id, server_name, region,
//                 player_name, kills, score)
//   unique constraint on (ts, server_id, player_name)
//
// RLS policies: public SELECT + INSERT, no UPDATE/DELETE for anon.

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
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Persist a batch of observations.
 * Uses upsert with ignoreDuplicates so multiple visitors watching the same
 * server at the same time don't create redundant rows.
 */
export async function saveObservations(
  obs: Omit<Observation, 'id'>[],
): Promise<void> {
  if (!supabaseConfigured || !obs.length) return

  const rows = obs.map((o) => ({
    ts:          o.ts,
    server_id:   o.serverId,
    server_name: o.serverName,
    region:      o.region,
    player_name: o.playerName,
    kills:       o.kills,
    score:       o.score,
  }))

  const { error } = await supabase!
    .from('observations')
    .upsert(rows, { onConflict: 'ts,server_id,player_name', ignoreDuplicates: true })

  if (error) console.warn('[db] upsert error', error.message)
}

// ── Read ──────────────────────────────────────────────────────────────────────

// Supabase caps every response at `max-rows` (default 1000) regardless of the
// `.limit()` we pass. To get the full window we must paginate with `.range()`.
// We page NEWEST-first so that if we ever hit MAX_ROWS we keep the most recent
// data rather than freezing on the oldest page (the previous ascending+limit
// approach returned only the first 1000 rows, so the view stopped updating once
// the table grew past ~1 hour of data).
const PAGE = 1000
const MAX_ROWS = 60_000 // safety cap (~60 requests worst case)

type Row = { id: number; ts: number; server_id: string; server_name: string; region: string; player_name: string; kills: number; score: number }

/** Retrieve all observations at or after `since` (unix ms). */
export async function getObservationsSince(since: number): Promise<Observation[]> {
  if (!supabaseConfigured) return []

  const all: Row[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase!
      .from('observations')
      .select('id, ts, server_id, server_name, region, player_name, kills, score')
      .gte('ts', since)
      .order('ts', { ascending: false })
      .range(from, from + PAGE - 1)

    if (error) { console.warn('[db] select error', error.message); break }
    const rows = (data ?? []) as Row[]
    all.push(...rows)
    if (rows.length < PAGE) break // last page reached
  }

  return all.map((r) => ({
    id:         r.id,
    ts:         r.ts,
    serverId:   r.server_id,
    serverName: r.server_name,
    region:     r.region,
    playerName: r.player_name,
    kills:      r.kills,
    score:      r.score,
  }))
}

// ── Prune ─────────────────────────────────────────────────────────────────────

/**
 * Delete observations older than `keepMs`.
 * Requires a Supabase DELETE RLS policy — see SQL setup.
 */
export async function pruneOldObservations(keepMs: number): Promise<void> {
  if (!supabaseConfigured) return
  const cutoff = Date.now() - keepMs
  const { error } = await supabase!
    .from('observations')
    .delete()
    .lt('ts', cutoff)
  if (error) console.warn('[db] prune error', error.message)
}

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

// ── Monthly activity rollup (permanent history) ───────────────────────────────
// Table: player_monthly_stats
//   (player_name, year_month 'YYYY-MM', kills, duration_ms, session_count,
//    max_score, last_seen_ts, regions text[], PRIMARY KEY(player_name, year_month))
//
// SQL to create (run once in Supabase SQL editor):
//   CREATE TABLE player_monthly_stats (
//     player_name   text    NOT NULL,
//     year_month    text    NOT NULL,
//     kills         integer NOT NULL DEFAULT 0,
//     duration_ms   bigint  NOT NULL DEFAULT 0,
//     session_count integer NOT NULL DEFAULT 0,
//     max_score     integer NOT NULL DEFAULT 0,
//     last_seen_ts  bigint  NOT NULL DEFAULT 0,
//     regions       text[]  NOT NULL DEFAULT '{}',
//     PRIMARY KEY (player_name, year_month)
//   );
//   ALTER TABLE player_monthly_stats ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "public_read"   ON player_monthly_stats FOR SELECT USING (true);
//   CREATE POLICY "public_insert" ON player_monthly_stats FOR INSERT WITH CHECK (true);
//   CREATE POLICY "public_update" ON player_monthly_stats FOR UPDATE USING (true);

export interface PlayerMonthlyStats {
  playerName:   string
  yearMonth:    string   // 'YYYY-MM'
  kills:        number
  durationMs:   number
  sessionCount: number
  maxScore:     number
  lastSeenTs:   number
  regions:      string[]
}

type MonthlyRow = {
  player_name:   string
  year_month:    string
  kills:         number
  duration_ms:   number
  session_count: number
  max_score:     number
  last_seen_ts:  number
  regions:       string[]
}

/**
 * Upsert monthly aggregated stats — idempotent (overwrites on conflict).
 * Returns true when the write succeeded, false when the table does not exist
 * yet (or any other DB error). The caller must NOT prune when this returns false.
 */
export async function upsertPlayerMonthlyStatsBatch(
  entries: PlayerMonthlyStats[],
): Promise<boolean> {
  if (!supabaseConfigured || !entries.length) return true  // nothing to write → safe
  const rows: MonthlyRow[] = entries.map((e) => ({
    player_name:   e.playerName,
    year_month:    e.yearMonth,
    kills:         e.kills,
    duration_ms:   e.durationMs,
    session_count: e.sessionCount,
    max_score:     e.maxScore,
    last_seen_ts:  e.lastSeenTs,
    regions:       e.regions,
  }))
  const { error } = await supabase!
    .from('player_monthly_stats')
    .upsert(rows, { onConflict: 'player_name,year_month' })
  if (error) {
    console.warn('[db] monthly stats upsert error (table may not exist yet):', error.message)
    return false
  }
  return true
}

/** Fetch all archived monthly stats (paginated, up to 50k rows). */
export async function getAllPlayerMonthlyStats(): Promise<PlayerMonthlyStats[]> {
  if (!supabaseConfigured) return []
  const MAX_MONTHLY = 50_000
  const all: MonthlyRow[] = []
  for (let from = 0; from < MAX_MONTHLY; from += PAGE) {
    const { data, error } = await supabase!
      .from('player_monthly_stats')
      .select('player_name, year_month, kills, duration_ms, session_count, max_score, last_seen_ts, regions')
      .range(from, from + PAGE - 1)
    if (error) { console.warn('[db] monthly stats fetch error', error.message); break }
    const rows = (data ?? []) as MonthlyRow[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all.map((r) => ({
    playerName:   r.player_name,
    yearMonth:    r.year_month,
    kills:        r.kills,
    durationMs:   r.duration_ms,
    sessionCount: r.session_count,
    maxScore:     r.max_score,
    lastSeenTs:   r.last_seen_ts,
    regions:      r.regions ?? [],
  }))
}

/**
 * Retrieve observations with ts < cutoff, oldest first (for monthly rollup).
 * Fetches up to MAX_ROWS rows.
 */
export async function getObservationsBefore(cutoff: number): Promise<Observation[]> {
  if (!supabaseConfigured) return []
  const all: Row[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase!
      .from('observations')
      .select('id, ts, server_id, server_name, region, player_name, kills, score')
      .lt('ts', cutoff)
      .order('ts', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) { console.warn('[db] select error', error.message); break }
    const rows = (data ?? []) as Row[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all.map((r) => ({
    id:         r.id,
    ts:         r.ts,
    serverId:   r.server_id,
    serverName: r.server_name,
    region:     r.region,
    playerName: r.player_name,
    kills:      r.kills,
    score:      r.score,
  }))
}

/** Delete all observations with ts < cutoff. */
export async function pruneObservationsBefore(cutoff: number): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase!.from('observations').delete().lt('ts', cutoff)
  if (error) console.warn('[db] prune error', error.message)
}

// ── Server-side player activity aggregation ───────────────────────────────────
// Uses the get_player_activity(p_since) RPC (PostgreSQL function) to compute
// sessions and player stats entirely in the DB. Replaces fetching 80k+ raw
// rows to the browser, which was capped at MAX_ROWS and caused players to
// "disappear" once the table grew past 60k rows.

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
export async function getPlayerActivityRpc(since: number, maxRows = 10_000): Promise<PlayerActivityRow[]> {
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

  const { data, error } = await supabase!
    .rpc('get_player_activity', { p_since: since })
    .limit(maxRows)

  if (error) {
    console.warn('[db] get_player_activity rpc error:', error.message)
    return []
  }

  return ((data ?? []) as Row[]).map((r) => ({
    playerName:      r.player_name,
    totalKills:      Number(r.total_kills),
    totalDurationMs: Number(r.total_dur_ms),
    sessionCount:    Number(r.session_count),
    maxScore:        Number(r.max_score),
    lastSeen:        Number(r.last_seen_ts),
    regions:         r.regions ?? [],
  }))
}

/**
 * Fast observation count for a given window — single HEAD request, no row transfer.
 */
export async function countObservationsSince(since: number): Promise<number> {
  if (!supabaseConfigured) return 0
  const { count, error } = await supabase!
    .from('observations')
    .select('*', { count: 'exact', head: true })
    .gte('ts', since)
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

/** Save multiple ECP entries in a single round-trip (preferred). */
export async function upsertPlayerEcpBatch(
  entries: { playerName: string; custom: PlayerCustom }[],
): Promise<void> {
  if (!supabaseConfigured || !entries.length) return
  const now = Date.now()
  const rows = entries
    .filter((e) => e.playerName?.trim())
    .map((e) => ({
      player_name: e.playerName.trim(),
      badge:       e.custom.badge  ?? null,
      finish:      e.custom.finish ?? null,
      laser:       e.custom.laser  ?? null,
      hue:         e.custom.hue   ?? 0,
      updated_at:  now,
    }))
  if (!rows.length) return
  const { error } = await supabase!
    .from('player_ecp')
    .upsert(rows, { onConflict: 'player_name' })
  if (error) console.warn('[db] ecp batch upsert error', error.message)
}

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

/** Fetch every known ECP badge from Supabase (paginated).
 *  Returns a Map<playerName_lower → PlayerCustom>. */
export async function getPlayerEcpMap(): Promise<Map<string, PlayerCustom>> {
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
  return map
}

/** Fetch all observations for a specific player (no time limit). */
export async function getPlayerObservationsByName(playerName: string): Promise<Observation[]> {
  if (!supabaseConfigured) return []
  const all: Row[] = []
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase!
      .from('observations')
      .select('id, ts, server_id, server_name, region, player_name, kills, score')
      .eq('player_name', playerName)
      .order('ts', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) { console.warn('[db] player obs error', error.message); break }
    const rows = (data ?? []) as Row[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all.map((r) => ({
    id:         r.id,
    ts:         r.ts,
    serverId:   r.server_id,
    serverName: r.server_name,
    region:     r.region,
    playerName: r.player_name,
    kills:      r.kills,
    score:      r.score,
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

/** Batch-upsert badge observations via RPC (preserves first_seen on conflict). */
export async function upsertPlayerBadgeHistoryBatch(
  entries: { playerName: string; custom: PlayerCustom }[],
  now: number,
): Promise<void> {
  if (!supabaseConfigured || !entries.length) return
  const rows = entries
    .filter((e) => e.playerName?.trim())
    .map((e) => ({
      player_name: e.playerName.trim(),
      badge_key:   `${e.custom.badge ?? ''}|${e.custom.finish ?? ''}|${e.custom.laser ?? ''}|${e.custom.hue ?? 0}`,
      badge:       e.custom.badge   ?? '',
      finish:      e.custom.finish  ?? '',
      laser:       e.custom.laser   ?? '',
      hue:         e.custom.hue    ?? 0,
      ts:          now,
    }))
  if (!rows.length) return
  const { error } = await supabase!.rpc('upsert_badge_history_batch', { p_rows: rows })
  if (error) console.warn('[db] badge history batch error', error.message)
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
