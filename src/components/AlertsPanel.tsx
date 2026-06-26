import { useState } from 'react'
import {
  Bell, BellOff, ChevronDown, ChevronUp, Cloud, CloudOff,
  Layers, MessageSquare, Moon, Plus, Server, Trash2, User, Users, X, Zap,
} from 'lucide-react'
import { useAlerts, type AlertRule } from '../store/alerts'
import {
  upsertNotificationSubscription,
  deleteNotificationSubscription,
} from '../lib/db'

const MODES = [
  { value: 'all',        label: 'Any mode' },
  { value: 'team',       label: 'Team' },
  { value: 'survival',   label: 'Survival' },
  { value: 'deathmatch', label: 'Deathmatch' },
  { value: 'invasion',   label: 'Invasion' },
  { value: 'modding',    label: 'Modded' },
]

const REGIONS = [
  { value: 'all',     label: 'Any region' },
  { value: 'America', label: 'America' },
  { value: 'Europe',  label: 'Europe' },
  { value: 'Asia',    label: 'Asia' },
]

function newServerLabel(mode: string, region: string): string {
  const m = MODES.find((x) => x.value === (mode ?? 'all'))?.label ?? mode
  const r = REGIONS.find((x) => x.value === (region ?? 'all'))?.label ?? region
  if (mode === 'all' && region === 'all') return 'Any new server'
  if (mode === 'all') return `Any mode · ${r}`
  if (region === 'all') return `${m} · Any region`
  return `${m} · ${r}`
}

function ruleLabel(rule: AlertRule): string {
  switch (rule.type) {
    case 'player':       return `"${rule.query}"`
    case 'population':   return `${rule.threshold}+ players`
    case 'newserver':    return newServerLabel(rule.mode ?? 'all', rule.region ?? 'all')
    case 'stack':        return `Team stack · ${REGIONS.find(x => x.value === (rule.region ?? 'all'))?.label ?? rule.region}`
    case 'game_of_night': return rule.query ? `Game: "${rule.query}"` : 'Game of the Night'
    default: return rule.type
  }
}

function RuleIcon({ type }: { type: AlertRule['type'] }) {
  switch (type) {
    case 'player':       return <User  className="size-4 shrink-0 text-accent-2" />
    case 'population':   return <Users className="size-4 shrink-0 text-accent-2" />
    case 'newserver':    return <Server className="size-4 shrink-0 text-accent-2" />
    case 'stack':        return <Layers className="size-4 shrink-0 text-warning" />
    case 'game_of_night': return <Moon className="size-4 shrink-0 text-accent" />
    default: return <Bell className="size-4 shrink-0 text-muted" />
  }
}

// ── Per-rule webhook + background controls ────────────────────────────────────

function RuleWebhookSection({
  rule,
  globalWebhook,
  globalName,
}: {
  rule: AlertRule
  globalWebhook: string
  globalName: string
}) {
  const { setRuleWebhook, setRuleBackground } = useAlerts()
  const [expanded, setExpanded] = useState(false)
  const [localUrl,  setLocalUrl]  = useState(rule.webhookUrl  ?? '')
  const [localName, setLocalName] = useState(rule.webhookName ?? '')
  const [bgLoading, setBgLoading] = useState(false)

  const effectiveUrl = rule.webhookUrl?.trim() || globalWebhook

  const saveWebhook = () => {
    setRuleWebhook(rule.id, localUrl, localName)
    setExpanded(false)
  }

  const toggleBackground = async () => {
    setBgLoading(true)
    try {
      if (rule.backgroundId) {
        await deleteNotificationSubscription(rule.backgroundId)
        setRuleBackground(rule.id, null)
      } else {
        const url  = rule.webhookUrl?.trim() || globalWebhook
        const name = rule.webhookName?.trim() || globalName
        if (!url) { alert('Set a Discord webhook URL first.'); return }

        const filterJson: Record<string, unknown> =
          rule.type === 'player'        ? { query: rule.query }
          : rule.type === 'game_of_night' ? { query: rule.query }
          : rule.type === 'population'  ? { threshold: rule.threshold }
          : { mode: rule.mode, region: rule.region }

        const cooldownMs = 0  // all types use join-detection — no cooldown needed

        const id = await upsertNotificationSubscription({
          webhookUrl: url, webhookName: name,
          eventType: rule.type, filterJson,
          enabled: true, cooldownMs,
        })
        if (id) setRuleBackground(rule.id, id)
      }
    } finally {
      setBgLoading(false)
    }
  }

  return (
    <div className="mt-1.5 border-t border-border/40 pt-1.5">
      <div className="flex items-center gap-1.5">

        {/* Background 24/7 toggle */}
        <button
          onClick={toggleBackground}
          disabled={bgLoading}
          title={rule.backgroundId ? 'Background active — click to disable' : 'Enable background 24/7 (requires webhook URL)'}
          className={`flex items-center gap-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors ${
            rule.backgroundId
              ? 'text-success border border-success/40 bg-success/10 hover:bg-success/20'
              : 'text-muted border border-border hover:text-text'
          }`}
        >
          {rule.backgroundId
            ? <><Cloud className="size-3" /> 24/7</>
            : <><CloudOff className="size-3" /> 24/7</>}
        </button>

        {/* Effective webhook indicator */}
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted">
          {effectiveUrl
            ? <span className="text-success opacity-70">webhook set</span>
            : <span className="opacity-50">no webhook</span>}
        </span>

        {/* Expand/collapse webhook settings */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] text-muted hover:text-text border border-border"
        >
          <MessageSquare className="size-3" />
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-border bg-surface-2 p-2.5">
          <p className="text-[10px] text-muted">
            Leave blank to use the global webhook below.
          </p>
          <input
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            placeholder="Webhook URL (optional override)"
            className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
          />
          <input
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            placeholder="Bot name in Discord (empty = webhook's own name)"
            className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs text-text outline-none focus:border-accent"
          />
          <button
            onClick={saveWebhook}
            className="w-full rounded bg-accent py-1 text-xs font-semibold text-bg hover:opacity-90"
          >
            Save
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function AlertsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    rules,
    addPlayerRule, addPopulationRule, addNewServerRule, addStackRule, addGotnRule,
    removeRule, toggleRule,
    discordWebhook, setDiscordWebhook,
    discordWebhookName, setDiscordWebhookName,
  } = useAlerts()

  const [webhookInput,     setWebhookInput]     = useState(discordWebhook)
  const [webhookNameInput, setWebhookNameInput] = useState(discordWebhookName)
  const [name,        setName]       = useState('')
  const [gotnQuery,   setGotnQuery]  = useState('')
  const [threshold,   setThreshold]  = useState(50)
  const [nsMode,      setNsMode]     = useState('all')
  const [nsRegion,    setNsRegion]   = useState('all')
  const [stackRegion, setStackRegion] = useState('all')
  const [notifGranted, setNotifGranted] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted'
  )

  const addPlayer = () => { if (name.trim()) { addPlayerRule(name); setName('') } }
  const addGotn   = () => { if (gotnQuery.trim()) { addGotnRule(gotnQuery); setGotnQuery('') } }

  const saveGlobal = () => {
    setDiscordWebhook(webhookInput.trim())
    setDiscordWebhookName(webhookNameInput.trim())
  }

  const requestNotif = async () => {
    if (typeof Notification === 'undefined') return
    const res = await Notification.requestPermission()
    setNotifGranted(res === 'granted')
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
      />
      <aside
        className={`fixed left-0 top-0 z-40 flex h-full w-[min(420px,92vw)] flex-col border-r border-border bg-surface shadow-2xl transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text">
            <Bell className="size-4 text-accent" /> Alerts
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:text-text">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">

          {/* ── Browser notifications ───────────────────────── */}
          <button
            onClick={requestNotif}
            disabled={notifGranted}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${notifGranted ? 'border-success/40 text-success' : 'border-border text-muted hover:text-text'}`}
          >
            {notifGranted ? <Bell className="size-4" /> : <BellOff className="size-4" />}
            {notifGranted ? 'Desktop notifications enabled' : 'Enable desktop notifications'}
          </button>

          {/* ── New server ─────────────────────────────────── */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Zap className="size-3.5" /> New server
            </h3>
            <div className="flex gap-2">
              <select value={nsMode} onChange={(e) => setNsMode(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-text outline-none focus:border-accent">
                {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select value={nsRegion} onChange={(e) => setNsRegion(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-text outline-none focus:border-accent">
                {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={() => addNewServerRule(nsMode, nsRegion)}
                className="rounded-lg bg-accent px-3 text-bg hover:opacity-90">
                <Plus className="size-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">Fires when a matching server appears on the list.</p>
          </section>

          {/* ── Team stack ─────────────────────────────────── */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Layers className="size-3.5" /> Team stack
            </h3>
            <div className="flex gap-2">
              <select value={stackRegion} onChange={(e) => setStackRegion(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-2 text-sm text-text outline-none focus:border-accent">
                {REGIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={() => addStackRule(stackRegion)}
                className="rounded-lg bg-accent px-3 text-bg hover:opacity-90">
                <Plus className="size-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">Fires when a team game has a heavily stacked ECP team.</p>
          </section>

          {/* ── Watch a player ─────────────────────────────── */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <User className="size-3.5" /> Watch a player
            </h3>
            <div className="flex gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
                placeholder="Player name contains…"
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              <button onClick={addPlayer} className="rounded-lg bg-accent px-3 text-bg hover:opacity-90">
                <Plus className="size-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">Fires when a matching player appears in any system.</p>
          </section>

          {/* ── Population threshold ───────────────────────── */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Users className="size-3.5" /> Population threshold
            </h3>
            <div className="flex items-center gap-2">
              <input type="number" min={1} value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-24 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              <span className="text-sm text-muted">players in a system</span>
              <button onClick={() => addPopulationRule(threshold)}
                className="ml-auto rounded-lg bg-accent px-3 py-2 text-bg hover:opacity-90">
                <Plus className="size-4" />
              </button>
            </div>
          </section>

          {/* ── Game of the Night ──────────────────────────── */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Moon className="size-3.5" /> Game of the Night
            </h3>
            <div className="flex gap-2">
              <input value={gotnQuery} onChange={(e) => setGotnQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addGotn()}
                placeholder='e.g. Game of the Night'
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent" />
              <button onClick={addGotn} className="rounded-lg bg-accent px-3 text-bg hover:opacity-90">
                <Plus className="size-4" />
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Fires when a server with this name appears. Enable 24/7 on the rule to get notified even with the site closed.
            </p>
          </section>

          {/* ── Global Discord webhook (fallback) ──────────── */}
          <section>
            <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <MessageSquare className="size-3.5" /> Global Discord webhook
            </h3>
            <p className="mb-2 text-[11px] text-muted">
              Used for any rule that doesn't have its own webhook. You can also set a custom bot name.
            </p>
            <div className="space-y-1.5">
              <input value={webhookInput} onChange={(e) => setWebhookInput(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text outline-none focus:border-accent" />
              <div className="flex gap-2">
                <input value={webhookNameInput} onChange={(e) => setWebhookNameInput(e.target.value)}
                  placeholder="Bot name in Discord (empty = webhook's own name)"
                  className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text outline-none focus:border-accent" />
                <button onClick={saveGlobal}
                  className="rounded-lg bg-accent px-3 text-bg hover:opacity-90 text-xs font-semibold">
                  Save
                </button>
              </div>
            </div>
            {discordWebhook && (
              <p className="mt-1 text-[11px] text-success">Webhook active.</p>
            )}
          </section>

          {/* ── Active rules ────────────────────────────────── */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Active rules</h3>
            {rules.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                No alerts yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {rules.map((r) => (
                  <li key={r.id} className="rounded-lg border border-border bg-surface-2 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <RuleIcon type={r.type} />
                      <span className="min-w-0 flex-1 truncate text-sm text-text">{ruleLabel(r)}</span>
                      <button onClick={() => toggleRule(r.id)}
                        className={`rounded p-1 ${r.enabled ? 'text-success' : 'text-muted'}`}
                        title={r.enabled ? 'Enabled' : 'Disabled'}>
                        {r.enabled ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                      </button>
                      <button onClick={async () => {
                          if (r.backgroundId) await deleteNotificationSubscription(r.backgroundId)
                          removeRule(r.id)
                        }}
                        className="rounded p-1 text-muted hover:text-danger">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <RuleWebhookSection
                      rule={r}
                      globalWebhook={discordWebhook}
                      globalName={discordWebhookName}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </>
  )
}
