/**
 * Four-card features bar — concrete capabilities, not generic copy.
 *
 * Each card maps to a real shipped feature:
 *   📚 Moodle/Portal scrapers (PRs #29, #30, #31, #35, #37 — BGU + TAU)
 *   🤖 AI assistant grounded in the user's own files (spec §3.7)
 *   🎯 Credits + dean's list tracker (spec §3.8, PRs #41, #42)
 *   📅 Drive + Calendar sync (drive.file scope, spec §3.9)
 *
 * Right-aligned (RTL), warm-gradient icon tiles, leaf-cream cards.
 */
const FEATURES = [
  {
    icon: '📚',
    title: 'ייבוא Moodle ופורטל',
    body: 'קורסים, ציונים ומטלות נשאבים אוטומטית מ-BGU ו-TAU. בלי להעתיק ידנית.',
  },
  {
    icon: '🤖',
    title: 'AI שמכיר את החומר שלך',
    body: 'עוזר לימוד מבוסס Claude שעונה מתוך הסיכומים והמצגות שלך — לא ידע גנרי.',
  },
  {
    icon: '🎯',
    title: 'מעקב נק"ז וצטיינות',
    body: 'ממוצע, צפי לדיקן, וסימולציה: "אם אקבל 92, איך זה ישפיע?". שנתון לכל אוניברסיטה.',
  },
  {
    icon: '📅',
    title: 'Google Calendar + Drive',
    body: 'יומן השיעורים מסונכרן. סיכומים נשמרים בתיקיית הקורס שלך — drive.file בלבד.',
  },
] as const

export default function FeaturesBar() {
  return (
    <section className="features-bar" aria-labelledby="lp-features-heading">
      <h2 id="lp-features-heading" className="sr-only">
        מה TEEPO עושה
      </h2>
      {FEATURES.map((f) => (
        <div className="feature-card" key={f.title}>
          <div className="feature-icon" aria-hidden>
            {f.icon}
          </div>
          <h3>{f.title}</h3>
          <p>{f.body}</p>
        </div>
      ))}
    </section>
  )
}
