'use client'

/**
 * SkyScene — site-wide background that subtly tracks the time of day.
 *
 * Phases (real local clock):
 *   06–08  dawn    : warm dark, sun rising lower-right, last stars fading
 *   08–17  day     : cool blue, sun upper-right, clouds drift, no stars
 *   17–19  dusk    : amber dark, sun setting lower-right, first stars
 *   19–22  evening : deep violet, moon upper-left, stars visible, bats out
 *   22–06  night   : near-black navy, moon upper-left, full starfield, bats
 *
 * Component picks the phase from the user's clock and writes it as a
 * `data-phase` attribute. All animation lives in CSS, gated by
 * `prefers-reduced-motion`.
 */

import { useEffect, useState } from 'react'
import { useLivingDay } from '@/lib/living-day-context'

type Phase = 'night' | 'dawn' | 'day' | 'dusk' | 'evening'

function phaseFromHour(h: number): Phase {
  if (h >= 6 && h < 8) return 'dawn'
  if (h >= 8 && h < 17) return 'day'
  if (h >= 17 && h < 19) return 'dusk'
  if (h >= 19 && h < 22) return 'evening'
  return 'night'
}

/**
 * Optional dev override. Set `NEXT_PUBLIC_SKY_HOUR=12` (or 8, 17, 22, etc.)
 * in `.env.local` to lock the sky to a specific hour for previews. Leave
 * unset to use the user's real clock. Range 0–23, anything else is ignored.
 */
function overrideHour(): number | null {
  const raw = process.env.NEXT_PUBLIC_SKY_HOUR
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= 23 ? n : null
}

export default function SkyScene() {
  const [phase, setPhase] = useState<Phase>('day')
  const { weather } = useLivingDay()

  useEffect(() => {
    const fixed = overrideHour()
    if (fixed !== null) {
      setPhase(phaseFromHour(fixed))
      return
    }
    const update = () => setPhase(phaseFromHour(new Date().getHours()))
    update()
    const id = setInterval(update, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="sky-scene" data-phase={phase} data-weather={weather} aria-hidden>
      <div className="sky-scene__base" />

      <div className="sky-scene__stars">
        {STAR_POSITIONS.map((s, i) => (
          <span
            key={i}
            className={`star star--${s.size}`}
            style={{
              top: `${s.y}%`,
              left: `${s.x}%`,
              animationDelay: `${s.delay}s, ${s.driftDelay}s`,
            }}
          />
        ))}
      </div>

      {/* Sun: outer wrapper holds the halo, .sun-rays rotates behind, disc on top. */}
      <div className="sky-scene__sun">
        <div className="sky-scene__sun-rays" />
        <div className="sky-scene__sun-disc" />
      </div>

      {/* Moon: outer wrapper holds the halo and stays put; inner disc rotates. */}
      <div className="sky-scene__moon">
        <div className="sky-scene__moon-disc" />
      </div>

      <div className="sky-scene__clouds">
        <span className="cloud cloud--1" />
        <span className="cloud cloud--2" />
        <span className="cloud cloud--3" />
        <span className="cloud cloud--4" />
      </div>

      <div className="sky-scene__birds">
        <Bird className="bird bird--1" />
        <Bird className="bird bird--2" />
        <Bird className="bird bird--3" />
        <Bird className="bird bird--4" />
        <Bird className="bird bird--5" />
      </div>

      <div className="sky-scene__bats">
        <Bat className="bat bat--1" />
        <Bat className="bat bat--2" />
        <Bat className="bat bat--3" />
      </div>

      <div className="sky-scene__weather" />

      <div className="sky-scene__aurora" />
      <div className="sky-scene__grid" />
      <div className="sky-scene__vignette" />
    </div>
  )
}

/**
 * Bat — bare bones silhouette. Two SVG paths split the body+wings so the
 * wings can flap independently via CSS `transform: scaleY` on the inner
 * groups. Origin is bottom-center of each wing.
 */
function Bat({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 60 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <g className="bat__wing bat__wing--left">
        <path d="M30 12 L24 6 L16 4 L8 8 L2 4 L4 12 L0 18 L8 16 L16 20 L24 18 L30 12 Z" />
      </g>
      <g className="bat__wing bat__wing--right">
        <path d="M30 12 L36 6 L44 4 L52 8 L58 4 L56 12 L60 18 L52 16 L44 20 L36 18 L30 12 Z" />
      </g>
      {/* Body */}
      <ellipse cx="30" cy="13" rx="2.2" ry="3" />
      {/* Ears */}
      <path d="M28.5 10 L29 7 L30 9 Z" />
      <path d="M31.5 10 L31 7 L30 9 Z" />
    </svg>
  )
}

/**
 * Bird — tiny "M" silhouette. Two paths so wings can flap independently
 * via CSS scaleY on the inner groups. Origin is bottom-center of each wing.
 */
function Bird({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path className="bird__wing bird__wing--left"  d="M2 7 Q5 2 8 6" />
      <path className="bird__wing bird__wing--right" d="M8 6 Q11 2 14 7" />
    </svg>
  )
}

/** Hand-placed star positions; varied drift vectors and delays so the
 * field doesn't pulse in lockstep. */
const STAR_POSITIONS = [
  { x: 8,  y: 12, size: 'md', delay: 0.0, driftDelay: 0.0  },
  { x: 17, y: 6,  size: 'sm', delay: 1.4, driftDelay: 4.0  },
  { x: 22, y: 18, size: 'lg', delay: 2.8, driftDelay: 8.0  },
  { x: 31, y: 9,  size: 'sm', delay: 0.6, driftDelay: 12.0 },
  { x: 39, y: 22, size: 'md', delay: 3.2, driftDelay: 2.0  },
  { x: 47, y: 5,  size: 'md', delay: 1.0, driftDelay: 6.0  },
  { x: 56, y: 16, size: 'sm', delay: 4.5, driftDelay: 10.0 },
  { x: 63, y: 8,  size: 'lg', delay: 2.1, driftDelay: 1.0  },
  { x: 71, y: 20, size: 'sm', delay: 0.3, driftDelay: 5.0  },
  { x: 79, y: 11, size: 'md', delay: 3.9, driftDelay: 9.0  },
  { x: 86, y: 24, size: 'sm', delay: 1.8, driftDelay: 13.0 },
  { x: 93, y: 7,  size: 'md', delay: 4.2, driftDelay: 3.0  },
  { x: 14, y: 28, size: 'sm', delay: 2.4, driftDelay: 7.0  },
  { x: 26, y: 33, size: 'md', delay: 0.9, driftDelay: 11.0 },
  { x: 44, y: 30, size: 'sm', delay: 3.6, driftDelay: 0.5  },
  { x: 52, y: 36, size: 'lg', delay: 1.5, driftDelay: 4.5  },
  { x: 67, y: 32, size: 'sm', delay: 4.8, driftDelay: 8.5  },
  { x: 82, y: 35, size: 'md', delay: 0.2, driftDelay: 12.5 },
  { x: 5,  y: 40, size: 'sm', delay: 2.7, driftDelay: 2.5  },
  { x: 35, y: 42, size: 'sm', delay: 4.1, driftDelay: 6.5  },
  { x: 60, y: 44, size: 'sm', delay: 1.2, driftDelay: 10.5 },
  { x: 77, y: 48, size: 'md', delay: 3.4, driftDelay: 14.5 },
] as const
