'use client'

/**
 * Source badge for a grade row — Moodle / Portal / Manual / DB-cached.
 *
 * Shape: small pill, color-coded by origin so the user can tell at a glance
 * whether a grade was scraped automatically or entered by hand.
 */

import type { GradeSource } from '@/types'

interface Props {
  source?: GradeSource | string | null
  /** Use 'compact' inside dense tables, 'normal' in standalone rows. */
  size?: 'normal' | 'compact'
}

const VARIANTS: Record<string, { label: string; bg: string; color: string; border: string }> = {
  moodle: {
    label: 'Moodle',
    bg: 'rgba(59,130,246,0.12)',
    color: '#93c5fd',
    border: 'rgba(59,130,246,0.30)',
  },
  portal: {
    label: 'פורטל',
    bg: 'rgba(167,139,250,0.12)',
    color: '#c4b5fd',
    border: 'rgba(167,139,250,0.30)',
  },
  manual: {
    label: 'ידני',
    bg: 'rgba(245,158,11,0.12)',
    color: '#fcd34d',
    border: 'rgba(245,158,11,0.30)',
  },
  db: {
    label: 'נשמר',
    bg: 'rgba(148,163,184,0.10)',
    color: '#cbd5e1',
    border: 'rgba(148,163,184,0.25)',
  },
}

export default function GradeSourceBadge({ source, size = 'normal' }: Props) {
  const key = (source || '').toLowerCase()
  const variant = VARIANTS[key] || VARIANTS.db
  const padding = size === 'compact' ? 'px-1.5 py-0' : 'px-2 py-0.5'
  const textSize = size === 'compact' ? 'text-[9px]' : 'text-[10px]'

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${padding} ${textSize}`}
      style={{
        background: variant.bg,
        color: variant.color,
        border: `1px solid ${variant.border}`,
      }}
    >
      {variant.label}
    </span>
  )
}
