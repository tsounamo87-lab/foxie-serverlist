/** Minimal geometric fox head mark — inherits currentColor. */
export function FoxLogo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <path
        d="M12 8l10 8h20l10-8 4 20c0 16-12 28-24 28S8 44 8 28L12 8z"
        fill="currentColor"
        opacity="0.18"
      />
      <path
        d="M12 8l10 8h20l10-8 4 20c0 16-12 28-24 28S8 44 8 28L12 8z"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M22 28l5 4-5 3z" fill="currentColor" />
      <path d="M42 28l-5 4 5 3z" fill="currentColor" />
      <path
        d="M26 42c2 2 4 3 6 3s4-1 6-3"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
