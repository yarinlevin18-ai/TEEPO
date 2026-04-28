'use client'

/**
 * SkyScene — fixed-position background that renders the four atmosphere
 * layers behind the dashboard:
 *   1. Base wash      (var(--bg1) → var(--bg2) gradient)
 *   2. Glow halo      (warm/cool radial centered on sun position + bottom)
 *   3. Sun or moon    (CSS pseudo-element body, positioned by --sun-x/y)
 *   4. Grain          (subtle dot texture for materiality)
 *
 * The component itself reads no React state — all motion comes from CSS
 * custom properties written by LivingDayProvider. Type of celestial body
 * is communicated via `data-celestial="sun" | "moon"` on <html> by the
 * provider; we read it via a single `useLivingDay()` call to flip the
 * right class. Particle layer (weather) is added in Stage I.
 */

import { useLivingDay } from '@/lib/living-day-context'

export default function SkyScene() {
  const { atmosphere } = useLivingDay()
  const bodyType = atmosphere.celestial.type
  return (
    <div className="sky-scene" aria-hidden>
      <div className="sky-scene__base" />
      <div className="sky-scene__glow" />
      <div className={`sky-scene__body sky-scene__body--${bodyType}`} />
      <div className="sky-scene__grain" />
    </div>
  )
}
