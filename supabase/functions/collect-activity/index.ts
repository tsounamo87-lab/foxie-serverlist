// ── Foxie — server-side activity collector ────────────────────────────────────
// Scheduled every minute via Supabase cron.
// Polls Pixelmelt + simstatus, writes survival + team observations, ECP badges,
// and badge history. This is the SOLE writer for all of this — the browser no
// longer writes anything, so data collection doesn't depend on anyone having
// the site open.

import { createClient } from 'jsr:@supabase/supabase-js@2'

// ── Constants ─────────────────────────────────────────────────────────────────

const SIMSTATUS_URL   = 'https://starblast.dankdmitron.dev/api/simstatus.json'
const PM_GAMES_URL    = 'https://api.pixelmelt.dev/games'
// Matches the cron schedule (every 1 min). Must not be wider than that, or
// intermediate polls within a window get silently dropped by the upsert's
// ignoreDuplicates — losing whatever score/kills progression happened between
// the first poll of the window and the next one.
const WRITE_BUCKET_MS = 60 * 1000

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
    kills?:    number
    score?:    number
    ship?:     number
    friendly?: number
    custom?: { badge?: string; finish?: string; laser?: string; hue?: number }
  }[]
  mode?: { id?: string; root_mode?: string }
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (_req) => {
  // Service role key (auto-provided by Supabase to every edge function) —
  // bypasses RLS. Needed to read notification_subscriptions.webhook_url,
  // which anon/public reads are deliberately blocked from (see RLS policy):
  // a webhook URL is a bearer secret, reading someone else's lets you spam
  // their Discord channel.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
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
  const obsRows:   object[] = []
  const teamRows:  object[] = []
  const ecpRows:   object[] = []
  const badgeRows: object[] = []

  let totalGames = 0, survivalGames = 0, teamGames = 0
  for (const g of pxGames) {
    if (!g.compositeId || !Array.isArray(g.players)) continue
    totalGames++

    const m = meta.get(g.compositeId)

    // Use simstatus as the authoritative source for mode — avoids relying on
    // Pixelmelt's mode.id which may be null/missing. AOW games run under the
    // 'team' mode too but are identified by name (mirrors teamTracker.ts).
    // ECP/badge history are captured for every mode (not just survival/team) —
    // the loop below is never skipped, only the observation writes are gated.
    const isSurvival = survivalKeys.has(g.compositeId)
    const isTeam     = m?.mode === 'team' || /aow/i.test(m?.name ?? '')
    if (isSurvival) survivalGames++
    if (isTeam) teamGames++

    for (const p of g.players) {
      const name = (p.player_name ?? '').trim()
      if (!name) continue

      if (isSurvival) {
        obsRows.push({
          ts:          bucketTs,
          server_id:   g.compositeId,
          server_name: m?.name     ?? g.compositeId,
          region:      m?.location ?? 'Unknown',
          player_name: name,
          kills:       p.kills ?? 0,
          score:       p.score ?? 0,
          ship:        p.ship  ?? 0,
        })
      }

      if (isTeam) {
        teamRows.push({
          ts:          bucketTs,
          server_id:   g.compositeId,
          server_name: m?.name     ?? g.compositeId,
          region:      m?.location ?? 'Unknown',
          player_name: name,
          score:       p.score    ?? 0,
          ship:        p.ship     ?? 0,
          team:        p.friendly ?? 0,
        })
      }

      if (p.custom && Object.keys(p.custom).length > 0) {
        ecpRows.push({
          player_name: name,
          badge:       p.custom.badge  ?? null,
          finish:      p.custom.finish ?? null,
          laser:       p.custom.laser  ?? null,
          hue:         p.custom.hue    ?? 0,
          updated_at:  Date.now(),
        })
        const badgeKey = `${p.custom.badge ?? ''}|${p.custom.finish ?? ''}|${p.custom.laser ?? ''}|${p.custom.hue ?? 0}`
        badgeRows.push({
          player_name: name,
          badge_key:   badgeKey,
          badge:       p.custom.badge  ?? '',
          finish:      p.custom.finish ?? '',
          laser:       p.custom.laser  ?? '',
          hue:         p.custom.hue    ?? 0,
          ts:          bucketTs,
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

  // ── 5. Write team observations ────────────────────────────────────────────
  if (teamRows.length > 0) {
    const { error } = await supabase
      .from('team_observations')
      .upsert(teamRows as never[], { onConflict: 'ts,server_id,player_name', ignoreDuplicates: true })
    if (error) console.error('[collector] team obs upsert error', error.message)
  }

  // ── 6. Update ECP badges (deduplicate by player_name first) ──────────────
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

  // ── 7. Update badge history (deduplicate by player_name+badge_key first) ──
  if (badgeRows.length > 0) {
    const badgeDeduped = new Map<string, object>()
    for (const row of badgeRows) {
      const r = row as { player_name: string; badge_key: string }
      badgeDeduped.set(`${r.player_name}|${r.badge_key}`, row)
    }
    const { error } = await supabase.rpc('upsert_badge_history_batch', { p_rows: [...badgeDeduped.values()] })
    if (error) console.error('[collector] badge history batch error', error.message)
  }

  // ── 8. Background notification subscriptions ─────────────────────────────
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

  console.warn(`[collector] pixelmelt=${totalGames} games, survival=${survivalGames}, team=${teamGames}, obs=${obsRows.length}, teamObs=${teamRows.length}, ecp=${ecpRows.length}, badges=${badgeRows.length}, notifSent=${notifSent}`)

  return new Response(
    JSON.stringify({ ok: true, observations: obsRows.length, teamObservations: teamRows.length, ecp: ecpRows.length, badges: badgeRows.length, notifSent }),
    { headers: { 'Content-Type': 'application/json' } },
  )
})
