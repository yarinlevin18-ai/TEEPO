'use client'

/**
 * <AnalogClock /> — generic SVG analog clock face.
 *
 * Used as the base for <CountryClock />: the country variant fills the face
 * with a flag pattern via the `faceFill` slot, but the hour/minute/second
 * hand math + tick marks are identical. Source: mockup_dashboard.html
 * `<svg class="mini-clock">` and the country-clock face.
 *
 * `time` controls what the hands show. If omitted, the clock follows the
 * user's local time and ticks once per second. `utcOffset` is for country
 * clocks: hands show local time at that UTC offset. Pass null/undefined to
 * use the user's wall clock.
 */
import { useEffect, useState } from 'react'

interface Props {
  /** Diameter in px. Default 42 (matches the dashboard mini-clock). */
  size?: number
  /** UTC offset in hours (e.g. 9 for Japan). null = local time. */
  utcOffset?: number | null
  /** Override colors for the face/ring/ticks/hands. */
  ringColor?: string
  faceColor?: string
  tickColor?: string
  /** Render a custom SVG inside the clipped face (e.g. a flag). */
  faceContent?: React.ReactNode
  /** Static time for screenshots / tests. Otherwise auto-ticks. */
  time?: { h: number; m: number; s: number }
  className?: string
}

function localAtOffset(offset: number | null | undefined): { h: number; m: number; s: number } {
  const now = new Date()
  if (offset == null) {
    return { h: now.getHours(), m: now.getMinutes(), s: now.getSeconds() }
  }
  const utc = now.getTime() + now.getTimezoneOffset() * 60_000
  const local = new Date(utc + offset * 3_600_000)
  return { h: local.getHours(), m: local.getMinutes(), s: local.getSeconds() }
}

export default function AnalogClock({
  size = 42,
  utcOffset = null,
  ringColor = '#3a4a3d',
  faceColor = '#fffaf0',
  tickColor = '#1a1410',
  faceContent,
  time,
  className = '',
}: Props) {
  const [t, setT] = useState<{ h: number; m: number; s: number } | null>(null)

  useEffect(() => {
    if (time) { setT(time); return }
    setT(localAtOffset(utcOffset))
    const id = setInterval(() => setT(localAtOffset(utcOffset)), 1000)
    return () => clearInterval(id)
  }, [time, utcOffset])

  // SSR placeholder — render hands at 12 to avoid hydration mismatch.
  const { h, m, s } = t ?? { h: 0, m: 0, s: 0 }
  // Hour hand: 30° per hour + 0.5° per minute for smooth motion
  const hourRot = ((h % 12) + m / 60) * 30
  const minRot = (m + s / 60) * 6
  const secRot = s * 6

  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={`analog-clock ${className}`.trim()}
      style={{ width: size, height: size, filter: 'drop-shadow(0 2px 5px rgba(91,70,52,.2))' }}
      aria-label="analog clock"
    >
      <defs>
        <clipPath id="clockFaceClip"><circle cx="50" cy="50" r="45" /></clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill={ringColor} />
      <g clipPath="url(#clockFaceClip)">
        <rect x="0" y="0" width="100" height="100" fill={faceColor} />
        {/* Wash the flag down so the hands read clearly on top. Without
            this the saturated reds/greens swallow the dark hour hand on
            a 42 px display. */}
        {faceContent && <g opacity={0.45}>{faceContent}</g>}
        {/* Center disk so the pivot + hand bases sit on a clean white
            puck — keeps the hour hand legible even on a busy flag. */}
        <circle cx="50" cy="50" r="22" fill={faceColor} opacity={0.55} />
      </g>
      {/* 12 hour ticks with a stronger halo so they survive any flag */}
      <g stroke={tickColor} strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 1.4px rgba(255,255,255,.95))' }}>
        <line x1="50"    y1="6"     x2="50"    y2="14"    strokeWidth="3" />
        <line x1="73"    y1="12.16" x2="71"    y2="15.62" strokeWidth="1.5" />
        <line x1="87.84" y1="27"    x2="84.38" y2="29"    strokeWidth="1.5" />
        <line x1="94"    y1="50"    x2="86"    y2="50"    strokeWidth="3" />
        <line x1="87.84" y1="73"    x2="84.38" y2="71"    strokeWidth="1.5" />
        <line x1="73"    y1="87.84" x2="71"    y2="84.38" strokeWidth="1.5" />
        <line x1="50"    y1="94"    x2="50"    y2="86"    strokeWidth="3" />
        <line x1="27"    y1="87.84" x2="29"    y2="84.38" strokeWidth="1.5" />
        <line x1="12.16" y1="73"    x2="15.62" y2="71"    strokeWidth="1.5" />
        <line x1="6"     y1="50"    x2="14"    y2="50"    strokeWidth="3" />
        <line x1="12.16" y1="27"    x2="15.62" y2="29"    strokeWidth="1.5" />
        <line x1="27"    y1="12.16" x2="29"    y2="15.62" strokeWidth="1.5" />
      </g>
      {/* Hands — grouped with a white halo so they stay crisp against
          any face color. Without this the dark hour hand vanishes on
          dark-blue flags (UK, Argentina) and on the red Italian stripe. */}
      <g style={{ filter: 'drop-shadow(0 0 1.6px rgba(255,255,255,.9))' }}>
        <line x1="50" y1="50" x2="50" y2="30" stroke="#2d1810" strokeWidth="3.8" strokeLinecap="round"
              transform={`rotate(${hourRot} 50 50)`}
              style={{ transition: 'transform .3s cubic-bezier(.65,0,.35,1)' }} />
        <line x1="50" y1="50" x2="50" y2="18" stroke="#3a4a3d" strokeWidth="2.6" strokeLinecap="round"
              transform={`rotate(${minRot} 50 50)`}
              style={{ transition: 'transform .3s cubic-bezier(.65,0,.35,1)' }} />
        <line x1="50" y1="50" x2="50" y2="12" stroke="#d97706" strokeWidth="1.3" strokeLinecap="round"
              transform={`rotate(${secRot} 50 50)`}
              style={{ transition: 'transform .1s linear' }} />
        <circle cx="50" cy="50" r="4" fill="#2d1810" />
        <circle cx="50" cy="50" r="1.5" fill="#d97706" />
      </g>
    </svg>
  )
}
