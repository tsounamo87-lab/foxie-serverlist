import { useEffect } from 'react'
import { Bell, X } from 'lucide-react'
import { useToasts, type Toast } from '../store/toasts'

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(340px,90vw)] flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  )
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss)
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), 6000)
    return () => clearTimeout(id)
  }, [toast.id, dismiss])

  return (
    <div className="fx-glow animate-fade-up pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-app)] border border-accent/40 bg-surface p-3 shadow-xl">
      <Bell className="mt-0.5 size-4 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-text">{toast.message}</div>
        {toast.detail && <div className="text-xs text-muted">{toast.detail}</div>}
      </div>
      <button onClick={() => dismiss(toast.id)} className="text-muted hover:text-text">
        <X className="size-4" />
      </button>
    </div>
  )
}
