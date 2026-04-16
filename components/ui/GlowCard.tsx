'use client'

import { useRef, type ReactNode, type CSSProperties } from 'react'

interface GlowCardProps {
  children: ReactNode
  className?: string
  glowColor?: string
  style?: CSSProperties
}

/**
 * Card with cursor-following spotlight & border glow.
 * Uses CSS custom properties for 0-rerender performance.
 */
export default function GlowCard({
  children,
  className = '',
  glowColor,
  style,
}: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null)

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    ref.current.style.setProperty('--glow-x', `${e.clientX - rect.left}px`)
    ref.current.style.setProperty('--glow-y', `${e.clientY - rect.top}px`)
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => ref.current?.classList.add('glow-active')}
      onMouseLeave={() => ref.current?.classList.remove('glow-active')}
      className={`glow-card ${className}`}
      style={{
        ...style,
        '--glow-color': glowColor || 'rgba(99,102,241,0.10)',
      } as CSSProperties}
    >
      <div className="glow-spotlight" />
      <div className="glow-border-fx" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
