'use client'

// Macro view of a study plan — spec §3.2.2 + §5.2.1.
// Calendar grid of every plan day, color-coded by status. Clicking a day
// notifies the parent so it can switch back to the micro tab focused on it.

import { useMemo } from 'react'
import type { DayStatus, StudyPlan, StudyPlanDay, Topic } from '@/types'

interface Props {
  plan: StudyPlan
  selectedDate?: string
  onSelectDay: (date: string) => void
}

const STATUS_COLOR: Record<DayStatus, string> = {
  upcoming: 'bg-zinc-700/50 hover:bg-zinc-700 text-zinc-300',
  in_progress: 'bg-amber-500/30 hover:bg-amber-500/50 text-amber-100',
  completed: 'bg-emerald-500/40 hover:bg-emerald-500/60 text-emerald-50',
  missed: 'bg-red-500/40 hover:bg-red-500/60 text-red-50',
}

const STATUS_LABEL: Record<DayStatus, string> = {
  upcoming: 'עתיד',
  in_progress: 'בעבודה',
  completed: 'הושלם',
  missed: 'הוחמץ',
}

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש']

export function MacroView({ plan, selectedDate, onSelectDay }: Props) {
  const topicsById = useMemo(() => {
    const m = new Map<string, Topic>()
    for (const t of plan.topics) m.set(t.id, t)
    return m
  }, [plan.topics])

  // Bucket days into weeks for grid layout. We render the days in actual
  // calendar columns (Sun..Sat) so empty slots are visually clear.
  const grid = useMemo(() => buildCalendarGrid(plan.days, plan.exam_date), [plan.days, plan.exam_date])

  return (
    <div dir="rtl" className="space-y-5">
      <Legend />

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="grid grid-cols-7 gap-2 text-center text-xs text-zinc-400 mb-2">
          {DAY_LABELS.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="space-y-2">
          {grid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-2">
              {week.map((cell, ci) =>
                cell.kind === 'empty' ? (
                  <div key={`${wi}-${ci}`} className="aspect-square rounded-md bg-transparent" />
                ) : cell.kind === 'exam' ? (
                  <div
                    key={`${wi}-${ci}`}
                    className="aspect-square rounded-md bg-fuchsia-500/40 border-2 border-fuchsia-300 flex flex-col items-center justify-center text-center text-xs font-bold p-1"
                    title={`יום המבחן · ${cell.date}`}
                  >
                    📝
                    <div className="text-[9px] mt-0.5 opacity-80">מבחן</div>
                  </div>
                ) : (
                  <DayCell
                    key={`${wi}-${ci}`}
                    day={cell.day}
                    topicTitle={primaryTopicTitle(cell.day, topicsById)}
                    selected={cell.day.date === selectedDate}
                    onClick={() => onSelectDay(cell.day.date)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Legend() {
  const items: Array<{ status: DayStatus; label: string }> = [
    { status: 'upcoming', label: STATUS_LABEL.upcoming },
    { status: 'in_progress', label: STATUS_LABEL.in_progress },
    { status: 'completed', label: STATUS_LABEL.completed },
    { status: 'missed', label: STATUS_LABEL.missed },
  ]
  return (
    <div className="flex flex-wrap gap-3 text-xs text-zinc-400">
      {items.map((i) => (
        <div key={i.status} className="flex items-center gap-1.5">
          <span className={`inline-block w-3 h-3 rounded ${STATUS_COLOR[i.status].split(' ')[0]}`} />
          {i.label}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded bg-fuchsia-500/40 border border-fuchsia-300" />
        מבחן
      </div>
    </div>
  )
}

function DayCell({
  day,
  topicTitle,
  selected,
  onClick,
}: {
  day: StudyPlanDay
  topicTitle: string
  selected: boolean
  onClick: () => void
}) {
  const dayNumber = parseInt(day.date.split('-')[2], 10)
  return (
    <button
      onClick={onClick}
      title={`${day.date} · ${STATUS_LABEL[day.status]} · ${topicTitle}`}
      aria-label={`${day.date}, ${STATUS_LABEL[day.status]}, ${topicTitle}`}
      className={`aspect-square rounded-md p-1.5 text-right transition flex flex-col justify-between ${
        STATUS_COLOR[day.status]
      } ${selected ? 'ring-2 ring-fuchsia-300 ring-offset-1 ring-offset-zinc-900' : ''}`}
    >
      <div className="text-xs font-bold">{dayNumber}</div>
      <div className="text-[10px] opacity-80 truncate">{topicTitle}</div>
    </button>
  )
}

// ---- Helpers ----

function primaryTopicTitle(day: StudyPlanDay, topics: Map<string, Topic>): string {
  if (day.planned_topics.length === 0) return ''
  const tid = day.planned_topics[0]
  if (tid === 'all') return 'חזרה'
  return topics.get(tid)?.title ?? '—'
}

type Cell =
  | { kind: 'empty' }
  | { kind: 'day'; day: StudyPlanDay }
  | { kind: 'exam'; date: string }

function buildCalendarGrid(days: StudyPlanDay[], examDate: string): Cell[][] {
  if (days.length === 0) return [[{ kind: 'exam', date: examDate }]]

  const first = new Date(days[0].date + 'T00:00:00Z')
  const examD = new Date(examDate + 'T00:00:00Z')

  // Pad start so the first day lines up with its weekday column.
  const startPad = first.getUTCDay()

  const cells: Cell[] = []
  for (let i = 0; i < startPad; i++) cells.push({ kind: 'empty' })

  const dayMap = new Map<string, StudyPlanDay>(days.map((d) => [d.date, d]))
  const cur = new Date(first)
  while (cur < examD) {
    const iso = cur.toISOString().slice(0, 10)
    const day = dayMap.get(iso)
    if (day) cells.push({ kind: 'day', day })
    else cells.push({ kind: 'empty' })
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  cells.push({ kind: 'exam', date: examDate })

  // Pad end to fill the last week.
  while (cells.length % 7 !== 0) cells.push({ kind: 'empty' })

  // Slice into rows of 7.
  const grid: Cell[][] = []
  for (let i = 0; i < cells.length; i += 7) grid.push(cells.slice(i, i + 7))
  return grid
}
