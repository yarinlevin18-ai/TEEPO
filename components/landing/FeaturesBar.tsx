/**
 * Three-card features bar — appears below the hero.
 *
 * Source of truth: teepo-design/mockup_landing.html → `<section class="features-bar">`.
 * Cards are right-aligned (RTL); icons use the leaf-green warm gradient.
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

export default function FeaturesBar() {
  return (
    <section className="features-bar">
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
