'use client'

import Link from 'next/link'
import type { ActivityType, StudyPlanDay } from '@/types'

interface Props {
  day?: StudyPlanDay
  /** Used to build links to the practice/simulation pages. */
  planId?: string
  examId?: string
}

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  read: 'קריאה',
  practice: 'תרגול',
  flashcards: 'כרטיסיות',
  simulation: 'סימולציה',
  review: 'חזרה',
}

export function TodayCard({ day, planId, examId }: Props) {
  if (!day) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <div className="text-xs uppercase tracking-wide text-fuchsia-300 mb-2">היום שלי</div>
        <p className="text-zinc-300">בחר מבחן כדי לבנות תכנית.</p>
      </div>
    )
  }

  const totalMinutes = day.planned_activities.reduce((s, a) => s + a.minutes, 0)
  const doneMinutes = day.planned_activities.filter((a) => a.done).reduce((s, a) => s + a.minutes, 0)

  const activityHref = (type: ActivityType, topicId: string): string | null => {
    if (!planId) return null
    const examQs = examId ? `&examId=${encodeURIComponent(examId)}` : ''
    if (type === 'practice') {
      return `/exam/practice/${planId}?topic=${encodeURIComponent(topicId)}${examQs}`
    }
    if (type === 'flashcards') {
      return `/exam/practice/${planId}?topic=${encodeURIComponent(topicId)}&kind=flashcard${examQs}`
    }
    if (type === 'simulation' && examId) {
      return `/exam/simulation/${examId}`
    }
    return null
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-blue-500/10 p-6">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-fuchsia-300">היום שלי · {day.date}</div>
          <div className="text-2xl font-bold mt-1">{totalMinutes} דקות</div>
        </div>
        <button className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold">
          התחל יום
        </button>
      </div>

      <ul className="space-y-2" role="list">
        {day.planned_activities.map((a, i) => {
          const href = activityHref(a.type, a.topic_id)
          const inner = (
            <>
              <input
                type="checkbox"
                defaultChecked={a.done}
                aria-label={a.instruction}
                className="w-5 h-5 shrink-0"
                onClick={(e) => e.stopPropagation()}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{a.instruction}</div>
                <div className="text-xs text-zinc-400">
                  {a.minutes} דקות · {ACTIVITY_LABEL[a.type] ?? a.type}
                </div>
              </div>
              {href && (
                <span className="text-fuchsia-300 text-sm shrink-0" aria-hidden>
                  ←
                </span>
              )}
            </>
          )
          if (href) {
            return (
              <li key={i}>
                <Link
                  href={href}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition"
                >
                  {inner}
                </Link>
              </li>
            )
          }
          return (
            <li key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
              {inner}
            </li>
          )
        })}
      </ul>

      <div className="mt-4 h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full bg-gradient-to-l from-fuchsia-400 to-cyan-400 transition-all"
          style={{ width: `${totalMinutes > 0 ? (doneMinutes / totalMinutes) * 100 : 0}%` }}
        />
      </div>
    </div>
  )
}
