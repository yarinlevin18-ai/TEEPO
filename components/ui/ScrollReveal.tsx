'use client'

import { motion } from 'framer-motion'
import { ReactNode } from 'react'

interface ScrollRevealProps {
  children: ReactNode
  /** Delay in seconds before animation starts */
  delay?: number
  /** Direction the element slides in from (RTL-aware: 'right' is the natural reading start) */
  direction?: 'up' | 'down' | 'right' | 'left'
  /** Duration of the animation in seconds */
  duration?: number
  /** Additional className */
  className?: string
  /** Whether to animate only once */
  once?: boolean
}

const directionMap = {
  up:    { y: 20, x: 0 },
  down:  { y: -20, x: 0 },
  right: { y: 0, x: 12 },
  left:  { y: 0, x: -12 },
}

export default function ScrollReveal({
  children,
  delay = 0,
  direction = 'up',
  duration = 0.5,
  className = '',
  once = true,
}: ScrollRevealProps) {
  const offset = directionMap[direction]

  return (
    <motion.div
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once, margin: '-60px' }}
      transition={{
        duration,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94],
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Use inside a parent to stagger children */
export function ScrollRevealGroup({
  children,
  staggerDelay = 0.08,
  direction = 'up',
  className = '',
}: {
  children: ReactNode[]
  staggerDelay?: number
  direction?: 'up' | 'down' | 'right' | 'left'
  className?: string
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <ScrollReveal key={i} delay={i * staggerDelay} direction={direction}>
          {child}
        </ScrollReveal>
      ))}
    </div>
  )
}
