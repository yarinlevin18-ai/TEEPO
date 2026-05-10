/**
 * Closing CTA before the footer.
 *
 * Big warm-gradient panel with the hero promise restated and a second
 * Google sign-in entry point so users who scrolled to learn more don't
 * have to scroll back up to convert.
 */
import Link from 'next/link'

export default function FinalCTA() {
  return (
    <section className="final-cta" aria-labelledby="lp-final-cta-heading">
      <div className="final-cta-inner">
        <h2 id="lp-final-cta-heading">הסמסטר הבא שלך מתחיל אחרת.</h2>
        <p>חבר את Moodle תוך 30 שניות. בלי כרטיס אשראי. בלי התחייבות.</p>
        <Link href="/auth" className="final-cta-btn">
          הירשם עם Google
          <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  )
}
