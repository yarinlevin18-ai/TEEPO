'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, Wifi, WifiOff, RefreshCw,
  CheckCircle, Loader2, BookOpen, Calendar, Eye, EyeOff,
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
      const res = await fetch(`${BACKEND}/api/bgu/status`)
      setStatus(await res.json())
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
      const res = await fetch(`${BACKEND}/api/bgu/sync`, { method: 'POST' })
      const data = await res.json()
      setSyncResult(data.message || 'הסנכרון הושלם')
    } catch (e: any) {
      setSyncResult('שגיאה בסנכרון: ' + e.message)
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
      <div className="glass p-5 text-sm space-y-1.5" style={{ borderColor: 'rgba(99,102,241,0.2)' }}>
        <p className="font-semibold gradient-text">איך זה עובד?</p>
        {serverMode ? (
          <>
            <p className="text-ink-muted">1. הזן את פרטי הכניסה שלך ל-BGU</p>
            <p className="text-ink-muted">2. הפרטים משמשים רק לכניסה חד-פעמית — לא נשמרים</p>
            <p className="text-ink-muted">3. ה-session נשמר בצורה מאובטחת</p>
            <p className="text-ink-muted">4. לחץ "סנכרן הכל" לייבוא קורסים ומטלות</p>
          </>
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

function SiteCard({ site, name, description, url, connected, loginStatus, loading,
  onConnect, icon: Icon, color, serverMode }: {
  site: string; name: string; description: string; url: string
  connected: boolean; loginStatus: string; loading: boolean
  onConnect: (creds?: { username: string; password: string }) => void
  icon: React.ElementType; color: string; serverMode: boolean
}) {
  const [showForm, setShowForm] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  const statusLabel: Record<string, string> = {
    opening: 'פותח דפדפן Chrome...',
    waiting_for_login: '⏳ ממתין לכניסה...',
    connected: 'מחובר',
    failed: 'ההתחברות נכשלה — נסה שוב',
  }

  const handleConnect = () => {
    if (serverMode) {
      if (!showForm) { setShowForm(true); return }
      if (!username || !password) return
      onConnect({ username, password })
      setPassword(''); setShowForm(false)
    } else {
      onConnect()
    }
  }

  return (
    <div
      className="glass overflow-hidden transition-all"
      style={connected ? { boxShadow: `0 0 20px ${color}33`, borderColor: `${color}44` } : {}}
    >
      <div className="flex items-center gap-4 p-5">
        {/* Status dot */}
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
          {loginStatus && statusLabel[loginStatus] && (
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: '#f59e0b' }}>
              <Loader2 size={10} className="animate-spin" />
              {statusLabel[loginStatus]}
            </p>
          )}
        </div>

        <button
          onClick={handleConnect}
          disabled={loading || connected}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 ${
            connected
              ? 'text-ink-muted cursor-default'
              : 'btn-gradient shadow-glow-sm'
          }`}
          style={connected ? { background: 'rgba(255,255,255,0.05)' } : {}}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : connected ? 'מחובר ✓' : 'התחבר'}
        </button>
      </div>

      {/* Credentials form */}
      <AnimatePresence>
        {showForm && !connected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 space-y-3 border-t border-white/5">
              <p className="text-xs text-ink-muted">פרטי הכניסה ל-BGU</p>
              <input
                type="text"
                placeholder="שם משתמש (מ.א. / אימייל BGU)"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-dark"
                dir="ltr"
              />
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="סיסמה"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-dark pr-10"
                  dir="ltr"
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConnect}
                  disabled={!username || !password || loading}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium btn-gradient disabled:opacity-50"
                >
                  {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'כניסה'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-xl text-sm text-ink-muted transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
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
