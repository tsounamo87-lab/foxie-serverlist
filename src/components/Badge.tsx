import { useState } from 'react'
import { resolveBadge } from '../lib/badges'

/**
 * ECP badge. Resolves the badge code against the official registry to get
 * the correct image (png/jpg) and display name. Vector-only badges (no flat
 * image) and load failures fall back to a small labelled chip.
 */
export function Badge({ code, className = 'size-4' }: { code: string; className?: string }) {
  const badge = resolveBadge(code)
  const [failed, setFailed] = useState(false)

  if (!badge) return null

  if (badge.url && !failed) {
    return (
      <img
        src={badge.url}
        alt={badge.name}
        title={badge.name}
        loading="lazy"
        className={`${className} shrink-0 rounded-sm object-cover`}
        onError={() => setFailed(true)}
      />
    )
  }

  // Vector-only or failed image: compact initials chip.
  return (
    <span
      title={badge.name}
      className={`${className} flex shrink-0 items-center justify-center rounded-sm bg-accent-soft text-[7px] font-bold uppercase leading-none text-accent`}
    >
      {badge.name.slice(0, 2)}
    </span>
  )
}
