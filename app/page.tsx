/**
 * Landing page — public, no auth.
 *
 * Implementation of teepo-design/mockup_landing.html using the locked
 * cream / leaf-green design tokens. Hebrew RTL throughout.
 *
 * Per CLAUDE_CODE_PROMPT.md:
 *   - No top navbar (intentionally removed)
 *   - Single CTA: "התחברו עם Google" → /auth
 *   - Embed real dashboard via iframe at /demo (read-only sample data)
 *   - 2 big featured cards + 4 small feature cards
 *   - 3 numbered steps
 *   - Final gradient CTA + footer
 *   - No testimonials, no rating stars, no stats strip, no AI mention
 */
import Link from 'next/link'
import LandingPreview from '@/components/landing/LandingPreview'

export const metadata = {
  title: 'TEEPO — הסמסטר שלך, מאורגן',
  description:
    'פלטפורמה אחת לכל הסמסטר. כל הקבצים והסיכומים שלך נשמרים ב-Google Drive האישי שלך — שלך, לתמיד.',
}

export default function LandingPage() {
  return (
    <main className="teepo-landing" dir="rtl">
      {/* Soft background glows — separate from paper texture on <body> */}
      <div className="bg-glow bg-glow-1" aria-hidden />
      <div className="bg-glow bg-glow-2" aria-hidden />

      <div className="wrap">
        {/* HERO ─────────────────────────────────────────── */}
        <section className="hero">
          <h1>
            <span className="accent">teepo.</span>
            <br />
            פלטפורמת לימודים חכמה לסטודנטים.
          </h1>
          <p className="hero-sub">
            פלטפורמה אחת לכל הסמסטר. כל הקבצים והסיכומים שלך נשמרים ב-Google Drive
            האישי שלך — שלך, לתמיד.
          </p>
          <div className="hero-cta">
            <Link href="/auth" className="btn btn-primary btn-lg">
              התחברו עם Google
            </Link>
          </div>

          <LandingPreview />
        </section>

        {/* FEATURES ─────────────────────────────────────── */}
        <section className="section" id="features">
          <div className="section-head">
            <div className="section-eyebrow">תכונות</div>
            <h2>הכל במקום אחד</h2>
            <p>בלי לוחמת אפליקציות, בלי טאבים פתוחים בכרום. כלי אחד לכל הסמסטר.</p>
          </div>

          <div className="featured-row">
            <div className="feat-big">
              <div className="feat-big-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M21 12a9 9 0 11-9-9 9 9 0 019 9z" />
                  <path d="M16 12l-4 4-2-2" />
                </svg>
              </div>
              <h3>סנכרון Moodle ופורטל</h3>
              <p>
                כל קורס, כל מטלה, כל ציון — נשאב אוטומטית מ-Moodle ומפורטל הסטודנטים של
                BGU ו-TAU. בלי להעתיק ידנית, בלי לפספס deadline.
              </p>
            </div>
            <div className="feat-big">
              <div className="feat-big-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6" />
                  <circle cx="12" cy="14" r="2" />
                </svg>
              </div>
              <h3>הנתונים שלך — נשארים שלך</h3>
              <p>
                כל הסיכומים והקבצים נשמרים ב-Google Drive האישי שלך, בהיררכיה מסודרת
                לפי קורסים. אנחנו לא רואים, לא שומרים, לא מוכרים.
              </p>
            </div>
          </div>

          <div className="features">
            <div className="feature">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 3v18h18M7 14l4-4 4 4 6-6" />
                </svg>
              </div>
              <h3>מעקב ממוצע ונק&quot;ז</h3>
              <p>חישוב מדויק, צפי לצטיינות, סימולציה: &quot;אם אקבל 92, איך זה ישפיע?&quot;. שנתון מובנה לכל אוניברסיטה.</p>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
              </div>
              <h3>לוח שנה מאוחד</h3>
              <p>הרצאות, תרגולים, מטלות, בחינות — תצוגה אחת. סנכרון אוטומטי עם Google Calendar.</p>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                </svg>
              </div>
              <h3>סיכומים ב-Drive</h3>
              <p>סיכומים נשמרים אוטומטית בתיקיית הקורס בעברית. נפתחים ב-Google Docs שאתם רגילים אליו.</p>
            </div>
            <div className="feature">
              <div className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.7 21a2 2 0 01-3.4 0" />
                </svg>
              </div>
              <h3>תזכורות פוש</h3>
              <p>יום לפני deadline, שבוע לפני בוחן, חצי שעה לפני הרצאה. אתם בוחרים את העיתוי.</p>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS ────────────────────────────────── */}
        <section className="section" id="how">
          <div className="section-head">
            <div className="section-eyebrow">איך זה עובד</div>
            <h2>שלוש דקות. שלושה צעדים.</h2>
          </div>
          <div className="steps">
            <div className="step">
              <div className="step-num">01</div>
              <h3>התחברו עם BGU</h3>
              <p>חשבון Google של האוניברסיטה — אין צורך בסיסמה חדשה.</p>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <h3>חברו את Moodle והפורטל</h3>
              <p>אישור חד-פעמי. הקורסים, המטלות, והציונים מסונכרנים אוטומטית.</p>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <h3>הסמסטר שלכם מאורגן</h3>
              <p>לוח בקרה מוכן עם הקורסים, המטלות, והלוח.</p>
            </div>
          </div>
        </section>

        {/* FINAL CTA ────────────────────────────────────── */}
        <section>
          <div className="cta">
            <h2>הסמסטר הבא שלך מתחיל אחרת.</h2>
            <p>חברו את Moodle תוך 30 שניות. בלי כרטיס אשראי. בלי התחייבות.</p>
            <div className="cta-buttons">
              <Link href="/auth" className="btn btn-on-grad btn-lg">
                התחברו עם Google
              </Link>
            </div>
          </div>
        </section>

        <footer className="landing-footer">
          © 2026 <span className="landing-foot-mark">teep<span className="accent">o</span></span> · הסמסטר שלך, מאורגן.
        </footer>
      </div>
    </main>
  )
}
