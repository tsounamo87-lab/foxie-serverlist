import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GameEntry } from '../lib/starblast'
import { modeLabel } from '../lib/starblast'
import type { Player } from '../lib/players'
import { detectStack } from '../lib/players'

export type AlertType = 'player' | 'population' | 'newserver' | 'stack' | 'game_of_night'

export interface AlertRule {
  id: string
  type: AlertType
  /** player / game_of_night: name substring to watch. */
  query: string
  /** population: minimum players in a single system. */
  threshold: number
  /** newserver: mode filter ('all' or 'team'/'survival'/etc). */
  mode: string
  /** newserver: region filter ('all' or 'America'/'Europe'/'Asia'). */
  region: string
  enabled: boolean
  /** Per-rule Discord webhook URL. Falls back to the global webhook if empty. */
  webhookUrl?: string
  /** Custom username shown in Discord. Empty = use the webhook's own name. */
  webhookName?: string
  /** Supabase subscription ID — set when background 24/7 is active for this rule. */
  backgroundId?: string
}

export interface AlertEvent {
  id: string
  ruleId: string
  message: string
  detail: string
  at: number
}

interface AlertsState {
  rules: AlertRule[]
  /** debounce: ruleId -> signature of the current match */
  seen: Record<string, string>
  /** Keys seen on the previous poll — used to detect new servers. Not persisted. */
  prevKeys: string[]
  /** Global fallback Discord webhook URL. */
  discordWebhook: string
  /** Global fallback webhook username. Empty = use webhook's own name. */
  discordWebhookName: string

  addPlayerRule: (query: string) => void
  addPopulationRule: (threshold: number) => void
  addNewServerRule: (mode: string, region: string) => void
  addStackRule: (region: string) => void
  addGotnRule: (query: string) => void
  removeRule: (id: string) => void
  toggleRule: (id: string) => void
  setRuleWebhook: (id: string, url: string, name: string) => void
  setRuleBackground: (id: string, backgroundId: string | null) => void
  setDiscordWebhook: (url: string) => void
  setDiscordWebhookName: (name: string) => void
  /** Evaluate rules against the latest data; returns newly-fired events. */
  check: (games: GameEntry[], playersByKey: Map<string, Player[]> | null) => AlertEvent[]
}

const uid = () => Math.random().toString(36).slice(2, 9)

export const useAlerts = create<AlertsState>()(
  persist(
    (set, get) => ({
      rules: [],
      seen: {},
      prevKeys: [],
      discordWebhook: '',
      discordWebhookName: '',

      addPlayerRule: (query) =>
        set((s) => ({
          rules: [
            ...s.rules,
            { id: uid(), type: 'player', query: query.trim(), threshold: 0, mode: 'all', region: 'all', enabled: true },
          ],
        })),

      addPopulationRule: (threshold) =>
        set((s) => ({
          rules: [
            ...s.rules,
            { id: uid(), type: 'population', query: '', threshold, mode: 'all', region: 'all', enabled: true },
          ],
        })),

      addNewServerRule: (mode, region) =>
        set((s) => ({
          rules: [
            ...s.rules,
            { id: uid(), type: 'newserver', query: '', threshold: 0, mode, region, enabled: true },
          ],
        })),

      addStackRule: (region) =>
        set((s) => ({
          rules: [
            ...s.rules,
            { id: uid(), type: 'stack', query: '', threshold: 0, mode: 'team', region, enabled: true },
          ],
        })),

      addGotnRule: (query) =>
        set((s) => ({
          rules: [
            ...s.rules,
            { id: uid(), type: 'game_of_night', query: query.trim(), threshold: 0, mode: 'all', region: 'all', enabled: true },
          ],
        })),

      removeRule: (id) =>
        set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),

      toggleRule: (id) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
        })),

      setRuleWebhook: (id, url, name) =>
        set((s) => ({
          rules: s.rules.map((r) =>
            r.id === id ? { ...r, webhookUrl: url.trim(), webhookName: name.trim() } : r,
          ),
        })),

      setRuleBackground: (id, backgroundId) =>
        set((s) => ({
          rules: s.rules.map((r) =>
            r.id === id ? { ...r, backgroundId: backgroundId ?? undefined } : r,
          ),
        })),

      setDiscordWebhook: (discordWebhook) => set({ discordWebhook }),
      setDiscordWebhookName: (discordWebhookName) => set({ discordWebhookName }),

      check: (games, playersByKey) => {
        const { rules, seen, prevKeys, discordWebhook, discordWebhookName } = get()
        const events: AlertEvent[] = []
        const nextSeen = { ...seen }

        const prevKeySet = new Set(prevKeys)
        const isFirstLoad = prevKeys.length === 0
        const currentKeys = games.map((g) => g.key)

        for (const rule of rules) {
          if (!rule.enabled) continue

          // ── Player watch ─────────────────────────────────────────────────
          if (rule.type === 'player') {
            if (!playersByKey || !rule.query) continue
            const q = rule.query.toLowerCase()
            let hit: { name: string; game: GameEntry } | null = null
            for (const g of games) {
              const players = playersByKey.get(g.key)
              if (!players) continue
              const p = players.find((pl) => pl.player_name?.toLowerCase().includes(q))
              if (p) { hit = { name: p.player_name ?? '', game: g }; break }
            }
            const sig = hit ? hit.game.key : ''
            if (hit && nextSeen[rule.id] !== sig) {
              events.push({
                id: uid(), ruleId: rule.id,
                message: `Player online: ${hit.name}`,
                detail: `In ${hit.game.name || 'system'} #${hit.game.id} (${hit.game.location})`,
                at: Date.now(),
              })
            }
            nextSeen[rule.id] = sig
          }

          // ── Population threshold ─────────────────────────────────────────
          if (rule.type === 'population') {
            const g = games.find((x) => x.players >= rule.threshold)
            const sig = g ? g.key : ''
            if (g && nextSeen[rule.id] !== sig) {
              events.push({
                id: uid(), ruleId: rule.id,
                message: `Server hit ${rule.threshold}+ players`,
                detail: `${g.name || 'System'} #${g.id} — ${g.players} players`,
                at: Date.now(),
              })
            }
            nextSeen[rule.id] = sig
          }

          // ── Team stack ────────────────────────────────────────────────────
          if (rule.type === 'stack') {
            if (!playersByKey) { nextSeen[rule.id] = ''; continue }
            const rRegion = rule.region ?? 'all'
            const stacked: { game: GameEntry; topEcp: number; minEcp: number; ratio: number }[] = []
            for (const g of games) {
              if (g.mode !== 'team') continue
              if (rRegion !== 'all' && g.location !== rRegion) continue
              const ps = playersByKey.get(g.key)
              if (!ps) continue
              const info = detectStack(ps)
              if (info?.stacked) stacked.push({ game: g, topEcp: info.topTeamEcp, minEcp: info.minTeamEcp, ratio: info.ratio })
            }
            const sig = stacked.map(({ game: g }) => g.key).sort().join(',')
            if (sig && nextSeen[rule.id] !== sig) {
              for (const { game: g, topEcp, minEcp, ratio } of stacked.slice(0, 3)) {
                events.push({
                  id: uid(), ruleId: rule.id,
                  message: `Stacked team game: ${g.name || `System ${g.id}`}`,
                  detail: `${g.location} · ${topEcp} vs ${minEcp} ECP (${ratio.toFixed(1)}× spread)`,
                  at: Date.now(),
                })
              }
            }
            nextSeen[rule.id] = sig
          }

          // ── New server ────────────────────────────────────────────────────
          if (rule.type === 'newserver') {
            if (isFirstLoad) continue
            const rMode   = rule.mode   ?? 'all'
            const rRegion = rule.region ?? 'all'
            const newMatches = games.filter((g) => {
              if (prevKeySet.has(g.key)) return false
              if (rMode !== 'all' && g.mode !== rMode) return false
              if (rRegion !== 'all' && g.location !== rRegion) return false
              return true
            })
            for (const g of newMatches.slice(0, 3)) {
              events.push({
                id: uid(), ruleId: rule.id,
                message: `New server: ${g.name || `System ${g.id}`}`,
                detail: `${modeLabel(g)} · ${g.location} · ${g.players} player${g.players !== 1 ? 's' : ''}`,
                at: Date.now(),
              })
            }
          }

          // ── Game of the Night ─────────────────────────────────────────────
          if (rule.type === 'game_of_night') {
            if (!rule.query) continue
            const q = rule.query.toLowerCase()
            const match = games.find((g) => g.name?.toLowerCase().includes(q))
            const sig = match ? match.key : ''
            if (match && nextSeen[rule.id] !== sig) {
              events.push({
                id: uid(), ruleId: rule.id,
                message: `Game of the Night: ${match.name || `System ${match.id}`}`,
                detail: `${modeLabel(match)} · ${match.location} · ${match.players} players`,
                at: Date.now(),
              })
            }
            nextSeen[rule.id] = sig
          }
        }

        set({ seen: nextSeen, prevKeys: currentKeys })

        // ── Send to Discord — grouped by webhook URL ──────────────────────
        if (events.length) {
          // Group events by their effective webhook URL
          const groups = new Map<string, { url: string; name: string; lines: string[] }>()
          for (const event of events) {
            const rule = rules.find((r) => r.id === event.ruleId)
            const url  = rule?.webhookUrl?.trim() || discordWebhook
            if (!url) continue
            // Use per-rule name if set; empty string → omit → Discord uses webhook's own name
            const name = rule?.webhookName?.trim() ?? discordWebhookName ?? ''
            if (!groups.has(url)) groups.set(url, { url, name, lines: [] })
            groups.get(url)!.lines.push(`**${event.message}**\n${event.detail}`)
          }
          for (const { url, name, lines } of groups.values()) {
            const body: Record<string, unknown> = { content: lines.join('\n\n') }
            if (name) body.username = name
            fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            }).catch(() => {/* non-critical */})
          }
        }

        return events
      },
    }),
    {
      name: 'foxie-alerts',
      partialize: (s) => ({
        rules: s.rules,
        discordWebhook: s.discordWebhook,
        discordWebhookName: s.discordWebhookName,
      }),
    }
  )
)
