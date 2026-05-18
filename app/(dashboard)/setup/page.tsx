'use client'

/**
 * /setup — first-run wizard.
 *
 * Lands here automatically the first time a fresh account opens
 * /dashboard with zero courses (see app/(dashboard)/dashboard/page.tsx
 * redirect). Surfaces the three integrations TEEPO depends on:
 *
 *   1. Google Drive — DBProvider auto-creates TEEPO/db.json on first
 *      successful load, so if useDB().ready is true, this is green.
 *   2. Google Calendar — already authed (same OAuth as Drive). The
 *      useWeekCalendar() probe surfaces failures (token revoked, API
 *      disabled, etc.).
 *   3. Moodle — POST /api/university/connect/moodle on the backend
 *      (Render). Polled via /api/university/status.
 *
 * The page is informational, not modal — the user can always click
 * "דלג ועבור לקורסים" to leave without finishing.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, AlertTriangle, Loader2, Folder, Calendar, GraduationCap, ArrowLeft, RefreshCw } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useDB } from '@/lib/db-context'
import { useWeekCalendar } from '@/lib/use-week-calendar'
import { supabase } from '@/lib/supabase'
import { BACKEND_URL as BACKEND } from '@/lib/backend-url'

type StepStatus = 'pending' | 'checking' | 'ok' | 'error' | 'skipped'

interface MoodleStatus {
  moodle: boolean
  portal: boolean
  login_status?: Record<string, string>
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
}

export default function SetupPage() {
  const router = useRouter()
  const { user, googleToken } = useAuth()
  const { db, ready, error: dbError, updateSettings, flushSave } = useDB()
  const calendar = useWeekCalendar()

  // ── Step 1: Drive ────────────────────────────────────────────────────
  // ready=true → DBProvider already created TEEPO/ + db.json.
  const driveStatus: StepStatus = useMemo(() => {
    if (!user) return 'pending'
    if (dbError) return 'error'
    if (ready) return 'ok'
    return 'checking'
  }, [user, ready, dbError])

  // ── Step 2: Calendar ─────────────────────────────────────────────────
  const calStatus: StepStatus = useMemo(() => {
    if (!googleToken) return 'pending'
    if (calendar.error) return 'error'
    if (calendar.loading) return 'checking'
    return 'ok'
  }, [googleToken, calendar.error, calendar.loading])

  // ── Step 3: Moodle — backend status (polled) ─────────────────────────
  const [moodle, setMoodle] = useState<MoodleStatus | null>(null)
  const [moodleProbing, setMoodleProbing] = useState(false)
  const [moodleErr, setMoodleErr] = useState<string | null>(null)

  const probeMoodle = async () => {
    setMoodleProbing(true)
    setMoodleErr(null)
    try {
      const res = await fetch(`${BACKEND}/api/university/status`, {
        headers: await authHeaders(),
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setMoodle(await res.json())
    } catch (e) {
      setMoodleErr((e as Error)?.message ?? 'lookup failed')
    } finally {
      setMoodleProbing(false)
    }
  }

  useEffect(() => {
    void probeMoodle()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const moodleStatus: StepStatus = useMemo(() => {
    if (moodleProbing) return 'checking'
    if (moodleErr) return 'error'
    if (moodle?.moodle) return 'ok'
    return 'pending'
  }, [moodle, moodleProbing, moodleErr])

  const allDone = driveStatus === 'ok' && calStatus === 'ok'

  const onFinish = async () => {
    try {
      await updateSettings({ setup_seen: true })
      // Flush immediately — without this the save sits in the 30s debounce
      // window and a user who navigates fast (router.push happens right
      // after) might lose it, causing the setup wizard to reappear next
      // session.
      await flushSave()
    } catch {}
    router.push('/courses')
  }

  return (
    <div className="cream-page setup-page">
      <main className="setup-main">
        <header className="setup-head">
          <div className="setup-eyebrow">ברוכים הבאים ל-TEEPO</div>
          <h1 className="setup-h1">
            בואו <span className="accent">נחבר</span> אותך.
          </h1>
          <p className="setup-sub">
            שלושה דברים שאנחנו צריכים — שניים מתחילים אוטומטית, אחד דורש דקה ממך.
          </p>
        </header>

        <ol className="setup-steps">
          <Step
            n={1}
            icon={<Folder />}
            title="Google Drive"
            subtitle="התיקייה TEEPO/ נוצרת באוטומטי בDrive האישי שלך — בלי גישה לקבצים אחרים."
            status={driveStatus}
            errorText={dbError ?? undefined}
          />

          <Step
            n={2}
            icon={<Calendar />}
            title="Google Calendar"
            subtitle="האירועים השבועיים מוצגים בdashboard. drive.file + calendar.readonly היחידים שביקשנו."
            status={calStatus}
            errorText={calendar.error ?? undefined}
          />

          <Step
            n={3}
            icon={<GraduationCap />}
            title="Moodle"
            subtitle="חיבור לMoodle של האוניברסיטה כדי לייבא קורסים, ציונים ומטלות אוטומטית."
            status={moodleStatus}
            errorText={moodleErr ?? undefined}
            cta={
              moodleStatus === 'ok' ? (
                <Link href="/moodle" className="setup-cta secondary">
                  עבור ל-Moodle <ArrowLeft size={14} />
                </Link>
              ) : (
                <div className="setup-cta-row">
                  <Link href="/moodle" className="setup-cta primary">
                    התחבר ל-Moodle <ArrowLeft size={14} />
                  </Link>
                  <button
                    type="button"
                    className="setup-cta secondary"
                    onClick={probeMoodle}
                    disabled={moodleProbing}
                  >
                    <RefreshCw size={14} className={moodleProbing ? 'spin' : ''} />
                    בדוק שוב
                  </button>
                </div>
              )
            }
          />
        </ol>

        <footer className="setup-foot">
          <button
            type="button"
            className="setup-finish"
            onClick={onFinish}
            disabled={!allDone}
          >
            {allDone ? 'סיום — קח אותי לקורסים' : 'סיים את החיבור כדי להמשיך'}
          </button>
          <Link href="/courses" className="setup-skip" onClick={() => {
            // Same persistence concern as onFinish: navigating in <30s
            // would lose the in-memory save. Fire updateSettings + flush,
            // ignore errors (the Link will navigate either way).
            void (async () => {
              try {
                await updateSettings({ setup_seen: true })
                await flushSave()
              } catch {}
            })()
          }}>
            דלג ועבור לקורסים
          </Link>
        </footer>
      </main>
    </div>
  )
}

function Step({
  n,
  icon,
  title,
  subtitle,
  status,
  errorText,
  cta,
}: {
  n: number
  icon: React.ReactNode
  title: string
  subtitle: string
  status: StepStatus
  errorText?: string
  cta?: React.ReactNode
}) {
  return (
    <li className={`setup-step status-${status}`}>
      <div className="setup-step-num">{n}</div>
      <div className="setup-step-icon" aria-hidden>{icon}</div>
      <div className="setup-step-body">
        <h3>{title}</h3>
        <p>{subtitle}</p>
        {errorText && status === 'error' && (
          <small className="setup-step-error">{errorText}</small>
        )}
        {cta && <div className="setup-step-cta">{cta}</div>}
      </div>
      <div className="setup-step-status" aria-hidden>
        {status === 'ok'        && <Check size={20} />}
        {status === 'checking'  && <Loader2 size={20} className="spin" />}
        {status === 'error'     && <AlertTriangle size={20} />}
        {status === 'pending'   && <span className="setup-pending-dot" />}
      </div>
    </li>
  )
}
