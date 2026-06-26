// ─── Error Boundary ───────────────────────────────────────────────────────────
// Catches render-phase errors in the wrapped subtree so a single crashing
// component never takes down the whole page (black screen).

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Shown when the subtree crashes. Defaults to a small inline error notice. */
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(err: Error): State {
    return { error: err }
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] caught:', err, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-muted text-sm">
          <span className="text-danger font-semibold">Something went wrong</span>
          <span className="text-xs opacity-60">{this.state.error.message}</span>
          <button
            onClick={this.reset}
            className="mt-2 rounded-md border border-border px-3 py-1 text-xs hover:text-text transition-colors"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
