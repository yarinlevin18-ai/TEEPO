'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GraduationCap, WifiOff, RefreshCw,
  CheckCircle, Loader2, BookOpen, Calendar, Eye, EyeOff, Lock, User,
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
            <p className="text-ink-muted">1. לחץ "התחבר" והזן מ.א. + סיסמה של BGU</p>
            <p className="text-ink-muted">2. הכניסה מתבצעת בשרת — הפרטים לא נשמרים</p>
            <p className="text-ink-muted">3. לחץ "סנכרן הכל" לייבוא קורסים ומטלות</p>
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

  const isFailed = loginStatus === 'failed'
  const isConnecting = loginStatus === 'waiting_for_login' || loginStatus === 'opening'

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    setShowForm(false)
    onConnect(serverMode ? { username, password } : undefined)
  }

  const handleConnectClick = () => {
    if (serverMode) {
      setShowForm(true)
    } else {
      onConnect()
    }
  }

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
          {isConnecting && (
            <p className="text-xs mt-1 flex items-center gap-1 text-amber-400">
              <Loader2 size={10} className="animate-spin" /> מתחבר לשרת...
            </p>
          )}
          {isFailed && !showForm && (
            <p className="text-xs mt-1 text-red-400 cursor-pointer hover:text-red-300"
               onClick={() => setShowForm(true)}>
              ההתחברות נכשלה — <span className="underline">נסה שוב</span>
            </p>
          )}
        </div>

        <button
          onClick={connected ? undefined : handleConnectClick}
          disabled={loading || connected || isConnecting}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex-shrink-0 ${
            connected ? 'text-ink-muted cursor-default'
            : isConnecting ? 'opacity-50 cursor-wait'
            : 'btn-gradient shadow-glow-sm hover:opacity-90'
          }`}
          style={connected ? { background: 'rgba(255,255,255,0.05)' } : {}}
        >
          {loading || isConnecting
            ? <Loader2 size={14} className="animate-spin" />
            : connected ? 'מחובר ✓' : 'התחבר'}
        </button>
      </div>

      {/* Inline credentials form — slides in for server mode */}
      <AnimatePresence>
        {showForm && !connected && (
          <motion.form
            onSubmit={handleSubmit}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-3 border-t"
                 style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-medium text-ink-muted pt-1">פרטי הכניסה ל-BGU</p>

              {/* Username */}
              <div className="relative">
                <User size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                <input
                  type="text"
                  placeholder="מ.א. BGU / אימייל / שם משתמש"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                  className="w-full input-dark pr-9 py-2.5 text-sm"
                />
              </div>

              {/* Password */}
              <div className="relative">
                <Lock size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="סיסמה"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full input-dark pr-9 pl-10 py-2.5 text-sm"
                />
                <button type="button" onClick={() => setShowPass(p => !p)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors">
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); setUsername(''); setPassword('') }}
                  className="flex-1 py-2 rounded-xl text-sm text-ink-muted transition-colors hover:text-ink"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={!username || !password}
                  className="flex-2 flex-grow py-2 rounded-xl text-sm font-medium btn-gradient shadow-glow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  כניסה
                </button>
              </div>

              <p className="text-xs text-ink-muted text-center">
                🔒 הפרטים נשלחים ישירות לשרת BGU בלבד
              </p>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}
