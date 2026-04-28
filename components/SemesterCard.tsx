'use client'

/**
 * Compact semester rail — slim, single-line strip with a progress bar
 * and inline week / days-remaining badges. The greeting already names
 * the semester, so this just shows progress at a glance.
 */

import { motion } from 'framer-motion'
import Link from 'next/link'
import { getSemesterStatus } from '@/lib/academic-calendar'

export default function SemesterCard() {
  const s = getSemesterStatus()

  // Hide entirely on holiday / no progress info.
  if (s.progress == null && s.daysRemaining == null && s.daysUntilNext == null) {
    return null
  }

  const days = s.daysRemaining ?? s.daysUntilNext ?? null
  const daysLabel = s.daysRemaining != null ? 'לסוף' : s.daysUntilNext != null ? `ל${s.nextLabel}` : ''

  return (
    <Link href="/university" className="block">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 px-3 py-2 rounded-xl text-[11px] text-ink-muted hover:bg-white/[0.03] transition-colors"
      >
        {/* Week pill */}
        {s.weekNumber && (
          <span
            className="px-1.5 py-0.5 rounded-md whitespace-nowrap"
            style={{
              background: 'rgba(var(--glow1), 0.10)',
              color: 'var(--accent)',
              border: '0.5px solid rgba(var(--glow1), 0.28)',
            }}
          >
            שבוע {s.weekNumber}/{s.totalWeeks}
          </span>
        )}

        {/* Progress bar — flexes to fill */}
        {s.progress != null && (
          <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden min-w-[60px]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(s.progress * 100).toFixed(0)}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: 'var(--accent)', opacity: 0.7 }}
            />
          </div>
        )}

        {/* Days remaining inline */}
        {days != null && (
          <span className="whitespace-nowrap">
            <span className="text-ink font-medium">{days}</span> ימים {daysLabel}
          </span>
        )}
      </motion.div>
    </Link>
  )
}
