/**
 * Browser-chrome style landing footer — traffic-light dots + copyright + links.
 *
 * Source of truth: teepo-design/mockup_landing.html → `<div class="ui-footer">`.
 * The chrome motif riffs on the macOS window controls; intentionally non-functional.
 */
import Link from 'next/link'

export default function UIFooter() {
  return (
    <div className="ui-footer">
      <div className="controls" aria-hidden>
        <span className="dot red" />
        <span className="dot yellow" />
        <span className="dot green" />
      </div>
      <div className="footer-content">
        <div>
          © 2026 <strong>TEEPO</strong> — נבנה בשביל סטודנטים
        </div>
        <div className="footer-links">
          <Link href="/legal/privacy-policy">פרטיות</Link>
          <Link href="/legal/terms-of-service">תנאי שימוש</Link>
          <a href="mailto:hello@teepo.app">צור קשר</a>
        </div>
      </div>
    </div>
  )
}
