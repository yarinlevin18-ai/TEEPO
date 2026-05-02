'use client'

import { useMemo, useState } from 'react'
import { PlanWizard } from '@/components/exam/PlanWizard'
import { TodayCard } from '@/components/exam/TodayCard'
import { MacroView } from '@/components/exam/MacroView'
import { DayFinishDialog, type CompletionVerdict } from '@/components/exam/DayFinishDialog'
import { useExamStore } from '@/lib/exam/use-exam-store'
import { api } from '@/lib/api-client'
import type { StudyPlan, StudyPlanDay, DayStatus, Exam } from '@/types'

type Tab = 'micro' | 'macro'

const VERDICT_TO_STATUS: Record<CompletionVerdict, DayStatus> = {
  all: 'completed',
  partial: 'in_progress',
  none: 'missed',
}

export default function PlanPage({ params }: { params: { examId: string } }) {
  const store = useExamStore()
  const exam: Exam | null = store.exams.find((e) => e.id === params.examId) ?? null
  const plan: StudyPlan | null = store.getPlanByExam(params.examId)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('micro')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  // Pick the first non-completed day at or after today; fall back to the
  // current date's day, then the first day in the plan. The user can override
  // by clicking a day in macro view.
  const focusedDay = useMemo<StudyPlanDay | undefined>(() => {
    if (!plan) return undefined
    if (selectedDate) {
      const exact = plan.days.find((d) => d.date === selectedDate)
      if (exact) return exact
    }
    const exact = plan.days.find((d) => d.date === today)
    if (exact && exact.status !== 'completed') return exact
    const upcoming = plan.days.find((d) => d.date >= today && d.status !== 'completed')
    return upcoming ?? exact ?? plan.days[0]
  }, [plan, selectedDate, today])
  const daysRemaining = plan ? Math.max(0, daysBetween(today, plan.exam_date)) : null

  // ---- Mutations ----

  const updatePlan = (next: StudyPlan) => {
    void store.savePlan(next)
  }

  const toggleActivity = (activityIndex: number, done: boolean) => {
    if (!plan || !focusedDay) return
    const nextActivities = focusedDay.planned_activities.map((a, i) =>
      i === activityIndex ? { ...a, done } : a,
    )
    const nextDay: StudyPlanDay = {
      ...focusedDay,
      planned_activities: nextActivities,
      status:
        nextActivities.every((a) => a.done) && nextActivities.length > 0
          ? focusedDay.status === 'completed'
            ? 'completed'
            : 'in_progress'
          : nextActivities.some((a) => a.done)
          ? 'in_progress'
          : focusedDay.status === 'completed'
          ? 'completed'
          : 'upcoming',
    }
    updatePlan({
      ...plan,
      days: plan.days.map((d) => (d.id === focusedDay.id ? nextDay : d)),
    })
  }

  const finishDay = (verdict: CompletionVerdict, note?: string) => {
    if (!plan || !focusedDay) return
    const status = VERDICT_TO_STATUS[verdict]
    const nextActivities =
      verdict === 'all'
        ? focusedDay.planned_activities.map((a) => ({ ...a, done: true }))
        : focusedDay.planned_activities

    const nextDay: StudyPlanDay = {
      ...focusedDay,
      planned_activities: nextActivities,
      status,
      completion_note: note,
    }
    updatePlan({
      ...plan,
      days: plan.days.map((d) => (d.id === focusedDay.id ? nextDay : d)),
    })
    setDialogOpen(false)

    // Best-effort rebalance signal.
    api.exam
      .completeDay(plan.id, focusedDay.date, { completion: verdict, note })
      .catch((e) => console.warn('Day completion sync failed:', e.message))
  }

  const onSelectDayFromMacro = (date: string) => {
    setSelectedDate(date)
    setTab('micro')
  }

  // ---- Render ----

  if (!store.ready) {
    return (
      <main dir="rtl" className="p-6 text-zinc-400">
        טוען…
      </main>
    )
  }

  if (!plan) {
    return (
      <main dir="rtl" className="min-h-screen p-6 lg:p-10">
        <PlanWizard
          examId={params.examId}
          examTitle={exam?.title ?? `מבחן #${params.examId}`}
          examDate={exam?.date ?? defaultExamDate(14)}
          examType={exam?.type ?? 'midterm'}
          courseId={exam?.course_id ?? 'local'}
          courseName={exam?.title ?? 'קורס לדוגמה'}
          materials={[]}
          onCancel={() => history.back()}
          onComplete={async (draftPlan) => {
            const persisted: StudyPlan = {
              ...draftPlan,
              id: `plan_${Date.now()}`,
              created_at: new Date().toISOString(),
            }
            await store.savePlan(persisted)
          }}
        />
      </main>
    )
  }

  // ---- Stats summary ----

  const completedDays = plan.days.filter((d) => d.status === 'completed').length
  const inProgressDays = plan.days.filter((d) => d.status === 'in_progress').length
  const missedDays = plan.days.filter((d) => d.status === 'missed').length

  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 space-y-6 max-w-4xl mx-auto">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">תכנית חזרה</h1>
          <p className="text-zinc-400 text-sm mt-1">{exam?.title ?? `מבחן #${params.examId}`}</p>
        </div>
        <div className="text-left">
          <div className="text-xs text-zinc-400">ימים נותרים</div>
          <div className="text-3xl font-bold tabular-nums">{daysRemaining}</div>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="הושלמו" value={String(completedDays)} tone="text-emerald-300" />
        <Stat label="בעבודה" value={String(inProgressDays)} tone="text-amber-300" />
        <Stat label="הוחמצו" value={String(missedDays)} tone="text-red-300" />
      </div>

      <nav className="flex gap-2 border-b border-white/10" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'micro'}
          onClick={() => setTab('micro')}
          className={`px-4 py-2 border-b-2 font-medium transition ${
            tab === 'micro' ? 'border-fuchsia-400 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          היום
        </button>
        <button
          role="tab"
          aria-selected={tab === 'macro'}
          onClick={() => setTab('macro')}
          className={`px-4 py-2 border-b-2 font-medium transition ${
            tab === 'macro' ? 'border-fuchsia-400 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          תצוגת מקרו
        </button>
      </nav>

      {tab === 'micro' ? (
        <TodayCard
          day={focusedDay}
          planId={plan.id}
          examId={params.examId}
          onToggleActivity={toggleActivity}
          onFinishDay={() => setDialogOpen(true)}
        />
      ) : (
        <MacroView
          plan={plan}
          selectedDate={focusedDay?.date}
          onSelectDay={onSelectDayFromMacro}
        />
      )}

      <DayFinishDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={finishDay}
      />
    </main>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

function defaultExamDate(daysFromNow: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to + 'T00:00:00Z').getTime()
  return Math.round((b - a) / 86400000)
}
