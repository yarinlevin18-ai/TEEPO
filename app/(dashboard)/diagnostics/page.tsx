'use client'

/**
 * /diagnostics — at-a-glance health of every integration TEEPO depends on.
 *
 * Used for two things:
 *   1. When something stops working — the user can come here and see exactly
 *      which layer is broken (Drive scope? db.json missing? Moodle backend
 *      cold?) rather than guess.
 *   2. As a permanent escape hatch from the friendly /setup wizard for users
 *      who want the raw status.
 *
 * Pulls from existing context — doesn't fire any new mutations. The single
 * action it offers is "reconnect Google" which rotates the OAuth scope grant.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, AlertTriangle, Loader2, Copy, RefreshCw, ExternalLink } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'
import { useWeekCalendar } from '@/lib/use-week-calendar'
import { probeTokenScopes } from '@/lib/drive-db'
import { supabase } from '@/lib/supabase'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

interface ScopeInfo {
  hasDriveFile?: boolean
  hasCalendar?: boolean
  /** number = seconds until expiry; null when tokeninfo doesn't include it. */
  expiresIn?: number | null
  error?: string
}

interface MoodleProbe {
  connected: boolean
  reachable: boolean
  error: string | null
}

export default function DiagnosticsPage() {
  const { user, googleToken, reconnectGoogle } = useAuth()
  const { db, ready, error: dbError, handle, reload } = useDB() as any
  const calendar = useWeekCalendar()
  const [scopes, setScopes] = useState<ScopeInfo | null>(null)
  const [scopesLoading, setScopesLoading] = useState(false)
  const [moodle, setMoodle] = useState<MoodleProbe>({ connected: false, reachable: false, error: null })
  const [moodleProbing, setMoodleProbing] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const probeScopes = async () => {
    if (!googleToken) {
      setScopes({ error: 'no_token' })
      return
    }
    setScopesLoading(true)
    try {
      const info = await probeTokenScopes(googleToken)
      setScopes(info)
    } catch (e) {
      setScopes({ error: (e as Error).message })
    } finally {
      setScopesLoading(false)
    }
  }

  const probeMoodleBackend = async () => {
    setMoodleProbing(true)
    setMoodle((m) => ({ ...m, error: null }))
    try {
      const headers = await authHeaders()
      const res = await fetch(`${BACKEND}/api/university/status`, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data = await res.json()
      setMoodle({ connected: Boolean(data.moodle), reachable: true, error: null })
    } catch (e) {
      const msg = (e as Error)?.message ?? 'lookup failed'
      const cold = msg.includes('timeout') || msg.includes('Failed to fetch')
      setMoodle({
        connected: false,
        reachable: false,
        error: cold
          ? 'השרת לא הגיב (אולי בשינה — Render Free נדרשת תקופת התעוררות של 30-60ש)'
          : msg.slice(0, 160),
      })
    } finally {
      setMoodleProbing(false)
    }
  }

  useEffect(() => {
    void probeScopes()
    void probeMoodleBackend()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleToken])

  const copyToClipboard = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(id)
      setTimeout(() => setCopied(null), 1500)
    } catch {}
  }

  // ── Compute derived states for rendering ─────────────────────────────
  const driveOk = ready && !dbError && !!handle?.folderId
  const calOk = !!googleToken && !calendar.error && !calendar.loading
  const scopesOk = scopes?.hasDriveFile && scopes?.hasCalendar
  const moodleOk = moodle.connected

  return (
    <div className="cream-page diag-page">
      <main className="diag-main">
        <header className="diag-head">
          <div className="diag-eyebrow">אבחון</div>
          <h1 className="diag-h1">מה <span className="accent">עובד</span> ומה לא.</h1>
          <p className="diag-sub">
            תמונת מצב מלאה של כל החיבורים. אם משהו שבור — כאן תראה איפה.
          </p>
        </header>

        {/* ── Section: Identity ─────────────────────────────────────────── */}
        <section className="diag-section">
          <h2>זהות</h2>
          <DiagRow label="חשבון Google" status={user ? 'ok' : 'error'}>
            {user
              ? <span>{user.email ?? user.user_metadata?.display_name ?? user.id?.slice(0, 8)}</span>
              : <span>לא מחובר</span>}
          </DiagRow>
          <DiagRow label="Token פעיל" status={googleToken ? 'ok' : 'error'}>
            {googleToken ? 'יש' : 'אין'}
            {scopes?.expiresIn && (
              <small className="diag-aside"> · יפוג בעוד {Math.round(scopes.expiresIn / 60)} דק'</small>
            )}
          </DiagRow>
        </section>

        {/* ── Section: Google scopes ────────────────────────────────────── */}
        <section className="diag-section">
          <h2>
            הרשאות Google
            <button
              type="button"
              className="diag-section-refresh"
              onClick={probeScopes}
              disabled={scopesLoading}
              aria-label="רענן"
            >
              <RefreshCw size={13} className={scopesLoading ? 'spin' : ''} />
            </button>
          </h2>
          <DiagRow label="drive.file" status={scopes?.hasDriveFile ? 'ok' : scopesLoading ? 'checking' : 'error'}>
            {scopes?.hasDriveFile ? 'מאושר — קריאה/כתיבה לקבצים שיצרנו' : 'חסר. צריך להתחבר מחדש.'}
          </DiagRow>
          <DiagRow label="calendar.readonly" status={scopes?.hasCalendar ? 'ok' : scopesLoading ? 'checking' : 'error'}>
            {scopes?.hasCalendar ? 'מאושר — קריאת אירועים בלוח השנה' : 'חסר. צריך להתחבר מחדש.'}
          </DiagRow>
          {!scopesOk && !scopesLoading && (
            <button
              type="button"
              className="diag-cta primary"
              onClick={() => reconnectGoogle()}
            >
              התחבר מחדש ל-Google (לאישור הרשאות חסרות)
            </button>
          )}
        </section>

        {/* ── Section: Drive ────────────────────────────────────────────── */}
        <section className="diag-section">
          <h2>
            Google Drive
            <button
              type="button"
              className="diag-section-refresh"
              onClick={() => reload?.()}
              disabled={!reload}
              aria-label="רענן"
            >
              <RefreshCw size={13} />
            </button>
          </h2>
          <DiagRow label="תיקיית TEEPO/" status={driveOk ? 'ok' : ready ? 'error' : 'checking'}>
            {handle?.folderId
              ? <ClipChip id="folder" value={handle.folderId} copied={copied} onCopy={copyToClipboard} />
              : 'לא נמצא — אם כרגע התחברת לראשונה, תרענן בעוד 10 שניות.'}
          </DiagRow>
          <DiagRow label="db.json" status={handle?.fileId ? 'ok' : ready ? 'error' : 'checking'}>
            {handle?.fileId
              ? <ClipChip id="db" value={handle.fileId} copied={copied} onCopy={copyToClipboard} />
              : '—'}
          </DiagRow>
          <DiagRow label="קורסים שמורים" status={ready ? 'ok' : 'checking'}>
            {(db?.courses?.length ?? 0)} קורסים · {(db?.lessons?.length ?? 0)} שיעורים · {(db?.tasks?.length ?? 0)} משימות
          </DiagRow>
          {dbError && (
            <div className="diag-error">{dbError}</div>
          )}
        </section>

        {/* ── Section: Calendar ─────────────────────────────────────────── */}
        <section className="diag-section">
          <h2>
            Google Calendar
            <button
              type="button"
              className="diag-section-refresh"
              onClick={() => calendar.refresh()}
              disabled={calendar.loading}
              aria-label="רענן"
            >
              <RefreshCw size={13} className={calendar.loading ? 'spin' : ''} />
            </button>
          </h2>
          <DiagRow label="API נגיש" status={calOk ? 'ok' : calendar.loading ? 'checking' : 'error'}>
            {calOk ? 'תקין' : calendar.error ?? 'לא נבדק'}
          </DiagRow>
          <DiagRow label="אירועים השבוע" status={ready ? 'ok' : 'checking'}>
            {calendar.slots.length} אירועים
          </DiagRow>
        </section>

        {/* ── Section: Moodle backend ───────────────────────────────────── */}
        <section className="diag-section">
          <h2>
            Moodle Backend
            <button
              type="button"
              className="diag-section-refresh"
              onClick={probeMoodleBackend}
              disabled={moodleProbing}
              aria-label="רענן"
            >
              <RefreshCw size={13} className={moodleProbing ? 'spin' : ''} />
            </button>
          </h2>
          <DiagRow label="שרת זמין" status={moodle.reachable ? 'ok' : moodleProbing ? 'checking' : 'error'}>
            {moodle.reachable ? 'מגיב' : moodle.error ?? 'לא נבדק'}
          </DiagRow>
          <DiagRow label="חיבור Moodle" status={moodleOk ? 'ok' : moodle.reachable ? 'pending' : 'checking'}>
            {moodleOk ? 'מסונכרן' : <Link href="/moodle" className="diag-link">התחבר ←</Link>}
          </DiagRow>
        </section>

        {/* ── Section: Environment ──────────────────────────────────────── */}
        <section className="diag-section">
          <h2>סביבה</h2>
          <DiagRow label="Backend URL">
            <ClipChip id="backend" value={BACKEND} copied={copied} onCopy={copyToClipboard} />
          </DiagRow>
          <DiagRow label="Frontend URL">
            <ClipChip id="frontend" value={typeof window !== 'undefined' ? window.location.origin : ''} copied={copied} onCopy={copyToClipboard} />
          </DiagRow>
        </section>

        <footer className="diag-foot">
          <Link href="/setup" className="diag-cta">מדריך התחלה</Link>
          <Link href="/courses" className="diag-cta">חזרה לקורסים</Link>
        </footer>
      </main>
    </div>
  )
}

function DiagRow({
  label,
  status = 'ok',
  children,
}: {
  label: string
  status?: 'ok' | 'checking' | 'error' | 'pending'
  children: React.ReactNode
}) {
  return (
    <div className={`diag-row status-${status}`}>
      <div className="diag-row-status" aria-hidden>
        {status === 'ok' && <Check size={14} />}
        {status === 'checking' && <Loader2 size={14} className="spin" />}
        {status === 'error' && <AlertTriangle size={14} />}
        {status === 'pending' && <span className="diag-pending-dot" />}
      </div>
      <div className="diag-row-label">{label}</div>
      <div className="diag-row-value">{children}</div>
    </div>
  )
}

function ClipChip({
  id,
  value,
  copied,
  onCopy,
}: {
  id: string
  value: string
  copied: string | null
  onCopy: (id: string, value: string) => Promise<void>
}) {
  return (
    <button
      type="button"
      className="diag-clip"
      onClick={() => onCopy(id, value)}
      title="לחץ להעתקה"
    >
      <code dir="ltr">{value.length > 32 ? value.slice(0, 18) + '…' + value.slice(-8) : value}</code>
      {copied === id ? <Check size={12} /> : <Copy size={12} />}
    </button>
  )
}
