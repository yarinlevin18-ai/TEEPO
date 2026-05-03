'use client'

import Link from 'next/link'
import {
  BookOpen,
  Brain,
  Check,
  CheckCircle2,
  Layers,
  PenLine,
  RefreshCcw,
  Timer,
} from 'lucide-react'
import type { ActivityType, DayStatus, StudyPlanDay } from '@/types'

interface Props {
  day?: StudyPlanDay
  /** Used to build links to the practice/simulation pages. */
  planId?: string
  examId?: string
  /** Toggle a single activity's `done` flag. */
  onToggleActivity?: (activityIndex: number, done: boolean) => void
  /** User clicked "סיים יום" — opens the daily summary dialog. */
  onFinishDay?: () => void
}

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  read: 'קריאה',
  practice: 'תרגול',
  flashcards: 'כרטיסיות',
  simulation: 'סימולציה',
  review: 'חזרה',
}

const ACTIVITY_ICON: Record<ActivityType, React.ReactNode> = {
  read: <BookOpen size={16} />,
  practice: <PenLine size={16} />,
  flashcards: <Layers size={16} />,
  simulation: <Timer size={16} />,
  review: <RefreshCcw size={16} />,
}

const ACTIVITY_TONE: Record<ActivityType, string> = {
  read: 'bg-sky-500/15 text-sky-300',
  practice: 'bg-indigo-500/15 text-indigo-300',
  flashcards: 'bg-amber-500/15 text-amber-300',
  simulation: 'bg-rose-500/15 text-rose-300',
  review: 'bg-emerald-500/15 text-emerald-300',
}

const STATUS_BADGE: Record<DayStatus, { label: string; tone: string }> = {
  upcoming:    { label: 'עתיד',    tone: 'bg-zinc-500/20 text-zinc-300' },
  in_progress: { label: 'בעבודה',  tone: 'bg-amber-500/20 text-amber-300' },
  completed:   { label: 'הושלם',   tone: 'bg-emerald-500/20 text-emerald-300' },
  missed:      { label: 'הוחמץ',   tone: 'bg-red-500/20 text-red-300' },
}

export function TodayCard({
  day,
  planId,
  examId,
  onToggleActivity,
  onFinishDay,
}: Props) {
  if (!day) {
    return (
      <div className="exam-card-strong p-6 text-center space-y-2">
        <div className="text-4xl">📋</div>
        <h3 className="font-bold">אין משימות להיום</h3>
        <p className="text-sm text-zinc-400">בנה תכנית כדי לקבל משימות יומיות.</p>
      </div>
    )
  }

  const totalMinutes = day.planned_activities.reduce((s, a) => s + a.minutes, 0)
  const doneCount = day.planned_activities.filter((a) => a.done).length
  const allDone = day.planned_activities.length > 0 && doneCount === day.planned_activities.length
  const progressPct = day.planned_activities.length > 0 ? (doneCount / day.planned_activities.length) * 100 : 0
  const badge = STATUS_BADGE[day.status]

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
    <div className="exam-card-strong p-5 lg:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`exam-pill ${badge.tone}`}>{badge.label}</span>
            <span className="text-xs text-zinc-500">{day.date}</span>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <h3 className="text-xl font-bold">המשימות של היום</h3>
            <span className="text-sm text-zinc-400 tabular-nums">
              {totalMinutes} דקות · {doneCount}/{day.planned_activities.length}
            </span>
          </div>
        </div>
        {onFinishDay && day.status !== 'completed' && (
          <button
            onClick={onFinishDay}
            className={allDone ? 'exam-cta exam-cta-success text-sm' : 'exam-cta text-sm'}
          >
            {allDone ? <><CheckCircle2 size={16} /> סיים יום</> : 'דווח על היום'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-2.5 rounded-full bg-zinc-800/80 overflow-hidden">
        <div
          className="h-full bg-gradient-to-l from-emerald-400 via-amber-300 to-indigo-400 transition-all"
          style={{ width: `${Math.max(progressPct, 4)}%` }}
        />
      </div>

      {/* Activities */}
      <ul className="space-y-2" role="list">
        {day.planned_activities.map((a, i) => {
          const href = activityHref(a.type, a.topic_id)
          const tone = ACTIVITY_TONE[a.type]

          const inner = (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  onToggleActivity?.(i, !a.done)
                }}
                disabled={!onToggleActivity}
                aria-pressed={a.done}
                aria-label={a.instruction}
                className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition disabled:cursor-default ${
                  a.done
                    ? 'bg-emerald-500 border-emerald-500 text-zinc-900'
                    : 'border-zinc-600 hover:border-zinc-400'
                }`}
              >
                {a.done && <Check size={14} strokeWidth={3} />}
              </button>

              <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${tone}`}>
                {ACTIVITY_ICON[a.type]}
              </div>

              <div className="flex-1 min-w-0">
                <div
                  className={`text-sm font-semibold leading-tight truncate ${
                    a.done ? 'line-through text-zinc-500' : 'text-zinc-100'
                  }`}
                >
                  {a.instruction}
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  {ACTIVITY_LABEL[a.type] ?? a.type} · {a.minutes} דק׳
                </div>
              </div>

              {href && (
                <span className="shrink-0 text-zinc-500 group-hover:text-zinc-200 transition">←</span>
              )}
            </>
          )

          const baseRow =
            'group flex items-center gap-3 p-3 rounded-xl border transition'
          const idleRow = 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/15'
          const doneRow = 'bg-emerald-500/[0.04] border-emerald-500/15'

          if (href) {
            return (
              <li key={i}>
                <Link href={href} className={`${baseRow} ${a.done ? doneRow : idleRow}`}>
                  {inner}
                </Link>
              </li>
            )
          }
          return (
            <li key={i} className={`${baseRow} ${a.done ? doneRow : idleRow}`}>
              {inner}
            </li>
          )
        })}
      </ul>

      {day.completion_note && (
        <div className="mt-4 text-xs text-zinc-400 italic border-r-2 border-amber-400/40 pr-2">
          {day.completion_note}
        </div>
      )}
    </div>
  )
}
