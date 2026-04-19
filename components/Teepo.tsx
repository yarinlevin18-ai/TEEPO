'use client'

import type { CSSProperties } from 'react'

export type TeepoState =
  | 'idle' | 'happy' | 'thinking' | 'sassy'
  | 'sleep' | 'alert' | 'celebrate' | 'error'

interface Props {
  state?: TeepoState
  size?: number
  className?: string
}

export default function Teepo({ state = 'idle', size = 140, className = '' }: Props) {
  return (
    <div
      className={`teepo ${className}`}
      data-state={state}
      style={{ '--teepo-size': `${size}px` } as CSSProperties}
    >
      <svg viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg" overflow="visible">
        <defs>
          <linearGradient id="teepoBodyGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#8B7FF0" />
            <stop offset="50%"  stopColor="#6B5BE5" />
            <stop offset="100%" stopColor="#4C3DB8" />
          </linearGradient>
          <linearGradient id="teepoBodyHi" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.4)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* antenna */}
        <g className="t-ant-group">
          <line className="t-ant-stick" x1="50" y1="28" x2="50" y2="14" />
          <circle className="t-ant-tip" cx="50" cy="12" r="5" />
        </g>

        {/* body */}
        <rect
          className="t-body"
          x="18" y="28" width="64" height="72" rx="32" ry="32"
          fill="url(#teepoBodyGrad)"
          stroke="rgba(255,255,255,0.15)" strokeWidth="1"
        />
        <rect x="22" y="32" width="56" height="30" rx="28" ry="14" fill="url(#teepoBodyHi)" opacity="0.5" />

        {/* face */}
        <rect className="t-face" x="26" y="42" width="48" height="34" rx="17" ry="17" />

        {/* cheeks */}
        <circle className="t-cheek" cx="32" cy="70" r="4" />
        <circle className="t-cheek" cx="68" cy="70" r="4" />

        {/* eyes — normal */}
        <g className="t-eyes-normal">
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
      </svg>
    </div>
  )
}
