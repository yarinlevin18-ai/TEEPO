'use client'

import { useMemo } from 'react'
import { Timeline } from '@/components/exam/Timeline'
import { TodayCard } from '@/components/exam/TodayCard'
import { useExamStore } from '@/lib/exam/use-exam-store'
import {
  totalPoints,
  rankFor,
  nextRank,
  rankProgress,
  recentEvents,
  SOURCE_LABEL,
} from '@/lib/exam/points'
import type { Exam } from '@/types'

export default function ExamDashboard() {
  const store = useExamStore()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  // Sample exams seeded into the local store on first visit so the UI has
  // something to render. Real users will populate db.exams from Moodle/portal
  // sync (out of scope for this scaffold).
  const seedSample = async () => {
    await store.upsertExam(makeSample('sample-algorithms', 'cs101', 'אלגוריתמים — אמצע סמסטר', addDays(14), 'midterm'))
    await store.upsertExam(makeSample('sample-sociology', 'soc201', 'מבוא לסוציולוגיה — סוף', addDays(28), 'final'))
  }

  // For the "היום שלי" card on the dashboard, surface the day-of activities
  // for the closest upcoming plan (if any).
  const todayDay = useMemo(() => {
    const upcomingPlans = store.plans
      .filter((p) => p.status === 'active' && p.exam_date >= today)
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
    const plan = upcomingPlans[0]
    if (!plan) return undefined
    return (
      plan.days.find((d) => d.date === today && d.status !== 'completed') ??
      plan.days.find((d) => d.date >= today && d.status !== 'completed') ??
      plan.days[0]
    )
  }, [store.plans, today])

  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 space-y-8">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-l from-fuchsia-400 to-cyan-400 bg-clip-text text-transparent">
            תקופת מבחנים
          </h1>
          <p className="text-zinc-400 text-sm mt-1">המסכים שלך, התכנית שלך, היום שלך.</p>
        </div>
        {!store.driveBacked && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
            מצב מקומי — לא מסונכרן ל-Drive
          </span>
        )}
      </header>

      <section aria-label="ציר זמן מבחנים">
        {store.exams.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-zinc-400 space-y-3">
            <p>אין מבחנים בציר הזמן.</p>
            <button
              onClick={seedSample}
              className="px-4 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 text-sm font-semibold"
            >
              טען מבחנים לדוגמה
            </button>
          </div>
        ) : (
          <Timeline exams={store.exams} />
        )}
      </section>

      <section aria-label="דרגה כוללת">
        <GlobalRankCard pointEvents={store.pointEvents} />
      </section>

      <section aria-label="היום שלי" className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TodayCard day={todayDay} />
        </div>
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h3 className="font-semibold mb-3">קבוצות פעילות</h3>
          <p className="text-sm text-zinc-400">— אין קבוצות פעילות —</p>
        </aside>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'מבחנים פעילים', value: String(store.exams.length) },
          { label: 'תכניות פעילות', value: String(store.plans.filter((p) => p.status === 'active').length) },
          { label: 'סימולציות', value: String(store.simulations.length) },
          { label: 'תרגילי תרגול', value: String(store.practiceSessions.length) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-zinc-400">{s.label}</div>
            <div className="text-2xl font-semibold mt-1">{s.value}</div>
          </div>
        ))}
      </section>
    </main>
  )
}

// ---- helpers ----

function makeSample(id: string, courseId: string, title: string, date: string, type: Exam['type']): Exam {
  return { id, course_id: courseId, title, date, type, source: 'manual' }
}

function GlobalRankCard({ pointEvents }: { pointEvents: Parameters<typeof recentEvents>[0] }) {
  const total = totalPoints(pointEvents)
  const rank = rankFor(total)
  const next = nextRank(total)
  const progress = rankProgress(total)
  const recent = recentEvents(pointEvents, 4)

  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-blue-500/10 p-5">
      <div className="grid grid-cols-1 md:grid-cols-[auto,1fr,auto] gap-5 items-center">
        <div className="flex items-center gap-3">
          <div className="text-5xl" aria-hidden>
            {rank.emoji}
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-zinc-400">דרגה כללית</div>
            <div className={`text-2xl font-bold ${rank.tone}`}>{rank.label}</div>
            <div className="text-xs text-zinc-500 mt-0.5">{total} נקודות</div>
          </div>
        </div>

        <div>
          {next ? (
            <>
              <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                <span>{next.emoji} {next.label} · {next.threshold} נק׳</span>
                <span>{Math.max(0, next.threshold - total)} נק׳ נותרו</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-l from-fuchsia-400 to-cyan-400 transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
            </>
          ) : (
            <div className="text-xs text-zinc-400">הגעת לדרגה הגבוהה ביותר 🏆</div>
          )}
        </div>

        <div className="hidden md:flex flex-col gap-1 text-xs">
          <span className="text-zinc-500">פעילות אחרונה</span>
          {recent.length === 0 ? (
            <span className="text-zinc-600">— אין פעילות עדיין —</span>
          ) : (
            recent.slice(0, 3).map((e) => (
              <span key={e.id} className="text-zinc-300">
                +{e.amount} · {SOURCE_LABEL[e.source]}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function addDays(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
