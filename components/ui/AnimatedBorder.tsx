'use client'

import type { ReactNode } from 'react'

interface AnimatedBorderProps {
  children: ReactNode
  className?: string
  speed?: number
  gradient?: string
}

/**
 * Card wrapped in a continuously-rotating conic gradient border.
 * Use sparingly on 1-2 "feature" cards per page for emphasis.
 */
export default function AnimatedBorder({
  children,
  className = '',
  speed = 3,
  gradient,
}: AnimatedBorderProps) {
  const grad =
    gradient ||
    'conic-gradient(from 0deg, transparent 0%, #6366f1 10%, #8b5cf6 20%, #06b6d4 30%, transparent 40%)'

  return (
    <div className={`relative rounded-2xl p-px overflow-hidden ${className}`}>
      {/* Rotating gradient that peeks through the 1 px gap */}
      <div
        className="absolute inset-0 rounded-2xl overflow-hidden"
        aria-hidden
      >
        <div
          className="absolute w-[300%] h-[300%] top-[-100%] left-[-100%]"
          style={{
            background: grad,
            animation: `spin ${speed}s linear infinite`,
          }}
        />
      </div>

      {/* Subtle outer glow */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          boxShadow: '0 0 20px rgba(99,102,241,0.18), 0 0 60px rgba(139,92,246,0.08)',
        }}
        aria-hidden
      />

      {/* Inner card body */}
      <div className="relative rounded-[15px] animated-border-inner overflow-hidden">
        {children}
      </div>
    </div>
  )
}
