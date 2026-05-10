/**
 * "איך זה עובד" — three numbered steps from spec §3.1–§3.4.
 *
 * Each step describes a real onboarding action a new user takes. Numbers
 * use the warm gradient as accent so they tie into the hero CTA visually.
 */
const STEPS = [
  {
    num: '01',
    title: 'התחבר עם Google',
    body: 'הרשאות מינימליות בלבד: יומן לקריאה ותיקיית TEEPO ב-Drive (drive.file). בלי גישה לכל הדרייב, בלי סיסמה חדשה.',
  },
  {
    num: '02',
    title: 'חבר Moodle ופורטל',
    body: 'אישור חד-פעמי — והקורסים, הציונים והמטלות מ-BGU או TAU מסתנכרנים אוטומטית. סיווג סמסטרים אוטומטי.',
  },
  {
    num: '03',
    title: 'הסמסטר שלך מאורגן',
    body: 'דשבורד חי עם המטלות, היומן, מעקב נק"ז ועוזר AI שיודע מה אתה לומד. ארגון בלי תקורה.',
  },
] as const

export default function HowItWorks() {
  return (
    <section className="how-section" aria-labelledby="lp-how-heading">
      <div className="section-head">
        <div className="section-eyebrow">איך זה עובד</div>
        <h2 id="lp-how-heading">שלוש דקות. שלושה צעדים.</h2>
      </div>
      <div className="steps-grid">
        {STEPS.map((s) => (
          <div className="step-card" key={s.num}>
            <div className="step-num" aria-hidden>{s.num}</div>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
