'use client'

import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex items-center justify-center min-h-[300px] p-8">
          <div className="glass p-8 max-w-md text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} className="text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-ink">משהו השתבש</h2>
            <p className="text-sm text-ink-muted">
              {this.state.error?.message || 'שגיאה לא צפויה. נסה לרענן את העמוד.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: undefined })
                window.location.reload()
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium btn-gradient"
            >
              <RefreshCw size={14} />
              רענן
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
