'use client'

/**
 * Auth page — Google-only sign-in.
 * Required scopes (calendar.readonly + drive.file) are requested here,
 * because the app stores the user's data in their own Google Drive.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Loader2, ArrowLeft, Cloud, Calendar } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export default function AuthPage() {
  const router = useRouter()
  const { user, loading: authLoading, signInWithGoogle } = useAuth()

  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard')
    }
  }, [user, authLoading, router])

  const handleGoogle = async () => {
    setGoogleLoading(true)
    setError('')
    const { error } = await signInWithGoogle()
    if (error) {
      setError(error)
      setGoogleLoading(false)
    }
    // On success → Supabase redirects to /dashboard
  }

  return (
    <div className="min-h-screen bg-base flex items-center justify-center px-4" dir="rtl">
      {/* Background orbs */}
      <div className="orb w-96 h-96 top-[-100px] right-[-80px]"
           style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.3) 0%, transparent 70%)' }} />
      <div className="orb w-80 h-80 bottom-[10%] left-[-60px]"
           style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.25) 0%, transparent 70%)' }} />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image src="/logo-128.png" alt="SmartDesk" width={56} height={56} className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-ink">SmartDesk</h1>
          <p className="text-ink-muted text-sm mt-1">התחבר כדי להמשיך</p>
        </div>

        {/* Card */}
        <div className="glass p-8 space-y-6">
          {/* Google Sign In — primary and only option */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleLoading || authLoading}
            className="w-full btn-gradient py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-3 shadow-glow disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#fff" fillOpacity=".95"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#fff" fillOpacity=".95"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#fff" fillOpacity=".95"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#fff" fillOpacity=".95"/>
                </svg>
                <span>התחבר עם Google</span>
              </>
            )}
          </button>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {/* Why Google */}
          <div className="pt-2 border-t border-white/5 space-y-3">
            <p className="text-xs font-semibold text-ink-muted">מה זה אומר?</p>
            <div className="space-y-2.5">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Cloud size={13} className="text-indigo-400" />
                </div>
                <div className="text-xs text-ink-muted leading-relaxed">
                  <span className="font-medium text-ink">Google Drive</span> —
                  הנתונים שלך נשמרים בתיקייה ייעודית ב-Drive שלך (לא אצלנו).
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Calendar size={13} className="text-violet-400" />
                </div>
                <div className="text-xs text-ink-muted leading-relaxed">
                  <span className="font-medium text-ink">Google Calendar</span> —
                  קריאה בלבד, כדי להראות לך את האירועים בדשבורד.
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Back to landing */}
        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-ink-subtle hover:text-ink-muted transition-colors inline-flex items-center gap-1"
          >
            <span>חזרה לעמוד הבית</span>
            <ArrowLeft size={12} />
          </Link>
        </div>
      </div>
    </div>
  )
}
