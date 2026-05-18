/**
 * Public demo page — embedded by the landing-page iframe so visitors see
 * what the authenticated dashboard looks like, without exposing any real
 * user data.
 *
 * Renders a static dashboard preview: top navbar, hero stat strip, calendar
 * sketch, courses + tasks cards. Uses sample fixture data only — no Drive,
 * no Moodle, no auth. Clicks lead to /auth.
 */
import Link from 'next/link'

export const metadata = {
  title: 'teepo — תצוגה מקדימה',
  description: 'תצוגה מקדימה של לוח הבקרה',
  robots: { index: false, follow: false },
}

const SAMPLE_COURSES = [
  { name: 'מבוא למדעי המחשב', code: 'CS101', accent: 'rose' as const },
  { name: 'חשבון אינפיניטסימלי', code: 'MATH121', accent: 'teal' as const },
  { name: 'מבוא לכלכלה', code: 'ECON100', accent: 'indigo' as const },
  { name: 'מבני נתונים', code: 'CS202', accent: 'amber' as const },
]

const SAMPLE_TASKS = [
  { title: 'תרגיל בית 3', course: 'מבני נתונים', due: 'מחר 23:59', urgent: true },
  { title: 'הגשת פרויקט', course: 'מבוא למדעי המחשב', due: 'יום ראשון', urgent: false },
  { title: 'קריאת פרק 4', course: 'מבוא לכלכלה', due: 'בעוד 4 ימים', urgent: false },
]

export default function DemoPage() {
  return (
    <main className="teepo-demo" dir="rtl">
      {/* Top navbar — top of the dashboard mockup */}
      <header className="demo-nav">
        <div className="demo-logo">
          teep<span className="accent">o</span>
        </div>
        <nav className="demo-nav-links" aria-label="ראשי">
          <span className="demo-link active">לוח בקרה</span>
          <span className="demo-link">קורסים <span className="count">{SAMPLE_COURSES.length}</span></span>
          <span className="demo-link">מטלות <span className="count">{SAMPLE_TASKS.length}</span></span>
          <span className="demo-link">לוח שנה</span>
          <span className="demo-link">סיכומים</span>
        </nav>
        <div className="demo-spacer" />
        <span className="demo-pill">Moodle · מסונכרן</span>
        <span className="demo-user">דנה כ.</span>
      </header>

      <div className="demo-wrap">
        {/* Hero */}
        <section className="demo-hero">
          <div className="demo-hero-eyebrow">יום שלישי, 6 במאי</div>
          <h1>בוקר טוב, דנה.</h1>
          <p className="demo-hero-sub">3 מטלות פתוחות · בוחן הבא בעוד 8 ימים.</p>

          <div className="demo-stats">
            <div className="demo-stat">
              <span className="demo-stat-num">87.4</span>
              <span className="demo-stat-label">ממוצע משוקלל</span>
            </div>
            <div className="demo-stat">
              <span className="demo-stat-num">{SAMPLE_COURSES.length}</span>
              <span className="demo-stat-label">קורסים פעילים</span>
            </div>
            <div className="demo-stat">
              <span className="demo-stat-num">{SAMPLE_TASKS.length}</span>
              <span className="demo-stat-label">מטלות פתוחות</span>
            </div>
            <div className="demo-stat">
              <span className="demo-stat-num">בעוד 8 ימים</span>
              <span className="demo-stat-label">בוחן הבא</span>
            </div>
          </div>
        </section>

        {/* Calendar sketch */}
        <section className="demo-cal">
          <div className="demo-card-head">
            <h2>השבוע שלך</h2>
            <span className="demo-card-sub">5–11 במאי</span>
          </div>
          <div className="demo-cal-grid">
            {['ראש', 'שני', 'שלי', 'רבי', 'חמי'].map((d, i) => (
              <div key={d} className="demo-cal-col">
                <div className="demo-cal-day">{d}</div>
                <div className={`demo-cal-num ${i === 1 ? 'today' : ''}`}>{5 + i}</div>
                {i === 1 && (
                  <div className="demo-cal-event rose">
                    <strong>10:00</strong>
                    <span>מבני נתונים</span>
                  </div>
                )}
                {i === 2 && (
                  <div className="demo-cal-event teal">
                    <strong>14:00</strong>
                    <span>חשבון</span>
                  </div>
                )}
                {i === 3 && (
                  <div className="demo-cal-event indigo">
                    <strong>09:00</strong>
                    <span>כלכלה</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Bottom row: courses + tasks */}
        <section className="demo-row">
          <div className="demo-card">
            <div className="demo-card-head">
              <h2>קורסים פעילים</h2>
            </div>
            <ul className="demo-list">
              {SAMPLE_COURSES.map((c) => (
                <li key={c.code} className="demo-course">
                  <span className={`demo-course-dot ${c.accent}`} />
                  <div>
                    <strong>{c.name}</strong>
                    <small>{c.code}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="demo-card">
            <div className="demo-card-head">
              <h2>מטלות קרובות</h2>
            </div>
            <ul className="demo-list">
              {SAMPLE_TASKS.map((t) => (
                <li key={t.title} className="demo-task">
                  <div>
                    <strong>{t.title}</strong>
                    <small>{t.course}</small>
                  </div>
                  <span className={`demo-tag ${t.urgent ? 'urgent' : ''}`}>{t.due}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <div className="demo-cta-row">
          <Link href="/auth" className="demo-cta">
            התחבר עכשיו →
          </Link>
        </div>
      </div>
    </main>
  )
}
