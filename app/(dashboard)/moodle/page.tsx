'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, WifiOff, RefreshCw,
  CheckCircle, Loader2, BookOpen, Calendar, ExternalLink, Puzzle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import GlowCard from '@/components/ui/GlowCard'
import { useDB } from '@/lib/db-context'
import { classifyCourse, computeYearOfStudy } from '@/lib/semester-classifier'
import { useUniversityName } from '@/lib/use-university'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

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
  const { db, ready, createCourse, updateCourse } = useDB()
  const universityName = useUniversityName()
  const [status, setStatus] = useState<Status>({ moodle: false, portal: false, login_status: {} })
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')
  const [serverMode, setServerMode] = useState(false)
  const [lmsInfo, setLmsInfo] = useState<LmsInfo>(EMPTY_INFO)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
          const existing = db.courses.find(x => x.id === existingId)
          const isManual = existing?.classified_manually === true

          await updateCourse(existingId, {
            source: 'bgu',
            source_url: c.url || existing?.source_url,
            shortname: c.shortname,
            moodle_startdate: c.startdate || undefined,
            moodle_enddate: c.enddate || undefined,
            category_name: c.category_name,
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
          })
          added++
        }
      }
      const parts: string[] = []
      if (added > 0) parts.push(`${added} נוספו`)
      if (updated > 0) parts.push(`${updated} עודכנו`)
      if (parts.length === 0) parts.push('לא נמצאו שינויים')
      setSyncResult(`סנכרון הושלם: ${parts.join(', ')} (סה״כ נמשכו ${scraped.length}) ✓`)
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
    <div className="p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-glow-sm"
             style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          <GraduationCap size={24} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">חיבור Moodle</h1>
          <p className="text-ink-muted text-sm">התחבר ל-Moodle של {universityName}</p>
        </div>
      </div>

      {/* How it works */}
      <GlowCard glowColor="rgba(99,102,241,0.10)">
      <div className="p-5 text-sm space-y-2">
        <p className="font-semibold gradient-text mb-3">איך זה עובד?</p>
        {serverMode ? (
          <div className="space-y-2.5">
            <div className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(99,102,241,0.3)', color: '#a5b4fc' }}>1</span>
              <p className="text-ink-muted">לחץ <strong className="text-ink">"התחבר"</strong> — Moodle ייפתח בטאב חדש</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(99,102,241,0.3)', color: '#a5b4fc' }}>2</span>
              <p className="text-ink-muted">התחבר ל-Moodle <strong className="text-ink">בדפדפן שלך כרגיל</strong></p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(99,102,241,0.3)', color: '#a5b4fc' }}>3</span>
              <p className="text-ink-muted">לחץ על <strong className="text-ink">אייקון התוסף 🎓</strong> בסרגל הדפדפן ← "שלח Session"</p>
            </div>
            <div className="flex items-start gap-3">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                    style={{ background: 'rgba(99,102,241,0.3)', color: '#a5b4fc' }}>4</span>
              <p className="text-ink-muted">חזור לכאן ← <strong className="text-ink">סנכרן הכל</strong></p>
            </div>
            <div className="mt-3 pt-3 flex items-center gap-2 text-xs"
                 style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: '#10b981' }}>
              <span>🔒</span>
              <span>הסיסמה שלך לא נגעת באפליקציה — רק ה-session cookies מועברים</span>
            </div>
            <div className="pt-2 text-xs" style={{ color: '#a5b4fc' }}>
              📱 <strong>מחובר מהטלפון?</strong> לחץ "נייד? התחבר עם סיסמה" למטה — השרת מתחבר ל-Moodle לבד עם הפרטים שלך
            </div>
          </div>
        ) : (
          <>
            <p className="text-ink-muted">1. לחץ "התחבר" — ייפתח חלון Chrome נפרד</p>
            <p className="text-ink-muted">2. התחבר עם פרטי הסטודנט שלך כרגיל</p>
            <p className="text-ink-muted">3. החלון ייסגר אוטומטית וה-session נשמר</p>
            <p className="text-ink-muted">4. לחץ "סנכרן הכל" — הקורסים והמטלות יופיעו באפליקציה</p>
          </>
        )}
      </div>
      </GlowCard>

      {/* Site cards */}
      <div className="grid gap-4">
        {lmsInfo.moodle.enabled ? (
          <SiteCard site="moodle" name="Moodle" description="קורסים, מצגות, מטלות, הגשות"
            url={lmsInfo.moodle.host} externalUrl={lmsInfo.moodle.my_url || lmsInfo.moodle.url}
            connected={status.moodle} loginStatus={loginStatus('moodle')}
            loading={!!loading['moodle']} onConnect={c => connect('moodle', c)}
            icon={BookOpen} color="#10b981" serverMode={serverMode} />
        ) : (
          <GlowCard>
            <div className="p-5 text-sm text-ink-muted">
              Moodle לא מוגדר. הגדר את משתנה הסביבה <code dir="ltr">MOODLE_URL</code> ב-Backend כדי
              להפעיל את החיבור.
            </div>
          </GlowCard>
        )}
        {lmsInfo.portal.enabled && (
          <SiteCard site="portal" name="פורטל הסטודנט" description="לוח שעות, רישום לקורסים, ציונים"
            url={lmsInfo.portal.host} externalUrl={lmsInfo.portal.url}
            connected={status.portal} loginStatus={loginStatus('portal')}
            loading={!!loading['portal']} onConnect={c => connect('portal', c)}
            icon={Calendar} color="#8b5cf6" serverMode={serverMode} />
        )}
      </div>

      {/* Sync button */}
      {(status.moodle || status.portal) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlowCard glowColor="rgba(99,102,241,0.10)">
          <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <RefreshCw size={18} style={{ color: '#818cf8' }} />
            <div>
              <p className="font-semibold text-ink">סנכרן את כל הנתונים</p>
              <p className="text-xs text-ink-muted">מושך קורסים, מטלות ולוח שעות לאפליקציה</p>
            </div>
          </div>
          <button
            onClick={syncAll}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium disabled:opacity-50 transition-all btn-gradient shadow-glow-sm"
          >
            {syncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {syncing ? 'מסנכרן...' : 'סנכרן הכל'}
          </button>
          {syncResult && (
            <p className={`text-sm text-center ${syncResult.includes('שגיאה') ? 'text-red-400' : 'text-emerald-400'}`}>
              {syncResult}
            </p>
          )}
          </div>
          </GlowCard>
        </motion.div>
      )}
    </div>
  )
}

function SiteCard({ site, name, description, url, externalUrl, connected, loginStatus, loading,
  onConnect, icon: Icon, color, serverMode }: {
  site: string; name: string; description: string; url: string; externalUrl: string
  connected: boolean; loginStatus: string; loading: boolean
  onConnect: (creds?: { username: string; password: string }) => void
  icon: React.ElementType; color: string; serverMode: boolean
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
    <GlowCard
      className="transition-all duration-300"
      glowColor={connected ? 'rgba(16,185,129,0.10)' : undefined}
      style={connected ? { boxShadow: `0 0 24px ${color}33` } : {}}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 p-5">
        <div className="relative flex-shrink-0">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center"
               style={{ background: `${color}18` }}>
            <Icon size={20} style={{ color }} />
          </div>
          <div className={`pulse-dot absolute -top-1 -right-1 ${connected ? 'green' : 'gray'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-ink">{name}</p>
            {connected
              ? <span className="flex items-center gap-1 text-xs" style={{ color: '#10b981' }}>
                  <CheckCircle size={12} /> מחובר
                </span>
              : <span className="flex items-center gap-1 text-xs text-ink-muted">
                  <WifiOff size={12} /> לא מחובר
                </span>
            }
          </div>
          <p className="text-xs text-ink-muted mt-0.5">{description}</p>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }} dir="ltr">{url}</p>
        </div>

        {!connected && (
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            <button
              onClick={handleConnect}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all btn-gradient shadow-glow-sm flex items-center justify-center gap-1.5"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
              התחבר
            </button>
            {serverMode && site === 'moodle' && (
              <button
                onClick={() => setStep(step === 'creds' ? 'idle' : 'creds')}
                disabled={loading}
                className="text-xs text-ink-muted hover:text-ink underline transition-colors"
              >
                {step === 'creds' ? 'ביטול' : 'נייד? התחבר עם סיסמה'}
              </button>
            )}
          </div>
        )}
        {connected && (
          <span className="px-4 py-2 rounded-xl text-sm flex-shrink-0 text-ink-muted"
                style={{ background: 'rgba(255,255,255,0.05)' }}>
            מחובר ✓
          </span>
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
            className="overflow-hidden"
          >
            <form
              onSubmit={handleCredsSubmit}
              className="px-5 pb-5 pt-4 space-y-3 border-t"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
            >
              <div className="flex items-start gap-2 text-xs text-ink-muted">
                <span>🔒</span>
                <span>
                  הפרטים נשלחים ב-HTTPS לשרת, משמשים פעם אחת לכניסה ל-Moodle
                  ולא נשמרים. רק ה-session cookies שמורים בשרת.
                </span>
              </div>
              <div>
                <label className="text-xs text-ink-muted block mb-1">שם משתמש Moodle</label>
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="שם המשתמש שלך באוניברסיטה"
                  dir="ltr"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 text-ink"
                  required
                />
              </div>
              <div>
                <label className="text-xs text-ink-muted block mb-1">סיסמה</label>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  dir="ltr"
                  className="w-full px-3 py-2 rounded-lg text-sm bg-white/5 border border-white/10 focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 text-ink"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || !username.trim() || !password.trim()}
                className="w-full py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 transition-all btn-gradient shadow-glow-sm flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                {loading ? 'מתחבר ל-Moodle...' : 'התחבר'}
              </button>
              <p className="text-xs text-ink-muted text-center">
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
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-3 border-t"
                 style={{ borderColor: 'rgba(255,255,255,0.06)' }}>

              <div className="flex items-start gap-3 pt-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                     style={{ background: 'rgba(99,102,241,0.2)' }}>
                  <span className="text-sm">1</span>
                </div>
                <p className="text-sm text-ink-muted pt-1">
                  התחבר ל-{name} בטאב שנפתח עם שם המשתמש והסיסמה שלך
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                     style={{ background: 'rgba(99,102,241,0.2)' }}>
                  <span className="text-sm">2</span>
                </div>
                <div className="pt-1">
                  <p className="text-sm text-ink-muted">
                    לחץ על אייקון התוסף <span className="text-lg">🎓</span> בסרגל הדפדפן
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    לא רואה אותו? לחץ על <Puzzle size={11} className="inline" /> ← אתר את TEEPO Study Organizer ← נעץ אותו
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                     style={{ background: 'rgba(99,102,241,0.2)' }}>
                  <span className="text-sm">3</span>
                </div>
                <p className="text-sm text-ink-muted pt-1">
                  לחץ <strong className="text-ink">"שלח Session ל-App"</strong> בתוסף — הסטטוס ישתנה לירוק
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Loader2 size={13} className="animate-spin text-ink-muted" />
                <p className="text-xs text-ink-muted">ממתין לחיבור...</p>
                <button onClick={() => setStep('idle')}
                        className="mr-auto text-xs text-ink-muted hover:text-ink underline">
                  ביטול
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlowCard>
  )
}
