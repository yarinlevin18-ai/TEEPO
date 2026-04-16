'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { GraduationCap, Mail, Lock, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function AuthPage() {
  const router = useRouter()
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
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
      const { error } = await signUp(email, password)
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
          <div className="w-14 h-14 rounded-2xl bg-gradient-accent flex items-center justify-center shadow-glow mx-auto mb-4">
            <GraduationCap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-ink">מערכת לימודים חכמה</h1>
          <p className="text-ink-muted text-sm mt-1">
            {mode === 'login' ? 'התחבר לחשבון שלך' : 'צור חשבון חדש'}
          </p>
        </div>

        {/* Form Card */}
        <div className="glass p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
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
