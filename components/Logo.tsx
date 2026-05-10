/**
 * TEEPO logo — open book + lowercase wordmark.
 *
 * Source of truth: teepo-design/mockup_landing.html → `.logo-mark`.
 *
 * Visual contract (locked, do not deviate):
 *   - Book icon tilted -5deg by default; rotates back to 0deg + scale 1.04 on
 *     row hover (the whole `.logo-mark` triggers it, not just the SVG).
 *   - Wordmark "teepo" in Fredoka 600, color #4a6b4f, tracking -2px.
 *   - Direction LTR even on RTL pages (Hebrew RTL flips letter order otherwise).
 *
 * The styling lives in globals.css under `.logo-mark` / `.logo-icon` /
 * `.logo-text` so the SVG stays decoupled from React-only concerns.
 */
export default function Logo() {
  return (
    <div className="logo-mark">
      <svg
        className="logo-icon"
        viewBox="0 0 120 100"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="teepo logo"
      >
        <defs>
          {/* soft gradient for the pages */}
          <linearGradient id="pageGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fffaf0" />
            <stop offset="100%" stopColor="#f5e9c8" />
          </linearGradient>
          {/* soft warm green for the spine */}
          <linearGradient id="spineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a3c98a" />
            <stop offset="100%" stopColor="#7fb069" />
          </linearGradient>
        </defs>

        {/* soft shadow under the book */}
        <ellipse cx="60" cy="92" rx="46" ry="4.5" fill="#5b4634" opacity=".15" />

        {/* left page — rounder, organic curves */}
        <path
          d="M 60 24
             C 56 19, 50 18, 44 19
             L 16 25
             C 10 26, 8 30, 8 36
             L 8 74
             C 8 80, 12 82, 18 81
             L 46 78
             C 54 78, 58 80, 60 84
             Z"
          fill="url(#pageGrad)"
        />

        {/* right page — rounder, organic curves */}
        <path
          d="M 60 24
             C 64 19, 70 18, 76 19
             L 104 25
             C 110 26, 112 30, 112 36
             L 112 74
             C 112 80, 108 82, 102 81
             L 74 78
             C 66 78, 62 80, 60 84
             Z"
          fill="url(#pageGrad)"
        />

        {/* soft inner shadow at spine for depth */}
        <path d="M 60 26 Q 50 28, 46 30 L 46 74 Q 50 76, 60 78 Z" fill="#e8d8a8" opacity=".4" />
        <path d="M 60 26 Q 70 28, 74 30 L 74 74 Q 70 76, 60 78 Z" fill="#e8d8a8" opacity=".4" />

        {/* spine accent — soft sage green, rounded */}
        <rect x="57.5" y="22" width="5" height="62" rx="2.5" fill="url(#spineGrad)" />

        {/* friendly bookmark ribbon hanging out the right page */}
        <path d="M 92 24 L 92 50 L 96 46 L 100 50 L 100 24 Z" fill="#d97706" />
        <path d="M 92 24 L 100 24 L 100 28 L 92 28 Z" fill="#b45309" />

        {/* subtle text dots on left page (warmer, softer) */}
        <line x1="20" y1="42" x2="44" y2="40" stroke="#a8916a" strokeWidth="2" strokeLinecap="round" opacity=".5" />
        <line x1="20" y1="52" x2="44" y2="50" stroke="#a8916a" strokeWidth="2" strokeLinecap="round" opacity=".5" />
        <line x1="20" y1="62" x2="38" y2="60" stroke="#a8916a" strokeWidth="2" strokeLinecap="round" opacity=".35" />

        {/* subtle text dots on right page */}
        <line x1="76" y1="40" x2="100" y2="42" stroke="#a8916a" strokeWidth="2" strokeLinecap="round" opacity=".5" />
        <line x1="76" y1="50" x2="100" y2="52" stroke="#a8916a" strokeWidth="2" strokeLinecap="round" opacity=".5" />
        <line x1="82" y1="60" x2="100" y2="62" stroke="#a8916a" strokeWidth="2" strokeLinecap="round" opacity=".35" />
      </svg>
      <span className="logo-text">teepo</span>
    </div>
  )
}
