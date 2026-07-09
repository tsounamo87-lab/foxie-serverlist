// ─── Gear filter bar ─────────────────────────────────────────────────────────
// Collapsible panel letting the activity lists be searched by exact ECP
// composition — badge, finish, laser and hue — combined as AND constraints.

import { useMemo, useState } from 'react'
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react'
import { BADGES } from '../lib/badges'
import {
  HUE_COLORS,
  FINISH_OPTIONS,
  LASER_TIERS,
  EMPTY_GEAR_FILTER,
  isGearFilterActive,
  activeGearFilterCount,
  type GearFilter,
} from '../lib/gearFilter'
import { EcpBadge } from './EcpBadge'

const LASER_LABEL: Record<string, string> = { '0': 'Default', '1': 'Mk I', '2': 'Mk II', '3': 'Mk III' }

// ── Badge combobox ────────────────────────────────────────────────────────────

function BadgePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const entries = useMemo(() => Object.entries(BADGES).sort((a, b) => a[1].name.localeCompare(b[1].name)), [])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(([id, def]) => id.includes(q) || def.name.toLowerCase().includes(q))
  }, [entries, query])

  const label = value === 'any' ? 'Any badge' : value === 'none' ? 'No badge' : BADGES[value]?.name ?? value

  return (
    <div className="relative" tabIndex={-1} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
          value !== 'any' ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface-2 text-muted hover:text-text'
        }`}
      >
        {value !== 'any' && value !== 'none' && <EcpBadge custom={{ badge: value }} size={12} />}
        {label}
        <ChevronDown className="size-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-surface shadow-2xl">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search badges…"
            className="w-full border-b border-border bg-transparent px-3 py-2 text-xs text-text placeholder:text-muted focus:outline-none"
          />
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              onClick={() => { onChange('any'); setOpen(false); setQuery('') }}
              className="flex w-full items-center px-3 py-1.5 text-left text-xs text-muted hover:bg-surface-2"
            >
              Any badge
            </button>
            <button
              onClick={() => { onChange('none'); setOpen(false); setQuery('') }}
              className="flex w-full items-center px-3 py-1.5 text-left text-xs text-muted hover:bg-surface-2"
            >
              No badge
            </button>
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted">No matches.</p>
            )}
            {filtered.map(([id, def]) => (
              <button
                key={id}
                onClick={() => { onChange(id); setOpen(false); setQuery('') }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-2 ${value === id ? 'text-accent' : 'text-text'}`}
              >
                <EcpBadge custom={{ badge: id }} size={14} />
                <span className="truncate">{def.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Chip row helper ───────────────────────────────────────────────────────────

function ChipRow<T extends string>({
  label, options, value, onChange, renderLabel, renderDot,
}: {
  label: string
  options: readonly T[]
  value: string
  onChange: (v: string) => void
  renderLabel?: (v: T) => string
  renderDot?: (v: T) => string | null
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-1">
        <button
          onClick={() => onChange('any')}
          className={`rounded-md border px-2 py-1 text-xs transition-colors ${
            value === 'any' ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface-2 text-muted hover:text-text'
          }`}
        >
          Any
        </button>
        {options.map((opt) => {
          const dot = renderDot?.(opt)
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs capitalize transition-colors ${
                value === opt ? 'border-accent bg-accent-soft text-accent' : 'border-border bg-surface-2 text-muted hover:text-text'
              }`}
            >
              {dot && <span className="size-2 shrink-0 rounded-full" style={{ background: dot }} />}
              {renderLabel ? renderLabel(opt) : opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Main bar ───────────────────────────────────────────────────────────────────

export function GearFilterBar({ value, onChange }: { value: GearFilter; onChange: (f: GearFilter) => void }) {
  const [expanded, setExpanded] = useState(false)
  const active = isGearFilterActive(value)
  const count = activeGearFilterCount(value)

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 px-5 py-2 text-xs font-medium transition-colors ${
          active ? 'text-accent' : 'text-muted hover:text-text'
        }`}
      >
        <SlidersHorizontal className="size-3.5" />
        Gear filter
        {count > 0 && (
          <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-bg">{count}</span>
        )}
        <ChevronDown className={`size-3.5 ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/60 px-5 py-3">
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">Badge</span>
            <BadgePicker value={value.badge} onChange={(badge) => onChange({ ...value, badge })} />
          </div>

          <ChipRow
            label="Finish"
            options={FINISH_OPTIONS}
            value={value.finish}
            onChange={(finish) => onChange({ ...value, finish })}
          />

          <ChipRow
            label="Laser"
            options={LASER_TIERS}
            value={value.laser}
            onChange={(laser) => onChange({ ...value, laser })}
            renderLabel={(v) => LASER_LABEL[v] ?? v}
          />

          <ChipRow
            label="Hue"
            options={HUE_COLORS.map((c) => c.name)}
            value={value.hue}
            onChange={(hue) => onChange({ ...value, hue })}
            renderDot={(v) => HUE_COLORS.find((c) => c.name === v)?.swatch ?? null}
          />

          {active && (
            <button
              onClick={() => onChange(EMPTY_GEAR_FILTER)}
              className="flex items-center gap-1 text-xs text-muted hover:text-danger"
            >
              <X className="size-3" /> Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}
