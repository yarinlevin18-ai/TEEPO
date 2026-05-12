/**
 * Landing top nav — small logo on the right (RTL), "כניסה" link on the left.
 *
 * Per spec §5.1. Uses a compact variant of the book logo (no wordmark) so it
 * doesn't compete with the giant hero wordmark below.
 */
import Link from 'next/link'

export default function TopNav() {
  return (
    <nav className="lp-nav" aria-label="ניווט עליון">
      <Link href="/" className="lp-nav-brand" aria-label="TEEPO — דף הבית">
        <svg
          className="lp-nav-icon"
          viewBox="0 0 120 100"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <defs>
            <linearGradient id="navPageGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fffaf0" />
              <stop offset="100%" stopColor="#f5e9c8" />
            </linearGradient>
            <linearGradient id="navSpineGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a3c98a" />
              <stop offset="100%" stopColor="#7fb069" />
            </linearGradient>
          </defs>
          <path d="M 60 24 C 56 19, 50 18, 44 19 L 16 25 C 10 26, 8 30, 8 36 L 8 74 C 8 80, 12 82, 18 81 L 46 78 C 54 78, 58 80, 60 84 Z" fill="url(#navPageGrad)" />
          <path d="M 60 24 C 64 19, 70 18, 76 19 L 104 25 C 110 26, 112 30, 112 36 L 112 74 C 112 80, 108 82, 102 81 L 74 78 C 66 78, 62 80, 60 84 Z" fill="url(#navPageGrad)" />
          <rect x="57.5" y="22" width="5" height="62" rx="2.5" fill="url(#navSpineGrad)" />
          <path d="M 92 24 L 92 50 L 96 46 L 100 50 L 100 24 Z" fill="#d97706" />
        </svg>
        <span className="lp-nav-word">teepo</span>
      </Link>

      <Link href="/auth" className="lp-nav-cta">
        כניסה
        <span aria-hidden>←</span>
      </Link>
    </nav>
  )
}
