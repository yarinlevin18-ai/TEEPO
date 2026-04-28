'use client'

/**
 * Sticky banner shown when the user's Google Drive isn't connected.
 *
 * Conditions (any one):
 *   • Signed in but no Google token at all (e.g. signed in via email/password).
 *   • Token exists but the DB load failed (wrong scope, revoked access, etc.).
 *
 * Offers a one-click "reconnect" that clears the stored token and re-runs the
 * OAuth flow with `prompt=consent` so Google re-asks for the drive.file scope.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'

export default function DriveConnectionBanner() {
  const { reconnectGoogle } = useAuth()
  const { driveConnected, driveMissing, error, reload, loading } = useDB()
  const [reconnecting, setReconnecting] = useState(false)

  // Nothing to show: either signed out, or Drive is working.
  if (driveConnected) return null
  // Still loading for the first time — don't show yet.
  if (loading && !error && !driveMissing) return null

  const message = driveMissing
    ? 'לא התחברת ל-Google Drive. החיבור נדרש כדי לשמור את הקורסים, המשימות והמטלות שלך.'
    : error || 'טעינת Google Drive נכשלה.'

  const handleReconnect = async () => {
    setReconnecting(true)
    try {
      await reconnectGoogle()
    } catch {
      setReconnecting(false)
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="qa-drive-banner mx-4 sm:mx-6 lg:mx-8 mt-4 p-4 rounded-2xl flex items-start gap-3 relative z-[2]"
        style={{
          background: 'rgba(var(--glow1), 0.07)',
          border: '0.5px solid rgba(var(--glow1), 0.32)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(var(--glow1), 0.14)' }}
        >
          <AlertTriangle size={18} style={{ color: 'var(--accent)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
            Google Drive לא מחובר
          </h4>
          <p className="text-xs text-ink-muted mt-0.5 leading-relaxed">
            {message}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!driveMissing && (
            <button
              onClick={reload}
              className="p-2 rounded-lg bg-white/5 text-ink-muted hover:text-ink hover:bg-white/10 transition-all"
              title="נסה שוב"
            >
              <RefreshCw size={14} />
            </button>
          )}
          <button
            onClick={handleReconnect}
            disabled={reconnecting}
            className="btn-gradient px-4 py-2 rounded-lg text-xs text-white font-medium flex items-center gap-1.5 disabled:opacity-50"
          >
            {reconnecting
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCw size={13} />
            }
            {reconnecting ? 'מתחבר...' : 'התחבר מחדש ל-Google'}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
