'use client'

/**
 * Auth page — Google-only sign-in, TEEPO themed.
 * Required scopes (calendar.readonly + drive.file) are requested here,
 * because the app stores the user's data in their own Google Drive.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Loader2, ArrowLeft, Cloud, Calendar, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import Teepo, { type TeepoState } from '@/components/Teepo'
import LandingBackground from '@/components/LandingBackground'

export default function AuthPage() {
  const router = useRouter()
  const { user, loading: authLoading, signInWithGoogle } = useAuth()

  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')
  const [teepoState, setTeepoState] = useState<TeepoState>('idle')

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      setTeepoState('happy')
      const t = setTimeout(() => router.replace('/dashboard'), 400)
      return () => clearTimeout(t)
    }
  }, [user, authLoading, router])

  // Idle → happy peek every ~6s so the mascot feels alive
  useEffect(() => {
    if (googleLoading || error) return
    const interval = setInterval(() => {
      setTeepoState((s) => (s === 'idle' ? 'happy' : 'idle'))
    }, 6000)
    return () => clearInterval(interval)
  }, [googleLoading, error])

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    setTeepoState('thinking')
    const { error } = await signInWithGoogle()
    if (error) {
      setError(error)
      setTeepoState('error')
      setGoogleLoading(false)
      setTimeout(() => setTeepoState('sassy'), 1600)
    }
    // On success → Supabase redirects to /dashboard
  }

  return (
    <div
      className="min-h-screen text-white relative"
      dir="rtl"
      style={{ background: 'linear-gradient(180deg, #07070D, #0D0D1A)' }}
    >
      <LandingBackground />

      {/* Back link — top-right in RTL */}
      <div className="relative z-20 px-6 sm:px-10 py-5 max-w-6xl mx-auto">
        <Link
          href="/"
          className="text-sm font-medium px-4 py-2 rounded-xl transition-colors inline-flex items-center gap-1.5"
          style={{ color: '#8B8FA8', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <ArrowLeft size={14} />
          <span>חזרה</span>
        </Link>
      </div>

      {/* ── Main stage ── */}
      <section className="relative z-10 px-6 sm:px-10 pb-20 max-w-md mx-auto text-center">
        {/* glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            width: 520,
            height: 320,
            background: 'radial-gradient(ellipse, rgba(107,91,229,0.35), transparent 70%)',
            filter: 'blur(100px)',
            zIndex: -1,
          }}
        />

        {/* TEEPO mascot */}
        <div className="mx-auto mb-6 flex items-center justify-center" style={{ height: 180 }}>
          <Teepo state={teepoState} size={140} />
        </div>

        <span
          className="block text-xs font-semibold tracking-[0.18em] uppercase mb-3"
          style={{ color: '#B8A9FF' }}
        >
          Welcome to
        </span>

        <h1
          className="font-extrabold leading-none mb-4"
          style={{ fontSize: 'clamp(36px,6vw,52px)', letterSpacing: '-0.035em' }}
        >
          <span
            style={{
              background: 'linear-gradient(135deg,#B8A9FF,#8B7FF0)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontFamily: "'Inter',sans-serif",
            }}
          >
            TEEPO
          </span>
        </h1>

        <p
          className="text-sm mb-8 max-w-xs mx-auto leading-relaxed"
          style={{ color: '#8B8FA8' }}
        >
          התחבר עם חשבון Google שלך כדי להתחיל. הנתונים נשמרים אצלך, לא אצלנו.
        </p>

        {/* Card */}
        <div
          className="p-6 sm:p-7 rounded-2xl space-y-5"
          style={{
            background:
              'linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.015))',
            border: '1px solid rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Google Sign In — primary and only option */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || authLoading}
            className="w-full py-3.5 rounded-xl font-semibold text-base flex items-center justify-center gap-3 transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
            style={{
              background: 'linear-gradient(135deg, #6B5BE5, #8B7FF0)',
              boxShadow: '0 0 32px rgba(107,91,229,0.4)',
            }}
          >
            {googleLoading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span>מתחבר…</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                    fill="#fff"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#fff"
                    opacity=".9"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    fill="#fff"
                    opacity=".85"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#fff"
                    opacity=".95"
                  />
                </svg>
                <span>התחבר עם Google</span>
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div
              className="p-3 rounded-lg text-sm text-center"
              style={{
                background: 'rgba(255,107,107,0.08)',
                border: '1px solid rgba(255,107,107,0.25)',
                color: '#FFA8A8',
              }}
            >
              {error}
            </div>
          )}

          {/* Why Google */}
          <div
            className="pt-4 space-y-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p
              className="text-[11px] font-semibold tracking-wider uppercase"
              style={{ color: '#B8A9FF' }}
            >
              מה זה אומר?
            </p>

            <div className="space-y-2.5 text-right">
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(107,91,229,0.2)' }}
                >
                  <Cloud size={14} style={{ color: '#B8A9FF' }} />
                </div>
                <div
                  className="text-xs leading-relaxed"
                  style={{ color: '#8B8FA8' }}
                >
                  <span className="font-semibold text-white">Google Drive</span>
                  {' '}— הנתונים שלך נשמרים בתיקייה ייעודית ב-Drive שלך, לא אצלנו.
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: 'rgba(139,127,240,0.2)' }}
                >
                  <Calendar size={14} style={{ color: '#B8A9FF' }} />
                </div>
                <div
                  className="text-xs leading-relaxed"
                  style={{ color: '#8B8FA8' }}
                >
                  <span className="font-semibold text-white">Google Calendar</span>
                  {' '}— קריאה בלבד, להצגת האירועים שלך בדשבורד.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Perks row */}
        <div
          className="flex items-center justify-center gap-4 mt-6 text-xs flex-wrap"
          style={{ color: '#8B8FA8' }}
        >
          <span className="flex items-center gap-1">
            <CheckCircle size={11} style={{ color: '#4ADE80' }} /> חינם
          </span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
          <span className="flex items-center gap-1">
            <CheckCircle size={11} style={{ color: '#4ADE80' }} /> ללא פרסומות
          </span>
          <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
          <span className="flex items-center gap-1">
            <CheckCircle size={11} style={{ color: '#4ADE80' }} /> הנתונים אצלך
          </span>
        </div>

        {/* Legal links */}
        <div
          className="mt-6 text-[11px] flex items-center justify-center gap-3"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          <Link href="/legal/privacy-policy" className="hover:text-white transition-colors">
            פרטיות
          </Link>
          <span>·</span>
          <Link href="/legal/terms-of-service" className="hover:text-white transition-colors">
            תנאים
          </Link>
        </div>
      </section>
    </div>
  )
}
