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
    // Detect server vs local mode
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
    setSyncing(true)
    setSyncResult('')
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
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shadow-md">
          <GraduationCap size={26} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">חיבור BGU</h1>
          <p className="text-slate-500 text-sm">התחבר לאתרי אוניברסיטת בן-גוריון</p>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-sm text-blue-700 space-y-1">
        <p className="font-semibold">איך זה עובד?</p>
        {serverMode ? (
          <>
            <p>1. הזן את פרטי הכניסה שלך ל-BGU</p>
            <p>2. הפרטים משמשים רק לכניסה חד-פעמית — לא נשמרים</p>
            <p>3. ה-session נשמר בצורה מאובטחת</p>
            <p>4. לחץ "סנכרן הכל" לייבוא קורסים ומטלות</p>
          </>
        ) : (
          <>
            <p>1. לחץ "התחבר" — ייפתח חלון Chrome נפרד</p>
            <p>2. התחבר עם פרטי הסטודנט שלך כרגיל</p>
            <p>3. החלון ייסגר אוטומטית וה-session נשמר</p>
            <p>4. לחץ "סנכרן הכל" — הקורסים והמטלות יופיעו באפליקציה</p>
          </>
        )}
      </div>

      {/* Site cards */}
      <div className="grid gap-4">
        <SiteCard
          site="moodle"
          name="Moodle"
          description="קורסים, מצגות, מטלות, הגשות"
          url="moodle.bgu.ac.il"
          connected={status.moodle}
          loginStatus={loginStatus('moodle')}
          loading={!!loading['moodle']}
          onConnect={(creds) => connect('moodle', creds)}
          icon={BookOpen}
          color="green"
          serverMode={serverMode}
        />
        <SiteCard
          site="portal"
          name="פורטל הסטודנט"
          description="לוח שעות, רישום לקורסים, ציונים"
          url="my.bgu.ac.il"
          connected={status.portal}
          loginStatus={loginStatus('portal')}
          loading={!!loading['portal']}
          onConnect={(creds) => connect('portal', creds)}
          icon={Calendar}
          color="purple"
          serverMode={serverMode}
        />
      </div>

      {/* Sync button */}
      {(status.moodle || status.portal) && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-surface-200 shadow-sm p-6 space-y-4"
        >
          <div className="flex items-center gap-3">
            <RefreshCw size={20} className="text-primary-500" />
            <div>
              <p className="font-semibold text-slate-800">סנכרן את כל הנתונים</p>
              <p className="text-xs text-slate-400">מושך קורסים, מטלות ולוח שעות לאפליקציה</p>
            </div>
          </div>
          <button
            onClick={syncAll}
            disabled={syncing}
            className="w-full flex items-center justify-center gap-2 py-3 bg-primary-500 text-white rounded-xl font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {syncing ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            {syncing ? 'מסנכרן...' : 'סנכרן הכל'}
          </button>
          {syncResult && (
            <p className={`text-sm text-center ${syncResult.includes('שגיאה') ? 'text-red-500' : 'text-green-600'}`}>
              {syncResult}
            </p>
          )}
        </motion.div>
      )}
    </div>
  )
}

function SiteCard({
  site, name, description, url, connected, loginStatus, loading,
  onConnect, icon: Icon, color, serverMode,
}: {
  site: string; name: string; description: string; url: string
  connected: boolean; loginStatus: string; loading: boolean
  onConnect: (creds?: { username: string; password: string }) => void
  icon: React.ElementType; color: string; serverMode: boolean
}) {
  const [showForm, setShowForm] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  const iconBg: Record<string, string> = {
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
  }

  const statusLabel: Record<string, string> = {
    idle: '',
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
      setPassword('')
      setShowForm(false)
    } else {
      onConnect()
    }
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${connected ? 'border-green-300' : 'border-surface-200'}`}>
      <div className="flex items-center gap-4 p-5">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg[color]}`}>
          <Icon size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-800">{name}</p>
            {connected
              ? <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle size={13} /> מחובר</span>
              : <span className="flex items-center gap-1 text-xs text-slate-400"><WifiOff size={13} /> לא מחובר</span>
            }
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
          <p className="text-xs text-slate-300 mt-0.5" dir="ltr">{url}</p>
          {loginStatus && statusLabel[loginStatus] && (
            <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" />
              {statusLabel[loginStatus]}
            </p>
          )}
        </div>
        <button
          onClick={handleConnect}
          disabled={loading || connected}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex-shrink-0 ${
            connected
              ? 'bg-surface-100 text-slate-400 cursor-default'
              : 'bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50'
          }`}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : connected ? 'מחובר ✓' : 'התחבר'}
        </button>
      </div>

      {/* Credentials form (server mode only) */}
      <AnimatePresence>
        {showForm && !connected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-surface-100 overflow-hidden"
          >
            <div className="p-5 space-y-3">
              <p className="text-xs text-slate-500">פרטי הכניסה ל-BGU (שם משתמש + סיסמה)</p>
              <input
                type="text"
                placeholder="שם משתמש (מ.א. / אימייל BGU)"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:border-primary-400"
                dir="ltr"
              />
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="סיסמה"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 text-sm focus:outline-none focus:border-primary-400 pr-10"
                  dir="ltr"
                  onKeyDown={e => e.key === 'Enter' && handleConnect()}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(p => !p)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleConnect}
                  disabled={!username || !password || loading}
                  className="flex-1 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {loading ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'כניסה'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:bg-surface-100 transition-colors"
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
