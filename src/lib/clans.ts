// ------------------------------------------------------------------
//  Clan / tag detection from player names.
//  Players commonly prefix a tag: "[ABC] Name", "ABC | Name",
//  "ABC.Name", "ABC-Name", "ABCName". Heuristic, best-effort.
// ------------------------------------------------------------------

import type { Player } from './players'

const BRACKET = /^[\s]*[[({<]([A-Za-z0-9]{2,6})[\])}>]/
const SEPARATOR = /^[\s]*([A-Za-z0-9]{2,6})\s*[|.\-/:•]\s*\S/

/** Extract a clan tag from a player name, or null if none detected. */
export function detectClan(name: string): string | null {
  if (!name) return null
  const b = name.match(BRACKET)
  if (b) return b[1].toUpperCase()
  const s = name.match(SEPARATOR)
  if (s) return s[1].toUpperCase()
  return null
}

export interface ClanInfo {
  tag: string
  count: number
  members: string[]
}

/** Aggregate clans across a player list, sorted by member count. */
export function aggregateClans(players: Player[]): ClanInfo[] {
  const map = new Map<string, ClanInfo>()
  for (const p of players) {
    const tag = detectClan(p.player_name)
    if (!tag) continue
    let info = map.get(tag)
    if (!info) {
      info = { tag, count: 0, members: [] }
      map.set(tag, info)
    }
    info.count++
    info.members.push(p.player_name)
  }
  return [...map.values()].filter((c) => c.count >= 2).sort((a, b) => b.count - a.count)
}
