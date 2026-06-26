// ─── CheatBadge ───────────────────────────────────────────────────────────────
// Unified ECP + name-based cheat indicator.
//
// Detects:
//   • Invalid ECP fields (illegal finish / laser / unknown badge)
//   • All-lowercase player name (impossible without a modified client)
//
// Variants:
//   'modified' (default) → "Modified" chip
//   'dot'                → tiny coloured circle

import { analyzeEcp, cheatSummary, isLowercaseName } from '../lib/ecpDetect'
import type { PlayerCustom } from '../lib/players'

interface Props {
  custom?:     PlayerCustom | null | undefined
  playerName?: string
  variant?:    'modified' | 'dot'
}

export function CheatBadge({ custom, playerName, variant = 'modified' }: Props) {
  const ecp      = analyzeEcp(custom)
  const isLower  = playerName ? isLowercaseName(playerName) : false

  const hasEcpIssue = ecp !== null && ecp.overall !== 'clean'
  if (!hasEcpIssue && !isLower) return null

  // Severity: confirmed cheat = ECP illegal fields OR lowercase name
  const isCheat = (ecp?.overall === 'cheat') || isLower

  const reasons: string[] = []
  if (isLower) reasons.push('Lowercase name (modified client)')
  if (ecp) {
    const s = cheatSummary(ecp)
    if (s) reasons.push(s)
  }
  const title = reasons.join(' · ')

  if (variant === 'dot') {
    return (
      <span
        title={title}
        aria-label={title}
        className={`shrink-0 size-1.5 rounded-full ${isCheat ? 'bg-danger' : 'bg-accent-2'}`}
      />
    )
  }

  return (
    <span
      title={title}
      className={`shrink-0 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest border ${
        isCheat
          ? 'border-danger/40 bg-danger/10 text-danger'
          : 'border-accent-2/40 bg-accent-2/10 text-accent-2'
      }`}
    >
      Modified
    </span>
  )
}
