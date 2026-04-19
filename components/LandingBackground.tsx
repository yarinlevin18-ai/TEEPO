/**
 * LandingBackground
 *
 * Dark-theme "flowing network + glowing data orb" background for the landing page.
 *
 * Layer stack (deep → close):
 *  0. Base fill (#0f1117) — page background
 *  1. Deep mesh wash — 3 static radial gradients (atmosphere)
 *  2. Aurora blobs — 4 blurred circles drifting 22–30s (reuse existing .aurora-*)
 *  3. Data orb — central protagonist, pulse driver (8s period)
 *  4. Circuit grid — single SVG with 7 paths + packets riding on trunks
 *  5. Radial vignette — darkens edges + soft darkening behind headline
 *  6. Grain — reuse existing .grain (hides blur banding)
 *
 * All timings are multiples of 8s so the scene "breathes" coherently.
 * CSS-only animations, GPU-friendly (transform/opacity/stroke-dashoffset only).
 * Respects prefers-reduced-motion via globals.css media query.
 */

export default function LandingBackground() {
  return (
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden landing-bg"
      aria-hidden
      style={{ zIndex: 0 }}
    >
      {/* Layer 1 — deep mesh wash (static atmosphere) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 45% at 15% 10%, rgba(99,102,241,0.18) 0%, transparent 60%), ' +
            'radial-gradient(ellipse 55% 50% at 85% 55%, rgba(139,92,246,0.15) 0%, transparent 65%), ' +
            'radial-gradient(ellipse 80% 60% at 50% 110%, rgba(15,17,23,0.85) 0%, transparent 70%)',
        }}
      />

      {/* Layer 2 — aurora blobs (drifting color) */}
      <div className="aurora-mesh">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
        <div className="aurora-blob aurora-blob-4" />
      </div>

      {/* Layer 3 — Data Orb (pulse driver, 8s) */}
      <div className="orb-wrap">
        <div className="orb-halo" />
        <div className="orb-core">
          <svg
            className="orb-wire"
            viewBox="0 0 200 200"
            width="100%"
            height="100%"
            preserveAspectRatio="xMidYMid meet"
          >
            <circle cx="100" cy="100" r="92" fill="none" stroke="#a5b4fc" strokeWidth="0.5" opacity="0.3" />
            <ellipse cx="100" cy="100" rx="92" ry="36" fill="none" stroke="#a5b4fc" strokeWidth="0.5" opacity="0.15" />
            <ellipse cx="100" cy="100" rx="92" ry="68" fill="none" stroke="#a5b4fc" strokeWidth="0.5" opacity="0.13" />
            <ellipse cx="100" cy="100" rx="28" ry="92" fill="none" stroke="#a5b4fc" strokeWidth="0.5" opacity="0.12" />
          </svg>
        </div>
      </div>

      {/* Layer 4 — Circuit Grid (7 paths + packets on trunks) */}
      <svg
        className="circuit-svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="packetGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* — TRUNK lines (thick, indigo) — carry packets — */}
        <g className="circuit-lines">
          <path d="M 1500 120 C 1200 160, 900 220, 400 350 S -50 400, -50 400" stroke="rgba(129,140,248,0.28)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M 1500 680 C 1250 620, 1000 600, 500 720 S -50 640, -50 640" stroke="rgba(129,140,248,0.28)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M 1100 -50 C 1020 100, 1050 300, 1150 600 S 1080 950, 1080 950" stroke="rgba(129,140,248,0.28)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M 900 220 C 910 320, 920 400, 920 480" stroke="rgba(167,139,250,0.22)" strokeWidth="0.75" strokeLinecap="round" fill="none" />
          <path d="M 1000 600 C 1020 540, 1040 470, 1050 400" stroke="rgba(167,139,250,0.22)" strokeWidth="0.75" strokeLinecap="round" fill="none" />
          <path d="M 200 -30 C 240 80, 280 180, 150 380" stroke="rgba(167,139,250,0.22)" strokeWidth="0.75" strokeLinecap="round" fill="none" />
          <path d="M -50 300 C 300 380, 700 420, 1100 380 S 1500 340, 1500 340" stroke="rgba(103,232,249,0.18)" strokeWidth="0.75" strokeLinecap="round" fill="none" />
        </g>

        {/* — PACKETS — dashed strokes animated via dashoffset — */}
        <g className="circuit-packets" filter="url(#packetGlow)">
          <path className="packet packet-a" d="M 1500 120 C 1200 160, 900 220, 400 350 S -50 400, -50 400" stroke="#c4b5fd" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path className="packet packet-b" d="M 1500 680 C 1250 620, 1000 600, 500 720 S -50 640, -50 640" stroke="#c4b5fd" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path className="packet packet-c" d="M 1100 -50 C 1020 100, 1050 300, 1150 600 S 1080 950, 1080 950" stroke="#c4b5fd" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path className="packet packet-cyan" d="M -50 300 C 300 380, 700 420, 1100 380 S 1500 340, 1500 340" stroke="#67e8f9" strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      </svg>

      {/* Layer 5 — Vignette (edges + soft center behind headline) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 45% 30% at 50% 22%, rgba(15,17,23,0.35) 0%, transparent 70%), ' +
            'radial-gradient(ellipse 80% 60% at 50% 50%, transparent 0%, transparent 40%, rgba(15,17,23,0.55) 100%)',
        }}
      />

      {/* Layer 6 — grain overlay */}
      <div className="grain" />
    </div>
  )
}
