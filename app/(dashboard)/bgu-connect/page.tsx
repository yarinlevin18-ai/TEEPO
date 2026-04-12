'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  GraduationCap, Wifi, WifiOff, RefreshCw,
  CheckCircle, Loader2, BookOpen, Calendar, FileText,
} from 'lucide-react'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

type SiteStatus = { connected: boolean; login_status: string }
type Status = { moodle: boolean; portal: boolean; login_status: Record<string, string> }

export default function BGUConnectPage() {
  const [status, setStatus] = useState<Status>({ moodle: false, portal: false, login_status: {} })
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<string>('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${BACKEND}/api/bgu/status`)
      const data = await res.json()
      setStatus(data)
    } catch {}
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 5000)
    return () => clearInterval(interval)
  }, [])

  const connect = async (site: 'moodle' | 'portal') => {
    setLoading((p) => ({ ...p, [site]: true }))
    try {
      await fetch(`${BACKEND}/api/bgu/connect/${site}`, { method: 'POST' })

      // Poll until connected or failed
      pollRef.current = setInterval(async () => {
        const res = await fetch(`${BACKEND}/api/bgu/connect/${site}/poll`)
        const data = await res.json()
        if (data.connected || data.status === 'failed') {
          clearInterval(pollRef.current!)
          setLoading((p) => ({ ...p, [site]: false }))
          fetchStatus()
        }
      }, 2000)
    } catch {
      setLoading((p) => ({ ...p, [site]: false }))
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
        <p>1. לחץ "התחבר" — ייפתח דפדפן Chrome</p>
        <p>2. התחבר עם פרטי הסטודנט שלך כרגיל</p>
        <p>3. הדפדפן ייסגר אוטומטית וה-session נשמר</p>
        <p>4. לחץ "סנכרן הכל" — הקורסים והמטלות יופיעו באפליקציה</p>
      </div>

      {/* Site cards */}
      <div className="grid gap-4">
        <SiteCard
          name="Moodle"
          description="קורסים, מצגות, מטלות, הגשות"
          url="moodle.bgu.ac.il"
          connected={status.moodle}
          loginStatus={loginStatus('moodle')}
          loading={!!loading['moodle']}
          onConnect={() => connect('moodle')}
          icon={BookOpen}
          color="green"
        />
        <SiteCard
          name="פורטל הסטודנט"
          description="לוח שעות, רישום לקורסים, ציונים"
          url="my.bgu.ac.il"
          connected={status.portal}
          loginStatus={loginStatus('portal')}
          loading={!!loading['portal']}
          onConnect={() => connect('portal')}
          icon={Calendar}
          color="purple"
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
  name, description, url, connected, loginStatus, loading,
  onConnect, icon: Icon, color,
}: {
  name: string; description: string; url: string
  connected: boolean; loginStatus: string; loading: boolean
  onConnect: () => void; icon: React.ElementType; color: string
}) {
  const colorMap: Record<string, string> = {
    green: 'bg-green-50 text-green-600 border-green-200',
    purple: 'bg-purple-50 text-purple-600 border-purple-200',
  }
  const iconBg: Record<string, string> = {
    green: 'bg-green-100 text-green-600',
    purple: 'bg-purple-100 text-purple-600',
  }

  const statusLabel: Record<string, string> = {
    idle: '',
    opening: 'פותח דפדפן Chrome...',
    waiting_for_login: '⏳ התחבר בדפדפן שנפתח — ממתין (עד 5 דקות)...',
    connected: 'מחובר',
    failed: 'ההתחברות נכשלה — נסה שוב',
  }

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 ${connected ? 'border-green-300' : 'border-surface-200'}`}>
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${iconBg[color]}`}>
          <Icon size={22} />
        </div>
        <div className="flex-1">
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
          onClick={onConnect}
          disabled={loading || connected}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            connected
              ? 'bg-surface-100 text-slate-400 cursor-default'
              : 'bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50'
          }`}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : connected ? 'מחובר ✓' : 'התחבר'}
        </button>
      </div>
    </div>
  )
}
