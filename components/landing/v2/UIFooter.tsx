/**
 * Landing v2 footer — browser-chrome motif (traffic-light dots + copyright + links).
 *
 * Source of truth: teepo-design/mockup_landing.html → <div class="ui-footer">.
 * The chrome dots are decorative (aria-hidden); the bottom row carries the
 * functional links: privacy, terms, and a mailto for contact.
 */
import Link from 'next/link'

export default function UIFooterV2() {
  return (
    <div className="landing-v2-ui-footer">
      <div className="landing-v2-controls" aria-hidden>
        <span className="landing-v2-dot red" />
        <span className="landing-v2-dot yellow" />
        <span className="landing-v2-dot green" />
      </div>
      <div className="landing-v2-footer-content">
        <div>
          © 2026 <strong>TEEPO</strong> — נבנה בשביל סטודנטים
        </div>
        <div className="landing-v2-footer-links">
          <Link href="/legal/privacy-policy">פרטיות</Link>
          <Link href="/legal/terms-of-service">תנאי שימוש</Link>
          <a href="mailto:hello@teepo.app">צור קשר</a>
        </div>
      </div>
    </div>
  )
}
