/**
 * Landing hero — headline, sublines, Google CTA, restriction pill.
 *
 * Source of truth: teepo-design/mockup_landing.html → `<main class="hero">`.
 * Hebrew RTL, "חכמה" carries the warm gradient.
 */
import Link from 'next/link'

export default function Hero() {
  return (
    <main className="hero">
      <h1 className="tagline">
        פלטפורמת לימודים <span className="accent">חכמה</span> לסטודנטים.
      </h1>
      <p className="subline">
        קורסים, ציונים ומטלות נשאבים אוטומטית מ-<strong>Moodle</strong> ומפורטל
        האוניברסיטה. הקבצים והסיכומים נשמרים ב-<strong>Google Drive</strong> שלך.
      </p>
      <p className="subline">החיים האקדמיים בשליטה שלך — בלי לעבור בין עשרה אתרים.</p>

      <Link href="/auth" className="google-btn">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#fff"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#fff"
            opacity=".85"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#fff"
            opacity=".7"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#fff"
            opacity=".55"
          />
        </svg>
        הירשם עם Google
      </Link>

      <ul className="trust-row" aria-label="עקרונות המוצר">
        <li>חינם</li>
        <li aria-hidden>·</li>
        <li>ללא פרסומות</li>
        <li aria-hidden>·</li>
        <li>הנתונים אצלך ב-Drive</li>
      </ul>

      <div className="restriction-note">
        <span aria-hidden>🎓</span>
        <span>פתוח לסטודנטים של אונ&apos; בן-גוריון ואונ&apos; תל-אביב בלבד</span>
      </div>
    </main>
  )
}
