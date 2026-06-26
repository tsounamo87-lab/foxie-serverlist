// ─── Find Me a Game ───────────────────────────────────────────────────────────
// Automatically recommends the best server based on user criteria.

import { useMemo, useState } from 'react'
import { ExternalLink, Shuffle, X, Zap } from 'lucide-react'
import { type EnrichedGame } from '../lib/players'
import { modeLabel, REGIONS } from '../lib/starblast'

interface Props {
  games: EnrichedGame[]
  onClose: () => void
  onOpen: (g: EnrichedGame) => void
}

const MODES = [
  { value: 'any',       label: 'Any mode' },
  { value: 'team',      label: 'Team' },
  { value: 'survival',  label: 'Survival' },
  { value: 'deathmatch',label: 'Deathmatch' },
  { value: 'invasion',  label: 'Invasion' },
  { value: 'modding',   label: 'Modded' },
]

const SIZES = [
  { value: 'any',   label: 'Any size',  min: 0,  max: 999 },
  { value: 'small', label: 'Small',     min: 1,  max: 5 },
  { value: 'med',   label: 'Medium',    min: 6,  max: 20 },
  { value: 'large', label: 'Large',     min: 21, max: 999 },
]

// Defined outside FindGame so the function reference is stable across re-renders.
// If defined inside, React sees a new component type every render and unmounts/remounts
// the native <select>, closing the dropdown immediately after onChange fires.
function SelectField({ value, onChange, children }: {
  value: string
  onChange: (v: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none focus:border-accent"
    >
      {children}
    </select>
  )
}

export function FindGame({ games, onClose, onOpen }: Props) {
  const [mode, setMode] = useState('any')
  const [region, setRegion] = useState('any')
  const [size, setSize] = useState('any')
  const [openOnly, setOpenOnly] = useState(true)
  const [freshOnly, setFreshOnly] = useState(false)
  const [result, setResult] = useState<EnrichedGame | null>(null)
  const [searched, setSearched] = useState(false)

  const sizeOpts = SIZES.find(s => s.value === size)!

  const candidates = useMemo(() => {
    return games.filter(g => {
      if (mode !== 'any' && g.mode !== mode) return false
      if (region !== 'any' && g.location !== region) return false
      if (openOnly && !g.open) return false
      if (freshOnly && g.time > 15 * 60) return false
      const pc = g.livePlayers?.length ?? g.players
      if (pc < sizeOpts.min || pc > sizeOpts.max) return false
      return true
    })
  }, [games, mode, region, size, openOnly, freshOnly, sizeOpts])

  const find = () => {
    setSearched(true)
    if (!candidates.length) { setResult(null); return }
    // Pick best: prefer more players, fresher, open
    const scored = candidates.map(g => {
      const pc = g.livePlayers?.length ?? g.players
      let score = pc * 2
      if (g.open) score += 10
      if (g.time < 600) score += 5   // fresh (<10min)
      if (g.time < 1800) score += 2  // <30min
      return { g, score }
    })
    scored.sort((a, b) => b.score - a.score)
    setResult(scored[0].g)
  }

  const shuffle = () => {
    if (!candidates.length) return
    const i = Math.floor(Math.random() * candidates.length)
    setResult(candidates[i])
    setSearched(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="animate-fade-up w-full max-w-md rounded-[var(--radius-app)] border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text">
            <Zap className="size-4 text-accent" /> Find Me a Game
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:text-text"><X className="size-5" /></button>
        </div>

        <div className="space-y-4 p-5">
          {/* Criteria */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Mode</label>
              <SelectField value={mode} onChange={setMode}>
                {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </SelectField>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Region</label>
              <SelectField value={region} onChange={setRegion}>
                <option value="any">Any region</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </SelectField>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Server size</label>
              <SelectField value={size} onChange={setSize}>
                {SIZES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </SelectField>
            </div>
            <div className="flex flex-col gap-2 justify-end pb-1">
              <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="checkbox" checked={openOnly} onChange={e => setOpenOnly(e.target.checked)} className="accent-accent" />
                Open only
              </label>
              <label className="flex items-center gap-2 text-sm text-text cursor-pointer">
                <input type="checkbox" checked={freshOnly} onChange={e => setFreshOnly(e.target.checked)} className="accent-accent" />
                Fresh (&lt;15 min)
              </label>
            </div>
          </div>

          <p className="text-xs text-muted">{candidates.length} matching server{candidates.length !== 1 ? 's' : ''}</p>

          {/* Buttons */}
          <div className="flex gap-2">
            <button onClick={find}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-semibold text-bg hover:opacity-90">
              <Zap className="size-4" /> Best match
            </button>
            <button onClick={shuffle}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm text-muted hover:text-text">
              <Shuffle className="size-4" /> Random
            </button>
          </div>

          {/* Result */}
          {searched && !result && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted">
              No servers match your criteria.
            </div>
          )}
          {result && (
            <div className="rounded-lg border border-accent/30 bg-accent-soft p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-accent">Recommended</span>
                <span className="rounded bg-surface px-2 py-0.5 text-xs text-muted">{modeLabel(result)}</span>
              </div>
              <p className="font-semibold text-text">{result.name || `System ${result.id}`}</p>
              <p className="mt-0.5 text-xs text-muted">
                {result.location} · {result.livePlayers?.length ?? result.players} players · {Math.floor(result.time / 60)}m old
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => { onOpen(result); onClose() }}
                  className="flex-1 rounded-lg border border-border py-1.5 text-xs text-muted hover:text-text transition-colors">
                  View details
                </button>
                <a href={result.joinUrl} target="_blank" rel="noreferrer"
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-accent py-1.5 text-xs font-semibold text-bg hover:opacity-90">
                  Join <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
