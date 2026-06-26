import { useState } from 'react'
import { CheckCircle, ExternalLink, Link2, Loader2, Plus, X } from 'lucide-react'
import { useCustom, parseCustomUrl } from '../store/custom'
import { SHARE_CUSTOM_URL } from '../lib/starblast'

interface Props {
  open: boolean
  onClose: () => void
}

type Status = 'idle' | 'loading' | 'ok' | 'error'

export function ShareCustomGame({ open, onClose }: Props) {
  const { keys, add, remove } = useCustom()
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Status>('idle')

  const submit = async () => {
    const key = parseCustomUrl(input)
    if (!key) {
      setError('Invalid URL. Expected: https://starblast.io/#1234@1.2.3.4')
      return
    }

    setStatus('loading')
    setError('')

    try {
      // POST to dankdmitron relay — syncs with their custom game list
      const res = await fetch(SHARE_CUSTOM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: `https://starblast.io/#${key}` }),
      })
      const json = await res.json() as { status: string; error?: string }

      if (json.status === 'error') {
        // "invalid format" usually means the game doesn't exist / has ended
        setError(json.error === 'invalid format'
          ? 'Game not found or already ended.'
          : (json.error ?? 'Share failed.'))
        setStatus('error')
        return
      }
    } catch {
      // Network error — still save locally
    }

    add(key)
    setInput('')
    setStatus('ok')
    setTimeout(() => setStatus('idle'), 2000)
  }

  if (!open) return null

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
      <div className="fixed left-1/2 top-1/2 z-50 w-[min(460px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-app)] border border-border bg-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-text">
            <Link2 className="size-4 text-accent" /> Share Custom Game
          </h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted hover:text-text">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Input */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">
              Starblast join URL
            </label>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => { setInput(e.target.value); setError(''); setStatus('idle') }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                placeholder="https://starblast.io/#1234@1.2.3.4"
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text outline-none placeholder:text-muted focus:border-accent"
              />
              <button
                onClick={submit}
                disabled={status === 'loading'}
                className="flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-bg hover:opacity-90 disabled:opacity-60"
              >
                {status === 'loading' ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : status === 'ok' ? (
                  <CheckCircle className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
              </button>
            </div>
            {error && <p className="mt-1 text-xs text-danger">{error}</p>}
            {status === 'ok' && (
              <p className="mt-1 text-xs text-success">Shared — visible for everyone on Foxie and ServerList+.</p>
            )}
            {status === 'idle' && !error && (
              <p className="mt-1 text-[11px] text-muted">
                Paste a join link — synced with ServerList+ (dankdmitron.dev).
              </p>
            )}
          </div>

          {/* Saved custom games */}
          {keys.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">My shared games</p>
              <ul className="space-y-1.5">
                {keys.map((k) => {
                  const [id, addr] = k.split('@')
                  return (
                    <li key={k} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-text">System #{id}</span>
                        <span className="block truncate text-[11px] text-muted">{addr}</span>
                      </span>
                      <a
                        href={`https://starblast.io/#${k}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded p-1 text-muted hover:text-text"
                        title="Join"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                      <button
                        onClick={() => remove(k)}
                        className="shrink-0 rounded p-1 text-muted hover:text-danger"
                        title="Remove"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
