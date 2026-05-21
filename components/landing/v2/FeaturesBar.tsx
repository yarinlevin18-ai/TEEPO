/**
 * Landing v2 features bar — 3 leaf-themed cards.
 *
 * Source of truth: teepo-design/mockup_landing.html → <section class="features-bar">.
 * Hebrew copy verbatim from the mockup. Each card uses an emoji icon with
 * the warm gradient tile background (matches the production design system).
 */
const FEATURES = [
  {
    icon: '🍃',
    title: 'הכל במקום אחד',
    body: 'מטלות, סיכומים, ולוח זמנים. בלי לחפש בעשרה אתרים שונים.',
  },
  {
    icon: '🌳',
    title: 'סנכרון עם Google',
    body: 'הקבצים שלך ב-Drive, היומן שלך ב-Calendar. בלי כפילויות.',
  },
  {
    icon: '🍂',
    title: 'בנוי לסטודנט',
    body: 'BGU ו-TAU. עברית RTL. עם הסמסטר שלך, לא נגדו.',
  },
] as const

export default function FeaturesBarV2() {
  return (
    <section className="landing-v2-features" aria-label="יתרונות המוצר">
      {FEATURES.map((f) => (
        <div className="landing-v2-feature-card" key={f.title}>
          <div className="landing-v2-feature-icon" aria-hidden>
            {f.icon}
          </div>
          <h3>{f.title}</h3>
          <p>{f.body}</p>
        </div>
      ))}
    </section>
  )
}
