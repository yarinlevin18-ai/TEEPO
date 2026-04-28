'use client'

/**
 * WisdomLine — a soft Hebrew line under the greeting that shifts with
 * the time-of-day phase and current weather. Pulls from LivingDay so
 * the text changes in step with the sky.
 *
 * Visual: low contrast, light weight, single line. Cross-fades when
 * the underlying wisdom changes so transitions feel like a thought
 * settling rather than a UI swap.
 */

import { useLivingDay } from '@/lib/living-day-context'

export default function WisdomLine() {
  const { atmosphere, weather } = useLivingDay()
  const wisdom = atmosphere.phase.wisdom
  // Pair the time wisdom with the weather mood when weather is not the
  // neutral default — this gives a short combined sentence like
  // "הלילה ארוך · יורד גשם".
  const tail = weather !== 'sunny' ? atmosphere.weatherMood : null
  const key = `${wisdom}|${tail ?? ''}`

  // Static render — the dashboard's frequent re-renders fight with
  // CSS animations + framer-motion when keying off (wisdom, weather).
  // Stage J will revisit a smooth crossfade once the dashboard's
  // re-render storm is tamed.
  return (
    <div
      key={key}
      className="mt-1.5 text-[12px] leading-snug text-ink-subtle font-light min-h-[18px]"
      style={{ opacity: 0.85, transition: 'opacity 0.6s ease-out' }}
    >
      {wisdom}
      {tail && <span className="opacity-70"> · {tail}</span>}
    </div>
  )
}
