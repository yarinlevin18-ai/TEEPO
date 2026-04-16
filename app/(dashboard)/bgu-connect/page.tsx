'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, WifiOff, RefreshCw,
  CheckCircle, Loader2, BookOpen, Calendar, ExternalLink, Puzzle,
} from 'lucide-react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

type Status = { moodle: boolean; portal: boolean; login_status: Record<string, string> }

export default function BGUConnectPage() {
  const [status, setStatus] = useState<Status>({ moodle: false, portal: false, login_status: {} })
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState('')
  const [serverMode, setServerMode] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/bgu/status`, { signal: AbortSignal.timeout(10000) })
      if (res.ok) setStatus(await res.json())
    } catch {}
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    fetch(`${BACKEND}/api/bgu/mode`)
      .then(r => r.json())
      .then(d => setServerMode(d.server_mode))
      .catch(() => {})
    return () => clearInterval(interval)
  }, [])

  const connect = async (site: 'moodle' | 'portal', creds?: { username: string; password: string }) => {
    setLoading(p => ({ ...p, [site]: true }))
    try {
      await fetch(`${BACKEND}/api/bgu/connect/${site}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds || {}),
      })
      pollRef.current = setInterval(async () => {
        const res = await fetch(`${BACKEND}/api/bgu/connect/${site}/poll`)
        const data = await res.json()
        if (data.connected || data.status === 'failed') {
          clearInterval(pollRef.current!)
          setLoading(p => ({ ...p, [site]: false }))
          fetchStatus()
        }
      }, 2000)
    } catch {
      setLoading(p => ({ ...p, [site]: false }))
    }
  }

  const syncAll = async () => {
    setSyncing(true); setSyncResult('')
    try {
      // Wake up Render server first (free tier sleeps after inactivity)
      setSyncResult('מעיר את השרת...')
      try {
        await fetch(`${BACKEND}/health`, { signal: AbortSignal.timeout(60000) })
      } catch {}

      setSyncResult('מסנכרן נתונים...')
      const res = await fetch(`${BACKEND}/api/bgu/sync`, {
        method: 'POST',
        signal: AbortSignal.timeout(120000), // 2 min for full sync
      })
      const data = await res.json()
      setSyncResult(data.message || 'הסנכרון הושלם ✓')
    } catch (e: any) {
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        setSyncResult('השרת לא הגיב — נסה שוב בעוד דקה')
      } else {
        setSyncResult('שגיאה בסנכרון: ' + e.message)
      }
    } finally {
      setSyncing(false)
    }
  }

  const loginStatus = (site: string) => status.login_status?.[site] || 'idle'

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8 animate-fade-in">

      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-glow-sm"
             style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
          <GraduationCap size={24} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-ink">חיבור BGU</h1>
          <p className="text-ink-muted text-sm">התחבר לאתרי אוניברסיטת בן-גוריון</p>
        </div>
      </div>

      {/* How it works */}
      <div className="glass p-5 text-sm space-y-2" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
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

      {/* Site cards */}
      <div className="grid gap-4">
        <SiteCard site="moodle" name="Moodle" description="קורסים, מצגות, מטלות, הגשות"
          url="moodle.bgu.ac.il" connected={status.moodle} loginStatus={loginStatus('moodle')}
          loading={!!loading['moodle']} onConnect={c => connect('moodle', c)}
          icon={BookOpen} color="#10b981" serverMode={serverMode} />
        <SiteCard site="portal" name="פורטל הסטודנט" description="לוח שעות, רישום לקורסים, ציונים"
          url="my.bgu.ac.il" connected={status.portal} loginStatus={loginStatus('portal')}
          loading={!!loading['portal']} onConnect={c => connect('portal', c)}
          icon={Calendar} color="#8b5cf6" serverMode={serverMode} />
      </div>

      {/* Sync button */}
      {(status.moodle || status.portal) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass p-6 space-y-4"
        >
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
        </motion.div>
      )}
    </div>
  )
}

const SITE_URLS: Record<string, string> = {
  moodle: 'https://moodle.bgu.ac.il/moodle/my/',
  portal: 'https://my.bgu.ac.il/',
}

function SiteCard({ site, name, description, url, connected, loginStatus, loading,
  onConnect, icon: Icon, color, serverMode }: {
  site: string; name: string; description: string; url: string
  connected: boolean; loginStatus: string; loading: boolean
  onConnect: (creds?: { username: string; password: string }) => void
  icon: React.ElementType; color: string; serverMode: boolean
}) {
  const [step, setStep] = useState<'idle' | 'waiting'>('idle')

  const handleConnect = () => {
    if (serverMode) {
      // Open the real site in a new tab — user logs in there
      window.open(SITE_URLS[site], '_blank')
      setStep('waiting')
    } else {
      onConnect()
    }
  }

  // Reset step when connected
  useEffect(() => {
    if (connected) setStep('idle')
  }, [connected])

  return (
    <div
      className="glass overflow-hidden transition-all duration-300"
      style={connected ? { boxShadow: `0 0 24px ${color}33`, borderColor: `${color}55` } : {}}
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
          <button
            onClick={handleConnect}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 btn-gradient shadow-glow-sm flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
            התחבר
          </button>
        )}
        {connected && (
          <span className="px-4 py-2 rounded-xl text-sm flex-shrink-0 text-ink-muted"
                style={{ background: 'rgba(255,255,255,0.05)' }}>
            מחובר ✓
          </span>
        )}
      </div>

      {/* Waiting step — show after opening BGU site */}
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
                    לא רואה אותו? לחץ על <Puzzle size={11} className="inline" /> ← אתר את BGU Study Organizer ← נעץ אותו
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
    </div>
  )
}
