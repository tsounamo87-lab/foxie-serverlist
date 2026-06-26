// ─── Clan Detail Modal ────────────────────────────────────────────────────────
// Shows aggregate stats for a clan + full member list.
// Clicking a member opens PlayerActivityModal on top.

import { useState } from 'react'
import { Clock, MapPin, Swords, Target, Trophy, Users, X } from 'lucide-react'
import { fmtDuration, fmtRelative, type PlayerAggregate } from '../lib/survivalTracker'
import { PlayerActivityModal } from './PlayerActivityModal'

export interface ClanAggregate {
  tag: string
  members: PlayerAggregate[]
  totalKills: number
  totalDurationMs: number
  sessionCount: number
  maxScore: number
  lastSeen: number
  regions: string[]
}

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">{icon}{label}</div>
      <div className="mt-0.5 text-base font-bold tabular-nums text-text">{value}</div>
    </div>
  )
}

// ── Member row ────────────────────────────────────────────────────────────────

function MemberRow({
  player,
  rank,
  onClick,
}: {
  player: PlayerAggregate
  rank: number
  onClick: () => void
}) {
  const MEDAL = ['#ffd24a', '#cdd4dc', '#cd8b54']
  return (
    <button
      onClick={onClick}
      className="grid w-full grid-cols-[1.5rem_1fr_3.5rem_4rem_3rem] items-center gap-3 border-b border-border/40 px-3 py-2 text-left text-xs last:border-0 hover:bg-surface-2/60 transition-colors"
    >
      <span
        className="text-center font-bold tabular-nums text-xs"
        style={{ color: rank <= 3 ? MEDAL[rank - 1] : undefined }}
      >
        {rank}
      </span>
      <div className="min-w-0">
        <span className="truncate font-medium text-text">{player.playerName}</span>
        <div className="flex items-center gap-1 mt-0.5">
          {player.regions.slice(0, 2).map((r) => (
            <span key={r} className="text-[10px] text-muted">{r}</span>
          ))}
        </div>
      </div>
      <span className="text-right tabular-nums font-semibold text-accent">
        {player.totalKills > 0 ? player.totalKills : <span className="text-muted font-normal">—</span>}
      </span>
      <span className="text-right tabular-nums text-muted">{fmtDuration(player.totalDurationMs)}</span>
      <span className="text-right tabular-nums text-muted">{player.sessionCount}</span>
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  clan: ClanAggregate
  onClose: () => void
}

export function ClanDetailModal({ clan, onClose }: Props) {
  const [selectedMember, setSelectedMember] = useState<PlayerAggregate | null>(null)

  const sortedMembers = [...clan.members].sort((a, b) => b.totalKills - a.totalKills)

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="animate-fade-up flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-app)] border border-border bg-surface shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-accent-soft px-2 py-1 font-mono text-lg font-bold text-accent">
                  {clan.tag}
                </span>
                <span className="flex items-center gap-1 text-sm text-muted">
                  <Users className="size-3.5" /> {clan.members.length} members
                </span>
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                <MapPin className="size-3" />
                {clan.regions.join(' · ')}
                <span className="text-border">·</span>
                Last active {fmtRelative(clan.lastSeen)}
              </div>
            </div>
            <button onClick={onClose} className="rounded-md border border-border p-1.5 text-muted hover:text-text">
              <X className="size-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {/* Stats grid */}
            <div className="grid grid-cols-4 gap-2">
              <StatTile icon={<Swords className="size-3.5" />}  label="Total kills"  value={clan.totalKills} />
              <StatTile icon={<Clock className="size-3.5" />}   label="Play time"    value={fmtDuration(clan.totalDurationMs)} />
              <StatTile icon={<Target className="size-3.5" />}  label="Sessions"     value={clan.sessionCount} />
              <StatTile icon={<Trophy className="size-3.5" />}  label="Best score"   value={clan.maxScore.toLocaleString()} />
            </div>

            {/* Member list */}
            <div className="rounded-lg border border-border">
              {/* Table header */}
              <div className="grid grid-cols-[1.5rem_1fr_3.5rem_4rem_3rem] gap-3 border-b border-border bg-surface-2/60 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted">
                <span className="text-center">#</span>
                <span>Player</span>
                <span className="text-right">Kills</span>
                <span className="text-right">Time</span>
                <span className="text-right">Sess.</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {sortedMembers.map((m, i) => (
                  <MemberRow
                    key={m.playerName}
                    player={m}
                    rank={i + 1}
                    onClick={() => setSelectedMember(m)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Player detail stacked on top */}
      {selectedMember && (
        <PlayerActivityModal
          player={selectedMember}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </>
  )
}
