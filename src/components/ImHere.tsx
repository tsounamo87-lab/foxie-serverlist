// ─── "J'y suis" — I'm Here ───────────────────────────────────────────────────
// Players can signal they're in this server. Shown as live presence indicators.
// Table: server_presence (id, server_id, player_name, updated_at)
// RLS: public SELECT + UPSERT; DELETE where player_name matches

import { useEffect, useState, useCallback } from 'react'
import { UserCheck, X } from 'lucide-react'
import { supabase, supabaseConfigured } from '../lib/supabase'

interface Presence {
  id: number
  player_name: string
  updated_at: string
}

interface Props {
  serverId: string
}

const PRESENCE_TTL = 10 * 60 * 1000 // 10 minutes before auto-expiry

export function ImHere({ serverId }: Props) {
  const [presences, setPresences] = useState<Presence[]>([])
  const [myName, setMyName] = useState(() => localStorage.getItem('foxie-author') ?? '')
  const [amHere, setAmHere] = useState(false)
  const [inputVisible, setInputVisible] = useState(false)
  const [input, setInput] = useState('')

  const load = useCallback(async () => {
    if (!supabaseConfigured) return
    const cutoff = new Date(Date.now() - PRESENCE_TTL).toISOString()
    const { data } = await supabase!.from('server_presence')
      .select('id, player_name, updated_at')
      .eq('server_id', serverId)
      .gte('updated_at', cutoff)
      .order('updated_at', { ascending: false })
    setPresences((data ?? []) as Presence[])
  }, [serverId])

  useEffect(() => { void load() }, [load])

  const checkin = async (name: string) => {
    if (!supabaseConfigured || !name.trim()) return
    localStorage.setItem('foxie-author', name)
    setMyName(name)
    await supabase!.from('server_presence').upsert({
      server_id: serverId,
      player_name: name.trim(),
    }, { onConflict: 'server_id,player_name' })
    setAmHere(true)
    setInputVisible(false)
    void load()
  }

  const checkout = async () => {
    if (!supabaseConfigured || !myName) return
    await supabase!.from('server_presence')
      .delete().eq('server_id', serverId).eq('player_name', myName)
    setAmHere(false)
    void load()
  }

  if (!supabaseConfigured) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2">
      <UserCheck className="size-4 text-accent shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="text-xs font-medium text-text">Playing here</span>
        {presences.length > 0 && (
          <span className="ml-2 text-xs text-muted">
            {presences.slice(0, 3).map(p => p.player_name).join(', ')}
            {presences.length > 3 && ` +${presences.length - 3}`}
          </span>
        )}
        {presences.length === 0 && <span className="ml-2 text-xs text-muted">No one yet</span>}
      </div>

      {amHere ? (
        <button onClick={checkout}
          className="shrink-0 flex items-center gap-1 rounded-md border border-danger/40 px-2 py-1 text-[11px] text-danger hover:bg-danger/10">
          <X className="size-3" /> Leave
        </button>
      ) : inputVisible ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkin(input || myName || 'Anonymous')}
            placeholder={myName || 'Your name'}
            className="w-28 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text outline-none focus:border-accent"
          />
          <button onClick={() => checkin(input || myName || 'Anonymous')}
            className="rounded-md bg-accent px-2 py-1 text-[11px] font-semibold text-bg hover:opacity-90">
            Go
          </button>
        </div>
      ) : (
        <button onClick={() => setInputVisible(true)}
          className="shrink-0 rounded-md bg-accent/20 px-2 py-1 text-[11px] font-semibold text-accent hover:bg-accent/30">
          I'm here
        </button>
      )}
    </div>
  )
}
