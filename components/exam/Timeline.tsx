'use client'

import Link from 'next/link'
import { Calendar } from 'lucide-react'
import type { Exam } from '@/types'

interface Props {
  exams?: Exam[]
}

interface Urgency {
  ringClass: string
  pillBg: string
  pillText: string
  numClass: string
  label: string
}

function urgency(daysAway: number): Urgency {
  if (daysAway <= 7) {
    return {
      ringClass: 'border-red-500/40 bg-gradient-to-br from-red-500/15 to-red-500/[0.03]',
      pillBg: 'bg-red-500/20',
      pillText: 'text-red-300',
      numClass: 'text-red-200',
      label: 'דחוף',
    }
  }
  if (daysAway <= 21) {
    return {
      ringClass: 'border-amber-500/40 bg-gradient-to-br from-amber-500/15 to-amber-500/[0.03]',
      pillBg: 'bg-amber-500/20',
      pillText: 'text-amber-300',
      numClass: 'text-amber-200',
      label: 'בקרוב',
    }
  }
  return {
    ringClass: 'border-emerald-500/40 bg-gradient-to-br from-emerald-500/15 to-emerald-500/[0.03]',
    pillBg: 'bg-emerald-500/20',
    pillText: 'text-emerald-300',
    numClass: 'text-emerald-200',
    label: 'יש זמן',
  }
}

const TYPE_LABEL: Record<Exam['type'], string> = {
  midterm: 'אמצע',
  final: 'סוף',
  makeup: 'מועד ב',
}

export function Timeline({ exams = [] }: Props) {
  const today = new Date().toISOString().slice(0, 10)

  if (exams.length === 0) {
    return (
      <div className="exam-card p-8 text-center text-zinc-400">
        אין מבחנים בציר הזמן. הוסף מבחן ידנית או סנכרן את הפורטל.
      </div>
    )
  }

  const sorted = [...exams].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-2 px-2 snap-x" role="list">
      {sorted.map((exam) => {
        const days = Math.max(0, daysBetween(today, exam.date))
        const u = urgency(days)
        return (
          <Link
            key={exam.id}
            href={`/exam/plan/${exam.id}`}
            role="listitem"
            className={`group min-w-[220px] snap-start rounded-2xl border p-4 transition hover:scale-[1.02] hover:shadow-lg ${u.ringClass}`}
          >
            <div className="flex items-center justify-between">
              <span className={`exam-pill ${u.pillBg} ${u.pillText}`}>{u.label}</span>
              <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                <Calendar size={10} />
                {TYPE_LABEL[exam.type]}
              </span>
            </div>
            <div className="font-bold mt-3 leading-tight text-zinc-100 line-clamp-2 min-h-[2.5rem]">
              {exam.title}
            </div>
            <div className="flex items-baseline justify-between mt-3">
              <div className={`text-3xl font-black tabular-nums ${u.numClass}`}>{days}</div>
              <div className="text-[10px] text-zinc-500">{exam.date}</div>
            </div>
            <div className="text-[11px] text-zinc-400 mt-1">ימים נותרים</div>
          </Link>
        )
      })}
    </div>
  )
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86400000)
}
