'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, WifiOff, RefreshCw,
  CheckCircle, Loader2, BookOpen, Calendar, ExternalLink, Puzzle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useDB } from '@/lib/db-context'
import { classifyCourse, computeYearOfStudy } from '@/lib/semester-classifier'
import { useUniversityName } from '@/lib/use-university'
import { BACKEND_URL as BACKEND } from '@/lib/backend-url'

type LmsInfo = {
  moodle: { enabled: boolean; url: string; host: string; my_url: string }
  portal: { enabled: boolean; url: string; host: string }
  portal_old: { enabled: boolean; url: string; host: string }
}

const EMPTY_INFO: LmsInfo = {
  moodle: { enabled: false, url: '', host: '', my_url: '' },
  portal: { enabled: false, url: '', host: '' },
  portal_old: { enabled: false, url: '', host: '' },
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` }
  }
  return {}
}

type Status = { moodle: boolean; portal: boolean; login_status: Record<string, string> }

export default function UniversityConnectPage() {
  const router = useRouter()
  const { db, ready, createCourse, updateCourse, updateSettings, flushSave } = useDB() as any
  const universityName = useUniversityName()
  const [status, setStatus] = useState<Status>({ moodle: false, portal: false, login_status: {} })
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')
  const [serverMode, setServerMode] = useState(false)
  const [lmsInfo, setLmsInfo] = useState<LmsInfo>(EMPTY_INFO)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Mirror moodle connection state into db.settings so the TopNav pill
  // shows green/grey without each page having to refetch. Writes only when
  // the value actually flipped (avoid spam-writing to Drive).
  useEffect(() => {
    if (!ready || typeof updateSettings !== 'function') return
    const current = Boolean(db?.settings?.moodle_connected)
    const live = Boolean(status.moodle)
    if (current !== live) {
      void updateSettings({ moodle_connected: live }).catch(() => {})
    }
  }, [ready, status.moodle, db?.settings?.moodle_connected, updateSettings])

  const fetchStatus = async () => {
    try {
      const headers = await authHeaders()
      const res = await fetch(`${BACKEND}/api/university/status`, { headers, signal: AbortSignal.timeout(10000) })
      if (res.ok) setStatus(await res.json())
    } catch {}
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    fetch(`${BACKEND}/api/university/mode`)
      .then(r => r.json())
      .then(d => setServerMode(d.server_mode))
      .catch(() => {})
    fetch(`${BACKEND}/api/university/info`)
      .then(r => r.json())
      .then((d: LmsInfo) => setLmsInfo(d))
      .catch(() => {})
    return () => clearInterval(interval)
  }, [])

  const connect = async (site: 'moodle' | 'portal', creds?: { username: string; password: string }) => {
    setLoading(p => ({ ...p, [site]: true }))
    setSyncResult('')
    try {
      const headers = { 'Content-Type': 'application/json', ...(await authHeaders()) }
      const res = await fetch(`${BACKEND}/api/university/connect/${site}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(creds || {}),
      })
      if (!res.ok) {
        throw new Error(`Backend ${res.status}: ${await res.text().catch(() => '')}`)
      }
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`${BACKEND}/api/university/connect/${site}/poll`)
          if (!r.ok) return
          const data = await r.json()
          if (data.connected || data.status === 'failed') {
            clearInterval(pollRef.current!)
            setLoading(p => ({ ...p, [site]: false }))
            fetchStatus()
          }
        } catch {}
      }, 2000)
    } catch (e: any) {
      console.error('[moodle]', e)
      setSyncResult(`שגיאה: ${e?.message || 'החיבור לבקאנד נכשל'} (אם זה הריצה הראשונה — שרת Render ישן ולוקח 30-60 שניות להתעורר)`)
      setLoading(p => ({ ...p, [site]: false }))
    }
  }

  const syncAll = async () => {
    if (!ready) {
      setSyncResult('מסד הנתונים עדיין נטען. נסה שוב עוד רגע.')
      return
    }
    setSyncing(true); setSyncResult('')
    try {
      // Wake up Render server first (free tier sleeps after inactivity)
      setSyncResult('מעיר את השרת...')
      try {
        await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(60000) })
      } catch {}

      // Kick off the backend sync (still writes legacy Supabase tables —
      // fine for grades/etc., but we don't rely on it for courses).
      setSyncResult('מסנכרן נתונים מהאוניברסיטה...')
      const headers = await authHeaders()
      try {
        await fetch(`${BACKEND}/api/university/sync`, {
          method: 'POST',
          headers,
          signal: AbortSignal.timeout(120000),
        })
      } catch {
        // Even if the legacy sync endpoint fails we can still pull the live
        // course list below, so don't abort on it.
      }

      // Pull live course list and merge into the user's Drive DB.
      setSyncResult('מושך קורסים...')
      const coursesRes = await fetch(`${BACKEND}/api/university/courses`, {
        headers,
        signal: AbortSignal.timeout(60000),
      })
      if (!coursesRes.ok) {
        throw new Error(`Backend ${coursesRes.status}: ${await coursesRes.text().catch(() => '')}`)
      }
      const coursesData = await coursesRes.json()
      if (coursesData.status === 'error') {
        throw new Error(coursesData.message || 'הסנכרון נכשל')
      }
      const scraped: Array<{
        title: string
        url?: string
        moodle_id?: string
        shortname?: string
        startdate?: number | null
        enddate?: number | null
        category_name?: string
        // v2.1 enrichment — produced by backend's Moodle scraper (Tzvi #30).
        // All optional; the scraper may not find every field on every course.
        lecturer_email?: string | null
        syllabus_url?: string | null
        teaching_assistants?: Array<{ name: string; email?: string; role?: string }>
        course_links?: Array<{ label: string; url: string }>
        portal_metadata?: Record<string, unknown>
      }> = coursesData.courses || []

      // Match existing courses by source_url first, then by exact title.
      const byUrl = new Map<string, string>() // source_url → course.id
      const byTitle = new Map<string, string>() // title → course.id
      for (const c of db.courses) {
        if (c.source_url) byUrl.set(c.source_url, c.id)
        byTitle.set(c.title, c.id)
      }
      // Pull degree start from settings so we can compute year-of-study per course
      const degreeStart = (db.settings?.degree_start_year && db.settings?.degree_start_month)
        ? { year: db.settings.degree_start_year, month: db.settings.degree_start_month }
        : null

      let added = 0
      let updated = 0
      for (const c of scraped) {
        if (!c.title) continue

        // Classify semester + academic year from Moodle metadata
        const cls = classifyCourse({
          title: c.title,
          shortname: c.shortname,
          moodle_startdate: c.startdate,
          moodle_enddate: c.enddate,
        })
        const yearOfStudy = (degreeStart && cls.academic_year)
          ? computeYearOfStudy(degreeStart, parseInt(cls.academic_year, 10))
          : undefined

        // Find existing — prefer URL match, fall back to title.
        const existingId = (c.url && byUrl.get(c.url)) || byTitle.get(c.title)

        if (existingId) {
          // Update existing course with fresh metadata + classification.
          // Respect manual classification: don't overwrite semester/year if user set them.
          const existing = db.courses.find((x: any) => x.id === existingId)
          const isManual = existing?.classified_manually === true

          await updateCourse(existingId, {
            source: 'bgu',
            source_url: c.url || existing?.source_url,
            shortname: c.shortname,
            moodle_startdate: c.startdate || undefined,
            moodle_enddate: c.enddate || undefined,
            category_name: c.category_name,
            // v2.1 — only overwrite scraped fields when the scraper actually found
            // something. Empty arrays from the backend mean "scraped but found
            // nothing", which we treat the same as "found something" (it's the
            // freshest truth). Null/undefined means "didn't even check" — keep prior.
            ...(c.lecturer_email !== undefined ? { lecturer_email: c.lecturer_email ?? undefined } : {}),
            ...(c.syllabus_url !== undefined ? { syllabus_url: c.syllabus_url ?? undefined } : {}),
            ...(c.teaching_assistants !== undefined ? { teaching_assistants: c.teaching_assistants } : {}),
            ...(c.course_links !== undefined ? { course_links: c.course_links } : {}),
            ...(c.portal_metadata !== undefined ? { portal_metadata: c.portal_metadata } : {}),
            ...(isManual ? {} : {
              semester: cls.semester,
              academic_year: cls.academic_year,
              year_of_study: yearOfStudy,
            }),
          })
          updated++
        } else {
          await createCourse({
            title: c.title,
            source: 'bgu',
            source_url: c.url,
            description: c.moodle_id ? `Moodle ID: ${c.moodle_id}` : undefined,
            shortname: c.shortname,
            moodle_startdate: c.startdate || undefined,
            moodle_enddate: c.enddate || undefined,
            category_name: c.category_name,
            semester: cls.semester,
            academic_year: cls.academic_year,
            year_of_study: yearOfStudy,
            // v2.1 enrichment — see comment in updateCourse path above.
            lecturer_email: c.lecturer_email ?? undefined,
            syllabus_url: c.syllabus_url ?? undefined,
            teaching_assistants: c.teaching_assistants,
            course_links: c.course_links,
            portal_metadata: c.portal_metadata,
          })
          added++
        }
      }
      // Flush all the createCourse/updateCourse mutations from the loop
      // before we navigate. Without this, the 30s debounced save risks
      // losing the import if the user reloads / closes within the window.
      // One flush after the loop is much cheaper than flushing per-course.
      if (typeof flushSave === 'function') {
        try { await flushSave() } catch { /* surface via syncResult below */ }
      }
      const parts: string[] = []
      if (added > 0) parts.push(`${added} נוספו`)
      if (updated > 0) parts.push(`${updated} עודכנו`)
      if (parts.length === 0) parts.push('לא נמצאו שינויים')
      setSyncResult(`סנכרון הושלם: ${parts.join(', ')} (סה״כ נמשכו ${scraped.length}) ✓`)

      // If we actually pulled new courses, send the user to /courses so they
      // can confirm the import. 2s gives the success banner time to register.
      if (added > 0) {
        setTimeout(() => router.push('/courses'), 2000)
      }
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        setSyncResult('השרת לא הגיב — נסה שוב בעוד דקה')
      } else {
        console.error('[bgu-sync]', e)
        setSyncResult('שגיאה בסנכרון: ' + (e?.message || e))
      }
    } finally {
      setSyncing(false)
    }
  }

  const loginStatus = (site: string) => status.login_status?.[site] || 'idle'

  return (
    <div className="cream-page moodle-v2">
      <div className="moodle-v2-main animate-fade-in" dir="rtl">

        {/* Header */}
        <header className="moodle-v2-head">
          <div className="moodle-v2-head-icon">
            <GraduationCap size={24} />
          </div>
          <div>
            <h1>חיבור Moodle</h1>
            <p>התחבר ל-Moodle של {universityName}</p>
          </div>
        </header>

        {/* How it works — branches on real backend capability:
            - moodleConfigured: backend has MOODLE_URL set → legacy headless/extension flow can run.
            - !moodleConfigured: backend can't scrape → push user to the Chrome extension which IS deployed and works. */}
        <section className="moodle-v2-card moodle-v2-howto">
          <p className="moodle-v2-card-title">איך זה עובד?</p>

          {!lmsInfo.moodle.enabled ? (
            // Backend isn't configured for Moodle. Honest path forward.
            <div className="moodle-v2-howto-body">
              <div className="moodle-v2-banner amber">
                <strong>השרת לא מוגדר ל-Moodle של {universityName}.</strong><br />
                סנכרון אוטומטי מ-Moodle לא יעבוד עד שהגדרת ה-<code dir="ltr">MOODLE_URL</code> תעלה ב-Backend.
                <br />עד אז, השתמש ב-<strong>תוסף Chrome של TEEPO</strong> — הוא קורא ישירות מדפי Moodle שאתה פותח בדפדפן.
              </div>

              <ol className="moodle-v2-steps">
                <li>
                  <span className="moodle-v2-step-num">1</span>
                  <p>
                    צור קורס ראשון ב-<Link href="/courses/extract" className="moodle-v2-link">/courses/extract</Link>
                    {' '}או ידנית ב-<Link href="/courses" className="moodle-v2-link">/courses</Link>.
                  </p>
                </li>
                <li>
                  <span className="moodle-v2-step-num">2</span>
                  <p>
                    התקן את תוסף ה-Chrome של TEEPO לפי
                    {' '}<a
                      href="https://github.com/yarinlevin18-ai/TEEPO/blob/master/chrome-extension/README.md"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="moodle-v2-link"
                    >ההוראות ב-README</a> (5 דקות חד-פעמי — OAuth client + Load unpacked).
                  </p>
                </li>
                <li>
                  <span className="moodle-v2-step-num">3</span>
                  <p>
                    פתח דף קורס ב-Moodle של האוניברסיטה שלך (BGU / TAU) → לחץ אייקון TEEPO ב-toolbar.
                  </p>
                </li>
                <li>
                  <span className="moodle-v2-step-num">4</span>
                  <p>
                    בחר את הקורס מה-dropdown ולחץ <strong>&quot;שלח ל-TEEPO&quot;</strong> — הקבצים מועלים ישר ל-Drive שלך.
                  </p>
                </li>
                <li>
                  <span className="moodle-v2-step-num">5</span>
                  <p>
                    חזור ל-<Link href="/summaries" className="moodle-v2-link">/summaries</Link>
                    {' '}— הקבצים יופיעו תוך 30 שניות (polling אוטומטי).
                  </p>
                </li>
              </ol>

              <div className="moodle-v2-note">
                <span>🔒</span>
                <span>הקבצים זורמים <strong>ישירות מהדפדפן ל-Drive שלך</strong> — לא דרך השרת של TEEPO.</span>
              </div>
            </div>
          ) : serverMode ? (
            // Backend IS configured + server-mode (extension Session flow).
            <div className="moodle-v2-howto-body">
              <ol className="moodle-v2-steps">
                <li>
                  <span className="moodle-v2-step-num">1</span>
                  <p>לחץ <strong>&quot;התחבר&quot;</strong> — Moodle ייפתח בטאב חדש</p>
                </li>
                <li>
                  <span className="moodle-v2-step-num">2</span>
                  <p>התחבר ל-Moodle <strong>בדפדפן שלך כרגיל</strong></p>
                </li>
                <li>
                  <span className="moodle-v2-step-num">3</span>
                  <p>לחץ על <strong>אייקון התוסף 🎓</strong> בסרגל הדפדפן ← &quot;שלח Session&quot;</p>
                </li>
                <li>
                  <span className="moodle-v2-step-num">4</span>
                  <p>חזור לכאן ← <strong>סנכרן הכל</strong></p>
                </li>
              </ol>
              <div className="moodle-v2-note">
                <span>🔒</span>
                <span>הסיסמה שלך לא נוגעת באפליקציה — רק ה-session cookies מועברים</span>
              </div>
            </div>
          ) : (
            // Backend configured + headless flow (legacy local dev mode).
            <ol className="moodle-v2-steps simple">
              <li><span className="moodle-v2-step-num">1</span><p>לחץ &quot;התחבר&quot; וייפתח טופס שם משתמש/סיסמה של {universityName}.</p></li>
              <li><span className="moodle-v2-step-num">2</span><p>הbackend יתחבר ל-Moodle בשמך עם headless Chrome.</p></li>
              <li><span className="moodle-v2-step-num">3</span><p>אחרי שמופיע ✓ ירוק, לחץ &quot;סנכרן הכל&quot;.</p></li>
              <li><span className="moodle-v2-step-num">4</span><p>הקורסים, ציונים ומטלות יופיעו ב-/courses ו-/summaries.</p></li>
            </ol>
          )}
        </section>

        {/* Site cards */}
        <div className="moodle-v2-sites">
          {lmsInfo.moodle.enabled ? (
            <SiteCard site="moodle" name="Moodle" description="קורסים, מצגות, מטלות, הגשות"
              url={lmsInfo.moodle.host} externalUrl={lmsInfo.moodle.my_url || lmsInfo.moodle.url}
              connected={status.moodle} loginStatus={loginStatus('moodle')}
              loading={!!loading['moodle']} onConnect={c => connect('moodle', c)}
              icon={BookOpen} tone="emerald" serverMode={serverMode} />
          ) : (
            <section className="moodle-v2-card moodle-v2-disabled">
              Moodle לא מוגדר. הגדר את משתנה הסביבה <code dir="ltr">MOODLE_URL</code> ב-Backend כדי
              להפעיל את החיבור.
            </section>
          )}
          {lmsInfo.portal.enabled && (
            <SiteCard site="portal" name="פורטל הסטודנט" description="לוח שעות, רישום לקורסים, ציונים"
              url={lmsInfo.portal.host} externalUrl={lmsInfo.portal.url}
              connected={status.portal} loginStatus={loginStatus('portal')}
              loading={!!loading['portal']} onConnect={c => connect('portal', c)}
              icon={Calendar} tone="violet" serverMode={serverMode} />
          )}
        </div>

        {/* Sync button */}
        {(status.moodle || status.portal) && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="moodle-v2-card moodle-v2-sync"
          >
            <div className="moodle-v2-sync-head">
              <RefreshCw size={18} />
              <div>
                <p className="title">סנכרן את כל הנתונים</p>
                <p className="sub">מושך קורסים, מטלות ולוח שעות לאפליקציה</p>
              </div>
            </div>
            <button
              onClick={syncAll}
              disabled={syncing}
              className="moodle-v2-btn primary full"
            >
              {syncing ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
              {syncing ? 'מסנכרן...' : 'סנכרן הכל'}
            </button>
            {syncResult && (
              <p className={`moodle-v2-sync-result${syncResult.includes('שגיאה') ? ' error' : ' success'}`}>
                {syncResult}
              </p>
            )}
          </motion.section>
        )}
      </div>
    </div>
  )
}

function SiteCard({ site, name, description, url, externalUrl, connected, loginStatus: _loginStatus, loading,
  onConnect, icon: Icon, tone, serverMode }: {
  site: string; name: string; description: string; url: string; externalUrl: string
  connected: boolean; loginStatus: string; loading: boolean
  onConnect: (creds?: { username: string; password: string }) => void
  icon: React.ElementType; tone: 'emerald' | 'violet'; serverMode: boolean
}) {
  const [step, setStep] = useState<'idle' | 'waiting' | 'creds'>('idle')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleConnect = () => {
    if (serverMode && externalUrl) {
      // Open the real site in a new tab — user logs in there
      window.open(externalUrl, '_blank')
      setStep('waiting')
    } else {
      onConnect()
    }
  }

  const handleCredsSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) return
    onConnect({ username: username.trim(), password })
    // Clear password from state immediately after submit — it's already in flight.
    setPassword('')
  }

  // Reset step when connected
  useEffect(() => {
    if (connected) { setStep('idle'); setUsername(''); setPassword('') }
  }, [connected])

  return (
    <section className={`moodle-v2-card moodle-v2-site tone-${tone}${connected ? ' connected' : ''}`}>
      {/* Main row */}
      <div className="moodle-v2-site-row">
        <div className="moodle-v2-site-icon-wrap">
          <div className="moodle-v2-site-icon">
            <Icon size={20} />
          </div>
          <span className={`moodle-v2-site-dot${connected ? ' on' : ''}`} />
        </div>

        <div className="moodle-v2-site-info">
          <div className="moodle-v2-site-title">
            <p>{name}</p>
            {connected
              ? <span className="moodle-v2-site-pill on">
                  <CheckCircle size={12} /> מחובר
                </span>
              : <span className="moodle-v2-site-pill">
                  <WifiOff size={12} /> לא מחובר
                </span>
            }
          </div>
          <p className="moodle-v2-site-desc">{description}</p>
          <p className="moodle-v2-site-url" dir="ltr">{url}</p>
        </div>

        {!connected && (
          <div className="moodle-v2-site-actions">
            <button
              onClick={handleConnect}
              disabled={loading}
              className="moodle-v2-btn primary"
            >
              {loading ? <Loader2 size={14} className="spin" /> : <ExternalLink size={14} />}
              התחבר
            </button>
            {serverMode && site === 'moodle' && (
              <button
                onClick={() => setStep(step === 'creds' ? 'idle' : 'creds')}
                disabled={loading}
                className="moodle-v2-site-toggle"
              >
                {step === 'creds' ? 'ביטול' : 'נייד? התחבר עם סיסמה'}
              </button>
            )}
          </div>
        )}
        {connected && (
          <span className="moodle-v2-site-connected">מחובר ✓</span>
        )}
      </div>

      {/* Credentials form — for mobile or anyone without the Chrome extension */}
      <AnimatePresence>
        {step === 'creds' && !connected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="moodle-v2-site-expand"
          >
            <form onSubmit={handleCredsSubmit} className="moodle-v2-creds">
              <div className="moodle-v2-creds-note">
                <span>🔒</span>
                <span>
                  הפרטים נשלחים ב-HTTPS לשרת, משמשים פעם אחת לכניסה ל-Moodle
                  ולא נשמרים. רק ה-session cookies שמורים בשרת.
                </span>
              </div>
              <div className="moodle-v2-creds-field">
                <label htmlFor="moodle-username">שם משתמש Moodle</label>
                <input
                  id="moodle-username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="שם המשתמש שלך באוניברסיטה"
                  dir="ltr"
                  className="moodle-v2-input"
                  required
                />
              </div>
              <div className="moodle-v2-creds-field">
                <label htmlFor="moodle-password">סיסמה</label>
                <input
                  id="moodle-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  dir="ltr"
                  className="moodle-v2-input"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || !username.trim() || !password.trim()}
                className="moodle-v2-btn primary full"
              >
                {loading ? <Loader2 size={14} className="spin" /> : null}
                {loading ? 'מתחבר ל-Moodle...' : 'התחבר'}
              </button>
              <p className="moodle-v2-creds-foot">
                הכניסה headless — לוקחת 10-20 שניות
              </p>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Waiting step — show after opening the LMS site */}
      <AnimatePresence>
        {step === 'waiting' && !connected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="moodle-v2-site-expand"
          >
            <div className="moodle-v2-waiting">
              <div className="moodle-v2-waiting-step">
                <div className="moodle-v2-waiting-num">1</div>
                <p>
                  התחבר ל-{name} בטאב שנפתח עם שם המשתמש והסיסמה שלך
                </p>
              </div>

              <div className="moodle-v2-waiting-step">
                <div className="moodle-v2-waiting-num">2</div>
                <div>
                  <p>
                    לחץ על אייקון התוסף <span className="moodle-v2-emoji">🎓</span> בסרגל הדפדפן
                  </p>
                  <p className="sub">
                    לא רואה אותו? לחץ על <Puzzle size={11} className="inline" /> ← אתר את TEEPO Study Organizer ← נעץ אותו
                  </p>
                </div>
              </div>

              <div className="moodle-v2-waiting-step">
                <div className="moodle-v2-waiting-num">3</div>
                <p>
                  לחץ <strong>&quot;שלח Session ל-App&quot;</strong> בתוסף — הסטטוס ישתנה לירוק
                </p>
              </div>

              <div className="moodle-v2-waiting-pending">
                <Loader2 size={13} className="spin" />
                <p>ממתין לחיבור...</p>
                <button
                  onClick={() => setStep('idle')}
                  className="moodle-v2-waiting-cancel"
                >
                  ביטול
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
