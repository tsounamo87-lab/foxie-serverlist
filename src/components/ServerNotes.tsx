// ─── Server Notes ─────────────────────────────────────────────────────────────
// Users can leave notes on any server. Stored in Supabase, visible to everyone.
// Table schema:
//   server_notes (id, server_id, author, content, created_at)
//   RLS: public SELECT + INSERT; no UPDATE/DELETE for anon

import { useEffect, useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { supabase, supabaseConfigured } from '../lib/supabase'

interface Note {
  id: number
  author: string
  content: string
  created_at: string
}

interface Props {
  serverId: string
  serverName: string
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function ServerNotes({ serverId, serverName }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [author, setAuthor] = useState(() => localStorage.getItem('foxie-author') ?? '')
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabaseConfigured) { setLoading(false); return }
    supabase!.from('server_notes')
      .select('id, author, content, created_at')
      .eq('server_id', serverId)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data }) => {
        setNotes((data ?? []) as Note[])
        setLoading(false)
      })
  }, [serverId])

  const send = async () => {
    if (!content.trim() || !supabaseConfigured) return
    const a = author.trim() || 'Anonymous'
    setSending(true)
    localStorage.setItem('foxie-author', a)
    const { data, error } = await supabase!.from('server_notes').insert({
      server_id: serverId,
      server_name: serverName,
      author: a,
      content: content.trim(),
    }).select()
    if (!error && data) {
      setNotes(prev => [...prev, data[0] as Note])
      setContent('')
    }
    setSending(false)
  }

  if (!supabaseConfigured) return null

  return (
    <div className="rounded-[var(--radius-app)] border border-border bg-surface-2">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <MessageSquare className="size-4 text-accent" />
        <span className="text-sm font-bold text-text">Notes</span>
        <span className="ml-auto text-xs text-muted">{notes.length}</span>
      </div>

      {/* Notes list */}
      <div className="max-h-40 overflow-y-auto">
        {loading ? (
          <div className="px-4 py-3 text-xs text-muted">Loading…</div>
        ) : notes.length === 0 ? (
          <div className="px-4 py-3 text-xs text-muted">No notes yet. Be the first!</div>
        ) : (
          notes.map(n => (
            <div key={n.id} className="border-b border-border/40 px-4 py-2 last:border-0">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-xs font-semibold text-text">{n.author}</span>
                <span className="text-[10px] text-muted">{fmtTime(n.created_at)}</span>
              </div>
              <p className="text-xs text-muted">{n.content}</p>
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className="flex flex-col gap-1.5 border-t border-border p-3">
        <input
          value={author}
          onChange={e => setAuthor(e.target.value)}
          placeholder="Your name (optional)"
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text outline-none focus:border-accent"
        />
        <div className="flex gap-2">
          <input
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Leave a note…"
            className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text outline-none focus:border-accent"
          />
          <button onClick={send} disabled={!content.trim() || sending}
            className="rounded-md bg-accent px-2 py-1 text-bg hover:opacity-90 disabled:opacity-40">
            <Send className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
