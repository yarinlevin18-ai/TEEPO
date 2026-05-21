'use client'

/**
 * Login page (v2 cream redesign) — Google OAuth, BGU/TAU domain-restricted.
 *
 * Visual source of truth: teepo-design/mockup_login.html.
 * CSS namespace: .login-v2-* (defined at the END of app/globals.css), composed
 * with .cream-page for the shared paper-grain + drifting color-wash background.
 *
 * Mechanics preserved verbatim from previous v3 implementation:
 *   - useAuth() / signInWithGoogle() flow
 *   - Already-signed-in redirect to /dashboard
 *   - Dual-university (BGU + TAU) restriction copy (mockup is BGU-only sample;
 *     real domain list lives in production copy, do not regress to BGU-only).
 *   - Disabled state on submit, error surfaced via role="alert".
 *
 * Visual changes from previous version:
 *   - Drops static .bg-glow divs in favor of .cream-page's animated drift.
 *   - Adds a handwritten squiggly underline beneath "teepo." (CSS ::after).
 *   - Card gains a fadeUp entry + a thin top gradient accent line.
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import Logo from '@/components/Logo'

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
    <main className="login-v2 cream-page" dir="rtl">
      <nav className="login-v2-topnav">
        <Logo variant="large" href="/" />
        <div className="login-v2-spacer" />
        <Link href="/" className="login-v2-back-link" aria-label="חזרה לדף הבית">
          ← חזרה לדף הבית
        </Link>
      </nav>

      <section className="login-v2-center">
        <div className="login-v2-card">
          <div className="login-v2-eyebrow">
            <span className="login-v2-eyebrow-dot" aria-hidden />
            אוניברסיטת בן-גוריון / תל אביב
          </div>

          <h1 className="login-v2-title">
            ברוכים הבאים
            <br />
            ל-<span className="login-v2-title-accent">teepo.</span>
          </h1>
          <p className="login-v2-sub">
            התחברו עם חשבון Google של BGU או TAU. בלי סיסמה חדשה. בלי טפסים.
          </p>

          <button
            type="button"
            className="login-v2-google-btn"
            onClick={handleGoogle}
            disabled={submitting}
            aria-label="התחברות עם חשבון Google"
          >
            <svg className="login-v2-g-logo" viewBox="0 0 24 24" aria-hidden>
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

          <div className="login-v2-restriction">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
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
            <div className="login-v2-error" role="alert">
              {error}
            </div>
          )}

          <div className="login-v2-divider">מה קורה אחרי החיבור</div>

          <ul className="login-v2-next-list">
            <li>
              <span className="login-v2-check" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              אישור חיבור Moodle ופורטל (חד-פעמי)
            </li>
            <li>
              <span className="login-v2-check" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              סנכרון אוטומטי של הקורסים, המטלות והציונים
            </li>
            <li>
              <span className="login-v2-check" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </span>
              לוח הבקרה מוכן תוך 30 שניות
            </li>
          </ul>

          <p className="login-v2-foot">
            בהתחברות אתם מאשרים את{' '}
            <Link href="/legal/terms-of-service">תנאי השימוש</Link> ואת{' '}
            <Link href="/legal/privacy-policy">מדיניות הפרטיות</Link>.
          </p>
        </div>
      </section>

      <footer className="login-v2-footer">
        <div className="login-v2-pill">
          <svg className="login-v2-pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          מאובטח עם Google OAuth
        </div>
        <div className="login-v2-pill">
          <svg className="login-v2-pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          הפרטים שלכם נשארים שלכם
        </div>
        <div className="login-v2-pill">
          <svg className="login-v2-pill-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M12 6v6l4 2" />
          </svg>
          הקמה תוך 30 שניות
        </div>
      </footer>
    </main>
  )
}
