// ── Foxie — server-side activity collector ────────────────────────────────────
// Scheduled every 5 minutes via Supabase cron.
// Polls Pixelmelt + simstatus, writes survival observations + ECP badges.
// Runs the monthly rollup (archive + prune) once per hour.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// ── Constants ─────────────────────────────────────────────────────────────────

const SIMSTATUS_URL   = 'https://starblast.dankdmitron.dev/api/simstatus.json'
const PM_GAMES_URL    = 'https://api.pixelmelt.dev/games'
const WRITE_BUCKET_MS = 5 * 60 * 1000
const SESSION_GAP_MS  = 12 * 60 * 1000
const KEEP_MS         = 35 * 24 * 3600 * 1000
const PAGE            = 1000
const MAX_FETCH       = 60_000

// ── Minimal types ──────────────────────────────────────────────────────────────

interface SimServer {
  location: string
  address:  string
  systems:  { id: number; name: string; mode: string; survival?: boolean }[]
}

interface PxGame {
  compositeId?: string
  players?: {
    player_name?: string
    kills?:  number
    score?:  number
    custom?: { badge?: string; finish?: string; laser?: string; hue?: number }
  }[]
  mode?: { id?: string; root_mode?: string }
}

interface Obs {
  id?:        number
  ts:         number
  serverId:   string
  serverName: string
  region:     string
  playerName: string
  kills:      number
  score:      number
}

// ── Session computation (mirrors survivalTracker.ts) ──────────────────────────

interface Session {
  playerName: string
  serverId:   string
  serverName: string
  region:     string
  startTs:    number
  endTs:      number
  durationMs: number
  killsGained: number
  maxScore:   number
}

function computeSessions(observations: Obs[]): Session[] {
  const groups = new Map<string, Obs[]>()
  for (const o of observations) {
    const k = `${o.playerName}\x00${o.serverId}`
    const arr = groups.get(k)
    if (arr) arr.push(o)
    else groups.set(k, [o])
  }

  const sessions: Session[] = []

  for (const [, list] of groups) {
    list.sort((a, b) => a.ts - b.ts)
    let start = list[0], prev = list[0]
    let minK = start.kills, maxK = start.kills, maxS = start.score

    const flush = (last: Obs) => sessions.push({
      playerName:  start.playerName,
      serverId:    start.serverId,
      serverName:  start.serverName,
      region:      start.region,
      startTs:     start.ts,
      endTs:       last.ts  + Math.min(SESSION_GAP_MS / 2, 120_000),
      durationMs:  last.ts  - start.ts + Math.min(SESSION_GAP_MS / 2, 120_000),
      killsGained: Math.max(0, maxK - minK),
      maxScore:    maxS,
    })

    for (let i = 1; i < list.length; i++) {
      const cur = list[i]
      if (cur.ts - prev.ts > SESSION_GAP_MS) {
        flush(prev)
        start = cur; minK = cur.kills; maxK = cur.kills; maxS = cur.score
      } else {
        minK = Math.min(minK, cur.kills)
        maxK = Math.max(maxK, cur.kills)
        maxS = Math.max(maxS, cur.score)
      }
      prev = cur
    }
    flush(prev)
  }
  return sessions
}

interface MonthlyStats {
  playerName:   string
  yearMonth:    string
  kills:        number
  durationMs:   number
  sessionCount: number
  maxScore:     number
  lastSeenTs:   number
  regions:      string[]
}

function buildMonthlyStatsMap(sessions: Session[]): Map<string, MonthlyStats> {
  const map = new Map<string, MonthlyStats>()
  for (const s of sessions) {
    const yearMonth = new Date(s.startTs).toISOString().slice(0, 7)
    const key = `${s.playerName}\x00${yearMonth}`
    let st = map.get(key)
    if (!st) {
      st = { playerName: s.playerName, yearMonth, kills: 0, durationMs: 0,
             sessionCount: 0, maxScore: 0, lastSeenTs: 0, regions: [] }
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

function startOfMonth(ts: number): number {
  const d = new Date(ts)
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )
  const bucketTs = Math.round(Date.now() / WRITE_BUCKET_MS) * WRITE_BUCKET_MS

  // ── 1. Fetch simstatus (names + regions) ──────────────────────────────────
  const meta         = new Map<string, { name: string; location: string; mode: string }>()
  const survivalKeys = new Set<string>()
  try {
    const r = await fetch(SIMSTATUS_URL, { signal: AbortSignal.timeout(8_000) })
    if (r.ok) {
      const servers: SimServer[] = await r.json()
      for (const s of servers) {
        for (const sys of s.systems) {
          const key = `${sys.id}@${s.address}`
          meta.set(key, { name: sys.name, location: s.location, mode: sys.mode ?? '' })
          if (sys.survival || sys.mode === 'survival') survivalKeys.add(key)
        }
      }
    }
  } catch { console.warn('[collector] simstatus fetch failed') }
  console.warn(`[collector] simstatus: ${meta.size} games, ${survivalKeys.size} survival`)

  // ── 2. Fetch Pixelmelt (player data) ──────────────────────────────────────
  let pxGames: PxGame[] = []
  try {
    const r = await fetch(PM_GAMES_URL, { signal: AbortSignal.timeout(8_000) })
    if (r.ok) pxGames = await r.json()
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'pixelmelt fetch failed' }), { status: 502 })
  }

  // ── 3. Build rows ─────────────────────────────────────────────────────────
  const obsRows:  object[] = []
  const ecpRows:  object[] = []

  let totalGames = 0, survivalGames = 0
  for (const g of pxGames) {
    if (!g.compositeId || !Array.isArray(g.players)) continue
    totalGames++

    // Use simstatus as the authoritative source for survival mode.
    // This avoids relying on Pixelmelt's mode.id which may be null/missing.
    if (!survivalKeys.has(g.compositeId)) continue
    survivalGames++

    const m = meta.get(g.compositeId)

    for (const p of g.players) {
      const name = (p.player_name ?? '').trim()
      if (!name) continue

      obsRows.push({
        ts:          bucketTs,
        server_id:   g.compositeId,
        server_name: m?.name     ?? g.compositeId,
        region:      m?.location ?? 'Unknown',
        player_name: name,
        kills:       p.kills ?? 0,
        score:       p.score ?? 0,
      })

      if (p.custom && Object.keys(p.custom).length > 0) {
        ecpRows.push({
          player_name: name,
          badge:       p.custom.badge  ?? null,
          finish:      p.custom.finish ?? null,
          laser:       p.custom.laser  ?? null,
          hue:         p.custom.hue    ?? 0,
          updated_at:  Date.now(),
        })
      }
    }
  }

  // ── 4. Write observations ─────────────────────────────────────────────────
  if (obsRows.length > 0) {
    const { error } = await supabase
      .from('observations')
      .upsert(obsRows as never[], { onConflict: 'ts,server_id,player_name', ignoreDuplicates: true })
    if (error) console.error('[collector] obs upsert error', error.message)
  }

  // ── 5. Update ECP badges (deduplicate by player_name first) ──────────────
  if (ecpRows.length > 0) {
    // A player may appear in multiple servers — keep only one row per name
    const ecpDeduped = new Map<string, object>()
    for (const row of ecpRows)
      ecpDeduped.set((row as { player_name: string }).player_name, row)
    const { error } = await supabase
      .from('player_ecp')
      .upsert([...ecpDeduped.values()] as never[], { onConflict: 'player_name' })
    if (error) console.error('[collector] ecp upsert error', error.message)
  }

  // ── 6. Hourly rollup (archive expired months → player_monthly_stats) ──────
  let rolledUp = 0
  if (new Date().getUTCMinutes() === 0) {
    try {
      const cutoff = startOfMonth(Date.now() - KEEP_MS)
      if (cutoff > 0) {
        // Fetch expired observations (oldest first)
        const expired: Obs[] = []
        for (let from = 0; from < MAX_FETCH; from += PAGE) {
          const { data, error } = await supabase
            .from('observations')
            .select('id, ts, server_id, server_name, region, player_name, kills, score')
            .lt('ts', cutoff)
            .order('ts', { ascending: true })
            .range(from, from + PAGE - 1)
          if (error) break
          type R = { id: number; ts: number; server_id: string; server_name: string; region: string; player_name: string; kills: number; score: number }
          const rows = (data ?? []) as R[]
          expired.push(...rows.map(r => ({
            id: r.id, ts: r.ts, serverId: r.server_id, serverName: r.server_name,
            region: r.region, playerName: r.player_name, kills: r.kills, score: r.score,
          })))
          if (rows.length < PAGE) break
        }

        if (expired.length > 0) {
          const sessions  = computeSessions(expired)
          const statsMap  = buildMonthlyStatsMap(sessions)
          const statsRows = [...statsMap.values()].map(s => ({
            player_name:   s.playerName,
            year_month:    s.yearMonth,
            kills:         s.kills,
            duration_ms:   s.durationMs,
            session_count: s.sessionCount,
            max_score:     s.maxScore,
            last_seen_ts:  s.lastSeenTs,
            regions:       s.regions,
          }))

          const { error: archiveErr } = await supabase
            .from('player_monthly_stats')
            .upsert(statsRows, { onConflict: 'player_name,year_month' })

          // Only prune AFTER successful archive
          if (!archiveErr) {
            const deleteUpTo = expired.length < MAX_FETCH
              ? cutoff
              : expired[expired.length - 1].ts + 1
            await supabase.from('observations').delete().lt('ts', deleteUpTo)
            rolledUp = expired.length
          }
        }
      }
    } catch (e) {
      console.error('[collector] rollup error', e)
    }
  }

  // ── 7. Background notification subscriptions ─────────────────────────────
  // Read enabled subscriptions and fire Discord webhooks for matching events.
  // Each subscription has a cooldown to prevent repeated fires.
  let notifSent = 0
  try {
    type SubRow = {
      id: string; webhook_url: string; webhook_name: string; event_type: string
      filter_json: Record<string, unknown>; last_fired_ts: number; cooldown_ms: number
      last_match: string
    }
    const { data: subs, error: subsErr } = await supabase
      .from('notification_subscriptions')
      .select('id, webhook_url, webhook_name, event_type, filter_json, last_fired_ts, cooldown_ms, last_match')
      .eq('enabled', true)
    if (subsErr) console.error('[collector] subs fetch error:', subsErr.message)
    console.warn(`[collector] subs loaded: ${(subs ?? []).length}`)

    // Load server snapshot for newserver detection (compare current vs previous)
    const { data: snapData } = await supabase
      .from('server_snapshot')
      .select('composite_ids, player_names')
      .eq('id', 1)
      .single()
    const prevServerKeys   = new Set<string>((snapData?.composite_ids ?? []) as string[])
    const prevPlayerNames  = new Set<string>((snapData?.player_names  ?? []) as string[])
    const isFirstRun       = prevServerKeys.size === 0
    const isFirstPlayerRun = prevPlayerNames.size === 0

    const now = Date.now()

    // Build a fast lookup of current survival player names (lowercase)
    const currentPlayerNames = new Set<string>(
      (obsRows as { player_name: string }[]).map(r => r.player_name.toLowerCase())
    )
    // Build a lookup of all current game names (any mode, for GOTN detection)
    const allGameNames: { key: string; name: string; location: string; players: number; mode: string }[] = []
    for (const [key, m] of meta.entries()) {
      allGameNames.push({ key, name: m.name, location: m.location, players: 0, mode: '' })
    }
    for (const g of pxGames) {
      if (!g.compositeId) continue
      const entry = allGameNames.find(x => x.key === g.compositeId)
      if (entry) entry.players = g.players?.length ?? 0
    }

    // Collect last_match updates to batch-write after the loop
    const matchUpdates: { id: string; last_match: string }[] = []

    for (const sub of (subs ?? []) as SubRow[]) {
      // Skip if within cooldown (cooldown_ms=0 means always proceed)
      if (sub.cooldown_ms > 0 && now - sub.last_fired_ts < sub.cooldown_ms) continue

      let shouldFire  = false
      let message     = ''
      let detail      = ''
      let currentMatch = ''  // signature of current match — used for join-detection

      if (sub.event_type === 'player') {
        const q = ((sub.filter_json as { query?: string }).query ?? '').toLowerCase()
        if (!q) continue
        type ObsRow = { player_name: string; server_name: string; region: string }
        const hitRows = (obsRows as ObsRow[]).filter(r => r.player_name.toLowerCase().includes(q))
        const curSet  = new Set(hitRows.map(r => r.player_name.toLowerCase()))
        currentMatch  = JSON.stringify([...curSet].sort())

        const isNewSub = !sub.last_match  // first time this sub has been tracked
        if (!isNewSub && currentMatch !== (sub.last_match ?? '')) {
          let prevSet = new Set<string>()
          try { prevSet = new Set(JSON.parse(sub.last_match)) } catch { /* ignore */ }
          const newPlayers = hitRows.filter(r => !prevSet.has(r.player_name.toLowerCase()))
          if (newPlayers.length > 0) {
            const first = newPlayers[0]
            shouldFire = true
            message    = `Player online: ${first.player_name}`
            detail     = `Survival · ${first.server_name} (${first.region})`
          }
        }
        if (currentMatch !== (sub.last_match ?? '')) matchUpdates.push({ id: sub.id, last_match: currentMatch })
      }

      if (sub.event_type === 'game_of_night') {
        const q = ((sub.filter_json as { query?: string }).query ?? '').toLowerCase()
        if (!q) continue
        const match = allGameNames.find(g => g.name.toLowerCase().includes(q))
        // Fire when game newly appears (key not in previous snapshot) OR last_match changed
        if (match) {
          currentMatch = match.key
          if (currentMatch !== (sub.last_match ?? '')) {
            shouldFire = true
            message    = `Game of the Night: ${match.name}`
            detail     = `${match.location}${match.players > 0 ? ` · ${match.players} players` : ''}`
          }
        }
        if (currentMatch !== (sub.last_match ?? '')) matchUpdates.push({ id: sub.id, last_match: currentMatch })
      }

      if (sub.event_type === 'population') {
        const threshold = (sub.filter_json as { threshold?: number }).threshold ?? 0
        const hit = pxGames.find(g => (g.players?.length ?? 0) >= threshold && g.compositeId)
        currentMatch = hit?.compositeId ?? ''
        // Fire when a game newly crosses the threshold
        if (currentMatch && currentMatch !== (sub.last_match ?? '')) {
          const m = meta.get(currentMatch)
          shouldFire = true
          message    = `${hit!.players!.length} players in one server`
          detail     = m ? `${m.name} · ${m.location}` : currentMatch
        }
        if (currentMatch !== (sub.last_match ?? '')) matchUpdates.push({ id: sub.id, last_match: currentMatch })
      }

      if (sub.event_type === 'newserver') {
        if (!isFirstRun) {
          const rMode   = ((sub.filter_json as { mode?:   string }).mode   ?? 'all')
          const rRegion = ((sub.filter_json as { region?: string }).region ?? 'all')
          const newGames: { key: string; name: string; location: string; mode: string; players: number }[] = []
          for (const g of pxGames) {
            if (!g.compositeId || prevServerKeys.has(g.compositeId)) continue
            const m = meta.get(g.compositeId)
            if (!m) continue
            if (rMode !== 'all' && m.mode !== rMode) continue
            if (rRegion !== 'all' && m.location !== rRegion) continue
            newGames.push({ key: g.compositeId, name: m.name, location: m.location, mode: m.mode, players: g.players?.length ?? 0 })
          }
          if (newGames.length > 0) {
            const first = newGames[0]
            shouldFire   = true
            currentMatch = first.key
            message      = `New server: ${first.name || first.key}`
            detail       = `${first.mode} · ${first.location} · ${first.players} player${first.players !== 1 ? 's' : ''}${newGames.length > 1 ? ` (+${newGames.length - 1} more)` : ''}`
          }
        }
      }

      if (shouldFire) {
        const body: Record<string, unknown> = { content: `**${message}**\n${detail}` }
        if (sub.webhook_name) body.username = sub.webhook_name
        try {
          const r = await fetch(sub.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(5_000),
          })
          if (r.ok || r.status === 204) {
            await supabase
              .from('notification_subscriptions')
              .update({ last_fired_ts: now })
              .eq('id', sub.id)
            notifSent++
            console.warn(`[collector] notif sent: ${message}`)
          } else {
            console.warn(`[collector] webhook HTTP ${r.status} for sub ${sub.id}`)
          }
        } catch (e) {
          console.warn('[collector] webhook send failed', e)
        }
      }
    }
    // Persist last_match changes (join-detection state for game_of_night + population)
    for (const u of matchUpdates) {
      supabase.from('notification_subscriptions').update({ last_match: u.last_match }).eq('id', u.id).then(() => {})
    }

    // Update server snapshot for next run's newserver detection
    const currentServerKeys = pxGames.filter(g => g.compositeId).map(g => g.compositeId as string)
    await supabase.from('server_snapshot').upsert({
      id:            1,
      composite_ids: currentServerKeys,
      player_names:  [...currentPlayerNames],
      updated_at:    now,
    })

  } catch (e) {
    console.error('[collector] notification check error', e)
  }

  console.warn(`[collector] pixelmelt=${totalGames} games, survival=${survivalGames}, obs=${obsRows.length}, ecp=${ecpRows.length}, rolledUp=${rolledUp}, notifSent=${notifSent}`)

  return new Response(
    JSON.stringify({ ok: true, observations: obsRows.length, ecp: ecpRows.length, rolledUp, notifSent }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
