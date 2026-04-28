'use client'

/**
 * SkyWildlife — daytime-only ambient life across the sky.
 *
 *   • Birds      — small dark-silhouette flock that drifts across the
 *                  viewport every ~45–60s, wings flapping. Reads as
 *                  "life passing through" rather than UI.
 *   • Butterflies — 1–2 fluttering shapes lower in the scene. Smaller,
 *                  more whimsical, present continuously during day.
 *
 * Visibility is gated by data-celestial="sun" on <html> (set by
 * LivingDayProvider) so wildlife disappears at night.
 */

import { useLivingDay } from '@/lib/living-day-context'

export default function SkyWildlife() {
  const { atmosphere } = useLivingDay()
  // Only render layer DOM when the sun is dominant — keeps the night
  // tree clean and avoids unnecessary animation work.
  if (atmosphere.celestial.type !== 'sun') return null

  return (
    <div className="sky-wildlife" aria-hidden>
      {/* ── Birds — a small flock crossing every ~50s ── */}
      <div className="sky-bird sky-bird--lead">
        <BirdSilhouette />
      </div>
      <div className="sky-bird sky-bird--wing-l">
        <BirdSilhouette />
      </div>
      <div className="sky-bird sky-bird--wing-r">
        <BirdSilhouette />
      </div>

      {/* ── Butterflies — two fluttering shapes ── */}
      <div className="sky-butterfly sky-butterfly--a">
        <ButterflySilhouette tint="rgba(255, 200, 130, 0.85)" />
      </div>
      <div className="sky-butterfly sky-butterfly--b">
        <ButterflySilhouette tint="rgba(255, 175, 200, 0.78)" />
      </div>
    </div>
  )
}

/**
 * Bird silhouette — two-stroke "M" shape that flips between rest and
 * spread via a CSS keyframe on `.bird-wings` (defined in globals.css).
 */
function BirdSilhouette() {
  return (
    <svg viewBox="0 0 40 14" width="100%" height="100%">
      <path
        className="bird-wings"
        d="M 2 10 Q 10 2 20 9 Q 30 2 38 10"
        fill="none"
        stroke="rgba(20, 25, 35, 0.65)"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Butterfly silhouette — four wing lobes in a tinted color. Wings
 * flutter via the `butterfly-wings` keyframe on the inner group.
 */
function ButterflySilhouette({ tint }: { tint: string }) {
  return (
    <svg viewBox="0 0 24 20" width="100%" height="100%">
      <g className="butterfly-wings" style={{ transformOrigin: 'center' }}>
        {/* Left wings */}
        <ellipse cx="7"  cy="7"  rx="5.5" ry="4.2" fill={tint} />
        <ellipse cx="8"  cy="13" rx="4.2" ry="3.4" fill={tint} opacity="0.85" />
        {/* Right wings */}
        <ellipse cx="17" cy="7"  rx="5.5" ry="4.2" fill={tint} />
        <ellipse cx="16" cy="13" rx="4.2" ry="3.4" fill={tint} opacity="0.85" />
      </g>
      {/* Body */}
      <ellipse cx="12" cy="10" rx="0.7" ry="4.5" fill="rgba(20,25,35,0.7)" />
    </svg>
  )
}
