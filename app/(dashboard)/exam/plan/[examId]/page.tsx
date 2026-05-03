'use client'

import { useMemo, useState } from 'react'
import { PlanWizard } from '@/components/exam/PlanWizard'
import { TodayCard } from '@/components/exam/TodayCard'
import { MacroView } from '@/components/exam/MacroView'
import { DayFinishDialog, type CompletionVerdict } from '@/components/exam/DayFinishDialog'
import { useExamStore } from '@/lib/exam/use-exam-store'
import { api } from '@/lib/api-client'
import { pointsForDay, examPoints, rankFor, nextRank, rankProgress } from '@/lib/exam/points'
import { TopicHeatmap } from '@/components/exam/TopicHeatmap'
import type { StudyPlan, StudyPlanDay, DayStatus, Exam } from '@/types'

type Tab = 'micro' | 'macro' | 'heatmap'

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

    // Award points only on first completion of this day (no double-counting).
    if (focusedDay.status !== 'completed' && verdict !== 'none') {
      void store.awardPoints({
        source: verdict === 'all' ? 'day_complete' : 'day_partial',
        amount: pointsForDay(verdict),
        examId: params.examId,
        planId: plan.id,
        meta: { date: focusedDay.date },
      })
    }

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

  const points = examPoints(store.pointEvents, params.examId)
  const rank = rankFor(points)
  const next = nextRank(points)
  const progress = rankProgress(points)

  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 space-y-6 max-w-4xl mx-auto">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">תכנית חזרה</h1>
          <p className="text-zinc-400 text-sm mt-1">{exam?.title ?? `מבחן #${params.examId}`}</p>
        </div>
        <div className="text-left">
          <div className="text-xs text-zinc-400">ימים נותרים</div>
          <div className="text-3xl font-bold tabular-nums">{daysRemaining}</div>
        </div>
      </header>

      <RankCard
        points={points}
        rank={rank}
        nextThreshold={next?.threshold}
        progress={progress}
        predictedScore={rank.predictedScore}
      />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="הושלמו" value={String(completedDays)} tone="text-emerald-300" />
        <Stat label="בעבודה" value={String(inProgressDays)} tone="text-amber-300" />
        <Stat label="הוחמצו" value={String(missedDays)} tone="text-red-300" />
      </div>

      <nav className="flex gap-2 border-b border-white/10 overflow-x-auto" role="tablist">
        {(
          [
            { id: 'micro' as Tab, label: 'היום' },
            { id: 'macro' as Tab, label: 'תצוגת מקרו' },
            { id: 'heatmap' as Tab, label: 'מפת חום' },
          ]
        ).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 border-b-2 font-medium transition whitespace-nowrap ${
              tab === t.id ? 'border-fuchsia-400 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'micro' && (
        <TodayCard
          day={focusedDay}
          planId={plan.id}
          examId={params.examId}
          onToggleActivity={toggleActivity}
          onFinishDay={() => setDialogOpen(true)}
        />
      )}
      {tab === 'macro' && (
        <MacroView
          plan={plan}
          selectedDate={focusedDay?.date}
          onSelectDay={onSelectDayFromMacro}
        />
      )}
      {tab === 'heatmap' && (
        <TopicHeatmap
          plan={plan}
          examId={params.examId}
          sessions={store.practiceSessions}
          simulations={store.simulations}
          flashcards={store.flashcards}
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

interface RankCardProps {
  points: number
  rank: ReturnType<typeof rankFor>
  nextThreshold?: number
  progress: number
  predictedScore: number
}

function RankCard({ points, rank, nextThreshold, progress, predictedScore }: RankCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-blue-500/10 p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="text-4xl" aria-hidden>
            {rank.emoji}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-400">דרגה במבחן</div>
            <div className={`text-xl font-bold ${rank.tone}`}>{rank.label}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{points} נקודות</div>
          </div>
        </div>
        <div className="text-left">
          <div className="text-xs text-zinc-400">צפי ציון</div>
          <div className="text-3xl font-bold tabular-nums bg-gradient-to-l from-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">
            {predictedScore}%
          </div>
          <div className="text-[10px] text-zinc-500">הערכה מבוססת דרגה</div>
        </div>
      </div>

      {nextThreshold !== undefined && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-zinc-400 mb-1">
            <span>שלב הבא · {nextThreshold} נק׳</span>
            <span>{Math.max(0, nextThreshold - points)} נק׳ נותרו</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-fuchsia-400 to-cyan-400 transition-all"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      )}
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
