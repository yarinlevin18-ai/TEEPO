'use client'

/**
 * Login page — Google OAuth, BGU/TAU domain-restricted.
 *
 * Implementation of teepo-design/mockup_login.html using locked tokens.
 * Domain restriction notice expanded per CLAUDE_CODE_PROMPT.md to mention
 * both BGU + TAU email patterns.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Already authenticated → straight to dashboard
  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard')
    }
  }, [user, authLoading, router])

  const handleGoogle = async () => {
    setSubmitting(true)
    setError(null)
    const { error: err } = await signInWithGoogle()
    if (err) {
      setError(err)
      setSubmitting(false)
    }
    // On success, Supabase redirects through OAuth → /auth/callback → /dashboard
  }

  return (
    <main className="teepo-login" dir="rtl">
      <div className="bg-glow bg-glow-1" aria-hidden />
      <div className="bg-glow bg-glow-2" aria-hidden />

      <nav className="topnav">
        <Link href="/" className="logo">
          teep<span className="accent">o</span>
        </Link>
        <div className="spacer" />
        <Link href="/" className="back-link">
          ← חזרה לדף הבית
        </Link>
      </nav>

      <section className="center">
        <div className="auth-card">
          <div className="auth-eyebrow">
            <span className="dot" />
            אוניברסיטת בן-גוריון / תל אביב
          </div>

          <h1>
            ברוכים הבאים
            <br />
            ל-<span className="accent">teepo.</span>
          </h1>
          <p className="sub">
            התחברו עם חשבון Google של BGU או TAU. בלי סיסמה חדשה. בלי טפסים.
          </p>

          <button
            type="button"
            className="google-btn"
            onClick={handleGoogle}
            disabled={submitting}
          >
            <svg className="g-logo" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {submitting ? 'מעביר אתכם ל-Google...' : 'המשך עם Google'}
          </button>

          <div className="bgu-restriction">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>
              רק חשבונות{' '}
              <strong>@bgu.ac.il</strong>, <strong>@post.bgu.ac.il</strong>,{' '}
              <strong>@tauex.tau.ac.il</strong> או{' '}
              <strong>@mail.tau.ac.il</strong>{' '}
              יכולים להתחבר.
            </span>
          </div>

          {error && (
            <div className="login-error" role="alert">
              {error}
            </div>
          )}

          <div className="divider">מה קורה אחרי החיבור</div>

          <ul className="next-list">
            <li>
              <span className="check" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              אישור חיבור Moodle ופורטל (חד-פעמי)
            </li>
            <li>
              <span className="check" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              סנכרון אוטומטי של הקורסים, המטלות והציונים
            </li>
            <li>
              <span className="check" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              לוח הבקרה מוכן תוך 30 שניות
            </li>
          </ul>

          <p className="auth-foot">
            בהתחברות אתם מאשרים את{' '}
            <Link href="/legal/terms-of-service">תנאי השימוש</Link> ואת{' '}
            <Link href="/legal/privacy-policy">מדיניות הפרטיות</Link>.
          </p>
        </div>
      </section>

      <footer className="login-footer">
        <div className="pill">
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          מאובטח עם Google OAuth
        </div>
        <div className="pill">
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          הפרטים שלכם נשארים שלכם
        </div>
        <div className="pill">
          <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          הקמה תוך 30 שניות
        </div>
      </footer>
    </main>
  )
}
