'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

export type TeepoState =
  | 'idle' | 'happy' | 'thinking' | 'sassy'
  | 'sleep' | 'alert' | 'celebrate' | 'error'

interface Props {
  state?: TeepoState
  size?: number
  className?: string
}

/**
 * Cursor tracking — the eyes drift up to ±EYE_REACH px toward the mouse,
 * and the head/antenna tilt slightly the same way so the whole mascot
 * appears to follow the cursor instead of just darting his eyes.
 *
 * Works only when the mascot is awake. The 'sleep' and 'error' states
 * keep their stylized eye treatment and skip the tracking.
 */
const EYE_REACH = 1.8        // SVG units (viewBox), eye pupil drift max
const HEAD_TILT_DEG = 4      // max body/head rotation in degrees
const ANTENNA_TILT_DEG = 8   // antenna tips a bit further than the head

export default function Teepo({ state = 'idle', size = 140, className = '' }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [eyeX, setEyeX] = useState(0)
  const [eyeY, setEyeY] = useState(0)
  const [tilt, setTilt] = useState(0)

  const trackingDisabled = state === 'sleep' || state === 'error'

  useEffect(() => {
    if (trackingDisabled || typeof window === 'undefined') return

    let frame: number | null = null
    let nextX = 0
    let nextY = 0
    let nextTilt = 0

    function flush() {
      frame = null
      setEyeX(nextX)
      setEyeY(nextY)
      setTilt(nextTilt)
    }

    function onMove(e: MouseEvent) {
      const node = wrapperRef.current
      if (!node) return
      const rect = node.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      // Normalize to a ±1 vector that saturates at ~280px distance.
      const nx = Math.max(-1, Math.min(1, dx / 280))
      const ny = Math.max(-1, Math.min(1, dy / 280))
      nextX = nx * EYE_REACH
      nextY = ny * EYE_REACH
      nextTilt = nx * HEAD_TILT_DEG
      if (frame === null) frame = requestAnimationFrame(flush)
    }

    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [trackingDisabled])

  // CSS variables used by inline styles for smooth transforms.
  const headStyle: CSSProperties = {
    transform: `rotate(${tilt}deg)`,
    transformOrigin: '50% 92%',
    transition: 'transform 200ms ease-out',
  }
  const antennaStyle: CSSProperties = {
    transform: `rotate(${tilt * (ANTENNA_TILT_DEG / HEAD_TILT_DEG)}deg)`,
    transformOrigin: '50px 28px',
    transition: 'transform 220ms ease-out',
  }
  const eyeStyle: CSSProperties = {
    transform: `translate(${eyeX}px, ${eyeY}px)`,
    transition: 'transform 140ms ease-out',
  }

  return (
    <div
      ref={wrapperRef}
      className={`teepo ${className}`}
      data-state={state}
      style={{ '--teepo-size': `${size}px` } as CSSProperties}
    >
      <svg viewBox="-20 -20 140 150" xmlns="http://www.w3.org/2000/svg" overflow="visible">
        <defs>
          <linearGradient id="teepoBodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#bae6fd" />
            <stop offset="45%"  stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>
          <linearGradient id="teepoBodyHi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
          <radialGradient id="teepoHalo" cx="50%" cy="55%" r="55%">
            <stop offset="0%"   stopColor="rgba(125, 211, 252, 0.20)" />
            <stop offset="55%"  stopColor="rgba(56, 189, 248, 0.06)" />
            <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
          </radialGradient>
        </defs>

        {/* halo — stays put even when the head tilts */}
        <ellipse cx="50" cy="64" rx="65" ry="60" fill="url(#teepoHalo)" />

        {/* head group — body + face + features rotate together with cursor tilt */}
        <g style={headStyle}>
          {/* antenna — tilts a touch further than the body for personality */}
          <g className="t-ant-group" style={antennaStyle}>
            <line className="t-ant-stick" x1="50" y1="28" x2="50" y2="14" />
            <circle className="t-ant-tip" cx="50" cy="12" r="5" />
          </g>

          {/* body */}
          <rect
            className="t-body"
            x="18" y="28" width="64" height="72" rx="32" ry="32"
            fill="url(#teepoBodyGrad)"
            stroke="rgba(186, 230, 253, 0.55)" strokeWidth="1.4"
          />
          <rect x="22" y="32" width="56" height="30" rx="28" ry="14" fill="url(#teepoBodyHi)" opacity="0.65" />

          {/* face */}
          <rect className="t-face" x="26" y="42" width="48" height="34" rx="17" ry="17" />

          {/* cheeks */}
          <circle className="t-cheek" cx="32" cy="70" r="4" />
          <circle className="t-cheek" cx="68" cy="70" r="4" />

          {/* eyes — normal, tracked by cursor */}
          <g className="t-eyes-normal" style={eyeStyle}>
            <circle className="t-eye left"  cx="41" cy="57" r="4.5" />
            <circle className="t-eye right" cx="59" cy="57" r="4.5" />
          </g>

          {/* eyes — error */}
          <g
            className="t-eyes-error"
            stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round" fill="none"
            style={{ filter: 'drop-shadow(0 0 4px #FF6B6B)' }}
          >
            <line x1="37" y1="53" x2="45" y2="61" />
            <line x1="45" y1="53" x2="37" y2="61" />
            <line x1="55" y1="53" x2="63" y2="61" />
            <line x1="63" y1="53" x2="55" y2="61" />
          </g>

          {/* mouth */}
          <path className="t-mouth" d="M 42 67 L 58 67" />

          {/* thinking dots */}
          <g className="t-think-dots">
            <circle cx="80" cy="42" r="2" />
            <circle cx="86" cy="38" r="2.5" />
            <circle cx="93" cy="33" r="3" />
          </g>

          {/* sleep Zzz */}
          <g className="t-zzz">
            <text x="72" y="38" fontSize="9">z</text>
            <text x="78" y="30" fontSize="11">z</text>
            <text x="84" y="22" fontSize="13">Z</text>
          </g>

          {/* confetti */}
          <g className="t-confetti">
            <rect x="10" y="30" width="4" height="8" rx="1" style={{ '--dx': '-15px' } as CSSProperties} />
            <rect x="90" y="30" width="4" height="8" rx="1" style={{ '--dx': '15px'  } as CSSProperties} />
            <rect x="15" y="25" width="3" height="6" rx="1" style={{ '--dx': '-8px'  } as CSSProperties} />
            <rect x="85" y="35" width="5" height="5" rx="1" style={{ '--dx': '12px'  } as CSSProperties} />
            <rect x="5"  y="40" width="4" height="7" rx="1" style={{ '--dx': '-18px' } as CSSProperties} />
            <rect x="95" y="40" width="3" height="6" rx="1" style={{ '--dx': '18px'  } as CSSProperties} />
            <rect x="20" y="20" width="4" height="4" rx="1" style={{ '--dx': '-10px' } as CSSProperties} />
            <rect x="80" y="20" width="4" height="4" rx="1" style={{ '--dx': '10px'  } as CSSProperties} />
          </g>
        </g>
      </svg>
    </div>
  )
}
