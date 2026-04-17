'use client'

/**
 * Compact live semester card — drops into the dashboard.
 * Shows current semester, week, days remaining, progress bar, next event.
 */

import { motion } from 'framer-motion'
import { Calendar, Clock, MapPin, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { getSemesterStatus } from '@/lib/academic-calendar'

export default function SemesterCard() {
  const s = getSemesterStatus()

  return (
    <Link href="/university" className="block">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl p-4 sm:p-5 hover:bg-white/[0.06] transition-colors cursor-pointer group relative overflow-hidden"
      >
        {/* Subtle gradient orb decoration */}
        <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-violet-500/10 blur-2xl pointer-events-none" />

        <div className="relative flex items-center justify-between gap-4 flex-wrap">
          {/* Right side — label + sub */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-500/25 transition-colors">
              <Calendar size={18} className="text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-ink">{s.label}</h3>
                {s.weekNumber && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                    שבוע {s.weekNumber}/{s.totalWeeks}
                  </span>
                )}
              </div>
              {s.nextEvent ? (
                <p className="text-[11px] text-ink-muted mt-1 flex items-center gap-1.5 truncate">
                  <MapPin size={10} className="text-amber-400 flex-shrink-0" />
                  <span className="truncate">
                    {s.nextEvent.name} · עוד {s.nextEvent.daysUntil} ימים
                  </span>
                </p>
              ) : s.daysUntilNext ? (
                <p className="text-[11px] text-ink-muted mt-1">
                  עוד {s.daysUntilNext} ימים ל{s.nextLabel}
                </p>
              ) : null}
            </div>
          </div>

          {/* Left side — big number */}
          {s.daysRemaining != null ? (
            <div className="text-right flex-shrink-0">
              <p className="text-2xl sm:text-3xl font-extrabold gradient-text leading-none">
                {s.daysRemaining}
              </p>
              <p className="text-[10px] text-ink-muted mt-1">ימים לסוף</p>
            </div>
          ) : s.daysUntilNext ? (
            <div className="text-right flex-shrink-0">
              <p className="text-2xl sm:text-3xl font-extrabold gradient-text leading-none">
                {s.daysUntilNext}
              </p>
              <p className="text-[10px] text-ink-muted mt-1">עד לפתיחה</p>
            </div>
          ) : (
            <div className="flex-shrink-0 flex items-center gap-1.5 text-xs text-ink-muted">
              <Clock size={12} />
              <span>חופשה</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        {s.progress != null && (
          <div className="relative mt-3 w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(s.progress * 100).toFixed(0)}%` }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6)' }}
            />
          </div>
        )}
      </motion.div>
    </Link>
  )
}
