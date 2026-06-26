// ─── Clan Manager ─────────────────────────────────────────────────────────────
// Read-only for all visitors.
// Admin (holder of the JSONBin Master Key) can add/remove tags and save.
// Tags are stored in JSONBin and shared across every visitor's browser.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircle,
  ChevronRight,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import { useClans } from '../store/clans'
import { remoteSaveTags, clansConfigured } from '../lib/clansApi'
import { detectTagCandidates, type TagCandidate } from '../lib/tagDetection'
import { queryActivity } from '../lib/survivalTracker'

// ── Not-configured banner ─────────────────────────────────────────────────────

function NotConfigured() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full border border-warning/40 bg-warning/10">
        <Shield className="size-6 text-warning" />
      </div>
      <div>
        <p className="font-semibold text-text">Database not configured</p>
        <p className="mt-1 text-xs text-muted">
          Set <code className="rounded bg-surface-2 px-1 text-text">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-surface-2 px-1 text-text">VITE_SUPABASE_ANON_KEY</code> to enable shared clan tags.
        </p>
      </div>
    </div>
  )
}

// ── Admin key unlock ──────────────────────────────────────────────────────────

function AdminUnlock({ onUnlock }: { onUnlock: () => void }) {
  const { setMasterKey } = useClans()
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleUnlock = () => {
    if (!input.trim()) { setError('Enter the admin password'); return }
    setMasterKey(input)
    onUnlock()
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-10 text-center">
      <div className="flex size-14 items-center justify-center rounded-full border border-border bg-surface-2">
        <Lock className="size-6 text-muted" />
      </div>
      <div>
        <p className="font-semibold text-text">Admin access</p>
        <p className="mt-1 text-xs text-muted">
          Enter the admin password to edit and save clan tags for all users.
        </p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        <input
          ref={inputRef}
          type="password"
          placeholder="Admin password…"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError('') }}
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
      <button
        onClick={handleUnlock}
        className="rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-bg hover:opacity-90"
      >
        Unlock
      </button>
    </div>
  )
}

// ── Suggestion card ───────────────────────────────────────────────────────────

function SuggestionCard({
  candidate,
  onAdd,
}: {
  candidate: TagCandidate
  onAdd: (tag: string) => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <span className="font-mono text-sm font-bold text-accent">{candidate.tag}</span>
        <p className="mt-0.5 truncate text-[11px] text-muted">
          {candidate.count} players · {candidate.examples.join(', ')}
        </p>
      </div>
      <button
        onClick={() => onAdd(candidate.tag)}
        className="flex shrink-0 items-center gap-1 rounded-md bg-accent px-2.5 py-1 text-xs font-semibold text-bg hover:opacity-90"
      >
        <Plus className="size-3" /> Add
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
}

export function ClanManager({ onClose }: Props) {
  const { tags, _setTags, isAdmin, clearMasterKey, syncFromRemote } = useClans()

  // Admin unlocked?
  const [unlocked, setUnlocked] = useState(isAdmin())

  // Editing state — a working copy of tags that can be modified without saving
  const [draft, setDraft] = useState<string[]>(tags)
  const [newTag, setNewTag] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  // Save state
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'ok' | 'bad_key' | 'net' | null>(null)

  // Suggestions from player history
  const [suggestions, setSuggestions] = useState<TagCandidate[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // Keep draft in sync when tags change externally (e.g. after remote sync)
  useEffect(() => { setDraft(tags) }, [tags])

  // Load suggestions when unlocked
  useEffect(() => {
    if (!unlocked) return
    setLoadingSuggestions(true)
    queryActivity(0)
      .then(({ players }) => {
        const names = players.map((p) => p.playerName)
        setSuggestions(detectTagCandidates(names, draft))
      })
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked])

  const visibleSuggestions = useMemo(
    () => suggestions.filter((s) => !draft.includes(s.tag)),
    [suggestions, draft],
  )

  const handleAdd = () => {
    const t = newTag.trim()
    if (!t || draft.includes(t)) return
    setDraft((d) => [...d, t])
    setNewTag('')
    setSaveResult(null)
    addInputRef.current?.focus()
  }

  const handleRemove = (tag: string) => {
    setDraft((d) => d.filter((t) => t !== tag))
    setSaveResult(null)
  }

  const handleSave = async () => {
    const { masterKey } = useClans.getState()
    setSaving(true)
    setSaveResult(null)
    const result = await remoteSaveTags(draft, masterKey)
    setSaving(false)
    if (result.ok) {
      _setTags(draft)
      setSaveResult('ok')
    } else if (result.reason === 'invalid_key') {
      setSaveResult('bad_key')
    } else {
      setSaveResult('net')
    }
  }

  const handleRefresh = async () => {
    await syncFromRemote()
    setDraft(useClans.getState().tags)
  }

  const isDirty = JSON.stringify(draft) !== JSON.stringify(tags)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="animate-fade-up flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius-app)] border border-border bg-surface shadow-2xl"
      >
        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
          <Shield className="size-5 shrink-0 text-accent" />
          <h2 className="flex-1 text-base font-bold text-text">Clan Management</h2>

          {/* Status badge */}
          {unlocked ? (
            <span className="flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] text-success">
              <LockOpen className="size-3" /> Admin
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted">
              <Lock className="size-3" /> Read-only
            </span>
          )}

          <button
            onClick={handleRefresh}
            className="rounded-md border border-border p-1.5 text-muted hover:text-text"
            title="Refresh from remote"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-border p-1.5 text-muted hover:text-text"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────────── */}
        {!clansConfigured ? (
          <NotConfigured />
        ) : !unlocked ? (
          <>
            {/* Read-only tag list */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <Tag className="size-3.5" /> Active tags
                <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-normal text-text">
                  {tags.length}
                </span>
              </h3>
              {tags.length === 0 ? (
                <p className="text-xs text-muted">No clan tags configured yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {tags.map((tag) => (
                    <div key={tag} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                      <ChevronRight className="size-3.5 shrink-0 text-muted" />
                      <span className="flex-1 font-mono text-sm font-semibold text-text">{tag}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="border-t border-border px-5 py-3">
              <button
                onClick={() => setUnlocked(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-surface-2 py-2 text-sm text-muted hover:text-text transition-colors"
              >
                <Lock className="size-3.5" /> Admin access
              </button>
            </div>
          </>
        ) : !isAdmin() ? (
          <AdminUnlock onUnlock={() => setUnlocked(true)} />
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">

              {/* Current tags (draft) */}
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                  <Tag className="size-3.5" /> Tags
                  <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-normal text-text">{draft.length}</span>
                  {isDirty && <span className="text-warning">· unsaved</span>}
                </h3>

                {draft.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted">
                    No clan tags yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {draft.map((tag) => (
                      <div key={tag} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
                        <ChevronRight className="size-3.5 shrink-0 text-muted" />
                        <span className="flex-1 font-mono text-sm font-semibold text-text">{tag}</span>
                        <button onClick={() => handleRemove(tag)} className="shrink-0 rounded p-0.5 text-muted hover:text-danger">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Add tag */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Add a tag</h3>
                <div className="flex gap-2">
                  <input
                    ref={addInputRef}
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder="e.g.  [FOX]  ·  NK  ·  ❮⌥Ƒᔦ❯"
                    className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <button
                    onClick={handleAdd}
                    disabled={!newTag.trim()}
                    className="flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="size-4" /> Add
                  </button>
                </div>
              </section>

              {/* Suggestions */}
              {(visibleSuggestions.length > 0 || loadingSuggestions) && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    <Sparkles className="size-3.5 text-accent" /> Detected in player history
                  </h3>
                  {loadingSuggestions ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted"><Loader2 className="size-3 animate-spin" /> Scanning…</p>
                  ) : (
                    <div className="space-y-2">
                      {visibleSuggestions.map((c) => (
                        <SuggestionCard
                          key={c.tag}
                          candidate={c}
                          onAdd={(tag) => { setDraft((d) => [...d, tag]); setSuggestions((s) => s.filter((x) => x.tag !== tag)) }}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* ── Footer — save + status ──────────────────────────────── */}
            <div className="border-t border-border px-5 py-3 space-y-2">
              {/* Save result */}
              {saveResult === 'ok' && (
                <p className="flex items-center gap-1.5 text-xs text-success">
                  <CheckCircle className="size-3.5" /> Saved — all visitors will see the updated tags.
                </p>
              )}
              {saveResult === 'bad_key' && (
                <p className="text-xs text-danger">
                  Wrong admin password.{' '}
                  <button onClick={() => { clearMasterKey(); setUnlocked(false) }} className="underline">
                    Re-enter password
                  </button>
                </p>
              )}
              {saveResult === 'net' && (
                <p className="text-xs text-danger">Network error — check your connection and try again.</p>
              )}

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving || !isDirty}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-accent py-2 text-sm font-semibold text-bg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? <><Loader2 className="size-4 animate-spin" /> Saving…</>
                    : 'Save for everyone'}
                </button>
                <button
                  onClick={() => { clearMasterKey(); setUnlocked(false) }}
                  className="rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-text"
                  title="Log out as admin"
                >
                  <Lock className="size-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
