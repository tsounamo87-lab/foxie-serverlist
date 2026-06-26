// ─── Clan tags API (Supabase) ─────────────────────────────────────────────────
// Tags live in a single-row `clan_config` table.
//   • Reading is public (RLS select policy) — every visitor gets the tags.
//   • Writing goes through the `set_clan_tags(new_tags, pw)` RPC which checks
//     an admin password server-side, so the anon key alone cannot modify tags.

import { supabase, supabaseConfigured } from './supabase'

export const clansConfigured = supabaseConfigured

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * Fetch the current tag list.
 * Returns `null` if the fetch FAILED (network/error) so the caller can keep its
 * local cache. Returns `[]` only when the remote genuinely has no tags.
 */
export async function remoteFetchTags(): Promise<string[] | null> {
  if (!supabase) return null
  const { data, error } = await supabase
    .from('clan_config')
    .select('tags')
    .eq('id', 1)
    .single()
  if (error) { console.warn('[clans] fetch error', error.message); return null }
  return Array.isArray(data?.tags) ? (data.tags as string[]) : []
}

// ── Write ─────────────────────────────────────────────────────────────────────

export type SaveResult =
  | { ok: true }
  | { ok: false; reason: 'no_db' | 'invalid_key' | 'network' }

/** Save a new tag list. Requires the admin password (checked server-side). */
export async function remoteSaveTags(
  tags: string[],
  password: string,
): Promise<SaveResult> {
  if (!supabase) return { ok: false, reason: 'no_db' }
  if (!password?.trim()) return { ok: false, reason: 'invalid_key' }

  const { data, error } = await supabase.rpc('set_clan_tags', {
    new_tags: tags,
    pw: password.trim(),
  })

  if (error) { console.warn('[clans] save error', error.message); return { ok: false, reason: 'network' } }
  if (data === false) return { ok: false, reason: 'invalid_key' }
  return { ok: true }
}
