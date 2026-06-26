import { useState } from 'react'
import { ArrowUpDown, Clock, LayoutGrid, Layers, Link2, List, Search, Star, X } from 'lucide-react'
import { REGIONS } from '../lib/starblast'
import { useFilters, type SortKey, type ViewMode } from '../store/filters'
import { useCustom } from '../store/custom'
import { ShareCustomGame } from './ShareCustomGame'

const MODES: { value: string; label: string }[] = [
  { value: 'team',       label: 'Team' },
  { value: 'survival',   label: 'Survival' },
  { value: 'deathmatch', label: 'Deathmatch' },
  { value: 'invasion',   label: 'Invasion' },
  { value: 'modding',    label: 'Modded' },
]

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'players',  label: 'Players' },
  { value: 'uptime',   label: 'Uptime' },
  { value: 'name',     label: 'Name' },
  { value: 'criminal', label: 'Criminal activity' },
]

const VIEWS: { value: ViewMode; label: string; icon: React.ReactNode }[] = [
  { value: 'grid',    label: 'Grid',              icon: <LayoutGrid className="size-4" /> },
  { value: 'table',   label: 'Table',             icon: <List className="size-4" /> },
  { value: 'grouped', label: 'Grouped by region', icon: <Layers className="size-4" /> },
]

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all duration-200 hover:scale-105 active:scale-95 ${
        active
          ? 'border-accent/60 bg-accent-soft text-accent shadow-[0_0_12px_-4px_var(--c-accent)]'
          : 'border-border bg-surface/80 text-muted hover:border-border/80 hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

export function FilterBar() {
  const f = useFilters()
  const customCount = useCustom((s) => s.keys.length)
  const [shareOpen, setShareOpen] = useState(false)

  return (
    <>
      <div className="flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            value={f.search}
            onChange={(e) => f.setSearch(e.target.value)}
            placeholder="Search by name, mode, system id, region…"
            className="w-full rounded-[var(--radius-app)] border border-border bg-surface/80 py-2.5 pl-10 pr-9 text-sm text-text outline-none backdrop-blur-sm transition-all duration-200 placeholder:text-muted focus:border-accent focus:bg-surface focus:shadow-[0_0_0_3px_var(--c-accent-soft)]"
          />
          {f.search && (
            <button
              onClick={() => f.setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-text"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Region + mode chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={f.region === 'all'} onClick={() => f.setRegion('all')}>All regions</Chip>
          {REGIONS.map((r) => (
            <Chip key={r} active={f.region === r} onClick={() => f.setRegion(r)}>{r}</Chip>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          {MODES.map((m) => (
            <Chip key={m.value} active={f.modes.includes(m.value)} onClick={() => f.toggleMode(m.value)}>
              {m.label}
            </Chip>
          ))}
          <Chip active={f.customOnly} onClick={() => f.setCustomOnly(!f.customOnly)}>
            <span className="flex items-center gap-1">
              <Link2 className="size-3" />
              Custom
              {customCount > 0 && (
                <span className="ml-0.5 rounded-full bg-accent/20 px-1 text-[10px] tabular-nums text-accent">
                  {customCount}
                </span>
              )}
            </span>
          </Chip>
        </div>

        {/* Toggles + sort */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip active={f.favoritesOnly} onClick={() => f.setFavoritesOnly(!f.favoritesOnly)}>
            <span className="flex items-center gap-1">
              <Star className={`size-3 ${f.favoritesOnly ? 'fill-accent' : ''}`} />
              Favorites
            </span>
          </Chip>
          <Chip active={f.freshMinutes !== null} onClick={() => f.setFreshMinutes(f.freshMinutes !== null ? null : 15)}>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              Fresh
              {f.freshMinutes !== null && (
                <select
                  value={f.freshMinutes}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => f.setFreshMinutes(Number(e.target.value))}
                  className="ml-1 rounded bg-transparent text-xs outline-none"
                >
                  {[5,10,15,30,60].map(m => <option key={m} value={m}>&lt;{m}m</option>)}
                </select>
              )}
            </span>
          </Chip>

          {/* Share Custom Game button */}
          <button
            onClick={() => setShareOpen(true)}
            className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted transition-colors hover:border-accent/60 hover:text-accent"
          >
            <Link2 className="size-3" />
            Share Custom Game
          </button>

          <div className="ml-auto flex items-center gap-2 text-xs text-muted">
            {/* View mode */}
            <div className="flex items-center rounded-md border border-border bg-surface p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  onClick={() => f.setView(v.value)}
                  title={v.label}
                  className={`rounded p-1 transition-colors ${f.view === v.value ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text'}`}
                >
                  {v.icon}
                </button>
              ))}
            </div>
            {/* Sort */}
            <div className="flex items-center gap-1.5">
              <ArrowUpDown className="size-3.5" />
              <select
                value={f.sort}
                onChange={(e) => f.setSort(e.target.value as SortKey)}
                className="rounded-md border border-border bg-surface px-2 py-1 text-text outline-none focus:border-accent"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <ShareCustomGame open={shareOpen} onClose={() => setShareOpen(false)} />
    </>
  )
}
