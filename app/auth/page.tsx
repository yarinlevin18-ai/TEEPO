'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Mail, Lock, ArrowLeft, Loader2, User } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

export default function AuthPage() {
  const router = useRouter()
  const { user, loading: authLoading, signIn, signUp, signInWithGoogle } = useAuth()

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard')
    }
  }, [user, authLoading, router])
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')
    setLoading(true)

    if (!email || !password) {
      setError('נא למלא את כל השדות')
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setError('סיסמה חייבת להכיל לפחות 6 תווים')
      setLoading(false)
      return
    }

    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) {
        setError(translateError(error))
      } else {
        router.push('/dashboard')
      }
    } else {
      const { error } = await signUp(email, password, displayName.trim() || undefined)
      if (error) {
        setError(translateError(error))
      } else {
        setSuccessMsg('נרשמת בהצלחה! בדוק את המייל שלך לאימות החשבון.')
      }
    }

    setLoading(false)
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
          <p className="text-ink-muted text-sm mt-1">
            {mode === 'login' ? 'התחבר לחשבון שלך' : 'צור חשבון חדש'}
          </p>
        </div>

        {/* Form Card */}
        <div className="glass p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Name (signup only) */}
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-ink-muted mb-2">שם מלא</label>
                <div className="relative">
                  <User size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="השם שלך"
                    className="w-full pr-10 pl-4 py-3 rounded-xl bg-white/5 border border-white/10 text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">אימייל</label>
              <div className="relative">
                <Mail size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pr-10 pl-4 py-3 rounded-xl bg-white/5 border border-white/10 text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-colors"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">סיסמה</label>
              <div className="relative">
                <Lock size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'לפחות 6 תווים' : 'הסיסמה שלך'}
                  className="w-full pr-10 pl-4 py-3 rounded-xl bg-white/5 border border-white/10 text-ink placeholder:text-ink-subtle focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-colors"
                  dir="ltr"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Success */}
            {successMsg && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                {successMsg}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full btn-gradient py-3 rounded-xl font-bold text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'התחבר' : 'הירשם'}</span>
                  <ArrowLeft size={16} />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 mt-6">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-ink-subtle">או</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* Google Sign In */}
          <button
            type="button"
            onClick={async () => {
              setGoogleLoading(true)
              setError('')
              const { error } = await signInWithGoogle()
              if (error) {
                setError(error)
                setGoogleLoading(false)
              }
            }}
            disabled={googleLoading || loading}
            className="w-full mt-4 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-3 bg-white/5 border border-white/10 text-ink hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <Loader2 size={20} className="animate-spin" />
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>התחבר עם Google</span>
              </>
            )}
          </button>

          {/* Toggle mode */}
          <div className="mt-6 text-center">
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setSuccessMsg('') }}
              className="text-sm text-accent-400 hover:text-accent-300 transition-colors"
            >
              {mode === 'login' ? 'אין לך חשבון? הירשם כאן' : 'יש לך חשבון? התחבר כאן'}
            </button>
          </div>
        </div>

        {/* Back to landing */}
        <div className="text-center mt-6">
          <Link href="/" className="text-sm text-ink-subtle hover:text-ink-muted transition-colors">
            חזרה לעמוד הבית
          </Link>
        </div>
      </div>
    </div>
  )
}

function translateError(error: string): string {
  if (error.includes('Invalid login credentials')) return 'אימייל או סיסמה שגויים'
  if (error.includes('Email not confirmed')) return 'נא לאמת את כתובת האימייל שלך'
  if (error.includes('User already registered')) return 'כתובת אימייל זו כבר רשומה'
  if (error.includes('Password should be')) return 'סיסמה חייבת להכיל לפחות 6 תווים'
  if (error.includes('rate limit')) return 'יותר מדי ניסיונות, נסה שוב בעוד דקה'
  return error
}
