'use client'

import { useEffect, useMemo, useState } from 'react'
import { PlanWizard } from '@/components/exam/PlanWizard'
import { TodayCard } from '@/components/exam/TodayCard'
import { loadPlanFromStorage, savePlanToStorage } from '@/lib/exam/plan-storage'
import type { StudyPlan } from '@/types'

export default function PlanPage({ params }: { params: { examId: string } }) {
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setPlan(loadPlanFromStorage(params.examId))
    setLoaded(true)
  }, [params.examId])

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const todayDay = plan?.days.find((d) => d.date === today) ?? plan?.days[0]
  const daysRemaining = plan ? Math.max(0, daysBetween(today, plan.exam_date)) : null

  if (!loaded) {
    return <main dir="rtl" className="p-6 text-zinc-400">טוען…</main>
  }

  if (!plan) {
    // No plan yet — show the wizard.
    // Materials list is empty in this local-build phase; topic extraction
    // still works on whatever the backend can derive from a course name +
    // exam type. Real Drive DB integration replaces this in a follow-up.
    return (
      <main dir="rtl" className="min-h-screen p-6 lg:p-10">
        <PlanWizard
          examId={params.examId}
          examTitle={`מבחן #${params.examId}`}
          examDate={defaultExamDate(14)}
          examType="midterm"
          courseId="local"
          courseName="קורס לדוגמה"
          materials={[]}
          onCancel={() => history.back()}
          onComplete={async (draftPlan) => {
            const persisted: StudyPlan = {
              ...draftPlan,
              id: `plan_${Date.now()}`,
              created_at: new Date().toISOString(),
            }
            savePlanToStorage(params.examId, persisted)
            setPlan(persisted)
          }}
        />
      </main>
    )
  }

  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 space-y-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">תכנית חזרה</h1>
          <p className="text-zinc-400 text-sm mt-1">מבחן #{params.examId}</p>
        </div>
        <div className="text-left">
          <div className="text-xs text-zinc-400">ימים נותרים</div>
          <div className="text-3xl font-bold tabular-nums">{daysRemaining}</div>
        </div>
      </header>

      <nav className="flex gap-2 border-b border-white/10">
        <button className="px-4 py-2 border-b-2 border-fuchsia-400 font-medium">היום</button>
        <button className="px-4 py-2 text-zinc-400">תצוגת מקרו</button>
      </nav>

      <TodayCard day={todayDay} planId={plan.id} examId={params.examId} />
    </main>
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
