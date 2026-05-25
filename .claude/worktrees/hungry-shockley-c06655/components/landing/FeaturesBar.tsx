/**
 * Three-card features bar — concrete capabilities, not generic copy.
 *
 * Each card maps to a real product value prop:
 *   🧠 TEEPO as the central brain — full transparency in user's own Drive
 *   🎯 Credits + dean's list tracker (spec §3.8, PRs #41, #42)
 *   📚 Moodle/Portal scrapers (PRs #29, #30, #31, #35, #37 — BGU + TAU)
 *
 * Right-aligned (RTL), warm-gradient icon tiles, leaf-cream cards.
 */
const FEATURES = [
  {
    icon: '🧠',
    title: 'המוח של הסמסטר שלך',
    body: 'כל המידע הלימודי שאתה צריך — קורסים, סיכומים, ציונים — נשמר בדרייב האישי שלך, בשקיפות מלאה.',
  },
  {
    icon: '🎯',
    title: 'מעקב נק"ז והצטיינות',
    body: 'ממוצע, צפי לדיקן, וסימולציה: "אם אקבל 92, איך זה ישפיע?". שנתון לכל אוניברסיטה.',
  },
  {
    icon: '📚',
    title: 'ייבוא מ-Moodle ומפורטל',
    body: 'קורסים, ציונים ומטלות נשאבים אוטומטית מ-BGU ו-TAU. בלי להעתיק ידנית.',
  },
] as const

export default function FeaturesBar() {
  return (
    <section className="features-section" aria-labelledby="lp-features-heading">
      <div className="section-head">
        <div className="section-eyebrow">מה כלול</div>
        <h2 id="lp-features-heading">כל מה שצריך ללימודים.</h2>
      </div>
      <div className="features-bar">
        {FEATURES.map((f) => (
          <div className="feature-card" key={f.title}>
            <div className="feature-icon" aria-hidden>
              {f.icon}
            </div>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
