'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  BookOpenCheck,
  Brain,
  CalendarDays,
  ClipboardList,
  FlaskConical,
  Sparkles,
  Trophy,
} from 'lucide-react'
import { Timeline } from '@/components/exam/Timeline'
import { TodayCard } from '@/components/exam/TodayCard'
import { StreakCard } from '@/components/exam/StreakCard'
import { AchievementsGrid } from '@/components/exam/AchievementsGrid'
import AchievementWatcher from '@/components/exam/AchievementWatcher'
import { useExamStore } from '@/lib/exam/use-exam-store'
import {
  totalPoints,
  rankFor,
  nextRank,
  rankProgress,
  recentEvents,
  SOURCE_LABEL,
  type PointEvent,
} from '@/lib/exam/points'
import { computeStreak } from '@/lib/exam/streaks'
import type { Exam } from '@/types'

export default function ExamDashboard() {
  const store = useExamStore()
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const seedSample = async () => {
    await store.upsertExam(makeSample('sample-algorithms', 'cs101', 'אלגוריתמים — אמצע סמסטר', addDays(14), 'midterm'))
    await store.upsertExam(makeSample('sample-sociology', 'soc201', 'מבוא לסוציולוגיה — סוף', addDays(28), 'final'))
  }

  // Closest upcoming exam (for the hero) and the corresponding plan.
  const nextExam = useMemo(() => {
    const upcoming = store.exams
      .filter((e) => e.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
    return upcoming[0] ?? null
  }, [store.exams, today])

  const nextPlan = useMemo(() => {
    if (!nextExam) return null
    return store.plans.find((p) => p.exam_id === nextExam.id) ?? null
  }, [store.plans, nextExam])

  const todayDay = useMemo(() => {
    if (!nextPlan) return undefined
    return (
      nextPlan.days.find((d) => d.date === today && d.status !== 'completed') ??
      nextPlan.days.find((d) => d.date >= today && d.status !== 'completed') ??
      nextPlan.days[0]
    )
  }, [nextPlan, today])

  const daysToExam = nextExam ? daysBetween(today, nextExam.date) : null
  const streak = useMemo(() => computeStreak(store.pointEvents), [store.pointEvents])

  const achievementCtx = useMemo(
    () => ({
      pointEvents: store.pointEvents,
      practiceSessions: store.practiceSessions,
      simulations: store.simulations,
      flashcards: store.flashcards,
      plans: store.plans,
      totalPoints: totalPoints(store.pointEvents),
    }),
    [
      store.pointEvents,
      store.practiceSessions,
      store.simulations,
      store.flashcards,
      store.plans,
    ],
  )

  return (
    <main dir="rtl" className="min-h-screen p-5 lg:p-8 max-w-6xl mx-auto space-y-6">
      <AchievementWatcher />
      <Header offlineMode={!store.driveBacked} />

      {/* HERO: next exam + giant CTA */}
      <div className="reveal" style={{ ['--reveal-delay' as string]: '40ms' }}>
        {nextExam ? (
          <NextExamHero
            exam={nextExam}
            daysAway={daysToExam ?? 0}
            hasPlan={!!nextPlan}
            examCount={store.exams.length}
          />
        ) : (
          <EmptyState onSeed={seedSample} />
        )}
      </div>

      {/* TWO-COLUMN: today's plan (wide) + rank/activity (narrow) */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-5">
        <div className="reveal" style={{ ['--reveal-delay' as string]: '120ms' }}>
          <SectionLabel icon={<CalendarDays size={14} />}>היום שלי</SectionLabel>
          <TodayCard
            day={todayDay}
            planId={nextPlan?.id}
            examId={nextExam?.id}
          />
        </div>

        <div className="space-y-4 reveal" style={{ ['--reveal-delay' as string]: '180ms' }}>
          <div>
            <SectionLabel icon={<Trophy size={14} />}>דרגה כללית</SectionLabel>
            <GlobalRankCard pointEvents={store.pointEvents} />
          </div>
          <StreakCard streak={streak} />
        </div>
      </section>

      {/* ACHIEVEMENTS */}
      <section className="reveal" style={{ ['--reveal-delay' as string]: '210ms' }}>
        <SectionLabel icon={<Sparkles size={14} />}>הישגים</SectionLabel>
        <AchievementsGrid ctx={achievementCtx} unlocked={store.unlockedAchievements} />
      </section>

      {/* TIMELINE strip */}
      {store.exams.length > 0 && (
        <section className="reveal" style={{ ['--reveal-delay' as string]: '240ms' }}>
          <SectionLabel icon={<CalendarDays size={14} />}>כל המבחנים</SectionLabel>
          <Timeline exams={store.exams} />
        </section>
      )}

      {/* STATS row */}
      <section className="reveal" style={{ ['--reveal-delay' as string]: '300ms' }}>
        <SectionLabel icon={<Sparkles size={14} />}>במספרים</SectionLabel>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            icon={<ClipboardList size={18} />}
            label="מבחנים"
            value={store.exams.length}
            tone="indigo"
          />
          <StatCard
            icon={<CalendarDays size={18} />}
            label="תכניות פעילות"
            value={store.plans.filter((p) => p.status === 'active').length}
            tone="clay"
          />
          <StatCard
            icon={<BookOpenCheck size={18} />}
            label="תרגילי תרגול"
            value={store.practiceSessions.length}
            tone="success"
          />
          <StatCard
            icon={<Brain size={18} />}
            label="סימולציות"
            value={store.simulations.length}
            tone="warn"
          />
        </div>
      </section>
    </main>
  )
}

// ─────────────────────────────────────────────────────────── Header

function Header({ offlineMode }: { offlineMode: boolean }) {
  return (
    <header className="flex items-baseline justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-3xl lg:text-4xl font-black tracking-tight">
          <span className="exam-emphasis">תקופת מבחנים</span>
        </h1>
        <p className="text-zinc-400 text-sm mt-1">המסכים שלך, התכנית שלך, היום שלך.</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <Link href="/exam/mistakes" className="exam-ghost text-xs">
          📕 בנק טעויות
        </Link>
        <Link href="/exam/lab" className="exam-ghost text-xs">
          <FlaskConical size={14} />
          מעבדה
        </Link>
        {offlineMode && (
          <span className="exam-pill bg-amber-500/20 text-amber-300">
            מצב מקומי
          </span>
        )}
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────────────────── Section label

function SectionLabel({
  icon,
  children,
}: {
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-bold uppercase tracking-widest text-zinc-500">
      {icon}
      <span>{children}</span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────── Hero

function NextExamHero({
  exam,
  daysAway,
  hasPlan,
  examCount,
}: {
  exam: Exam
  daysAway: number
  hasPlan: boolean
  examCount: number
}) {
  const urgency =
    daysAway <= 7
      ? { label: 'דחוף', tone: 'bg-red-500/20 text-red-300' }
      : daysAway <= 21
      ? { label: 'בקרוב', tone: 'bg-amber-500/20 text-amber-300' }
      : { label: 'יש זמן', tone: 'bg-emerald-500/20 text-emerald-300' }

  return (
    <div className="exam-hero p-6 lg:p-8 relative overflow-hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className={`exam-pill ${urgency.tone}`}>{urgency.label}</span>
            <span className="text-xs text-zinc-400">
              {examCount > 1 ? `מתוך ${examCount} מבחנים` : 'המבחן הקרוב שלך'}
            </span>
          </div>
          <h2 className="text-2xl lg:text-3xl font-bold leading-tight">{exam.title}</h2>
          <p className="text-sm text-zinc-400 mt-1">
            {exam.date} · {exam.type === 'midterm' ? 'אמצע סמסטר' : exam.type === 'final' ? 'סוף סמסטר' : 'מועד ב'}
          </p>
        </div>

        <div className="text-left shrink-0">
          <div className="text-[11px] uppercase tracking-widest text-zinc-500">ימים נותרים</div>
          <div className="text-6xl lg:text-7xl font-black tabular-nums leading-none mt-1 exam-emphasis">
            {daysAway}
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3 flex-wrap">
        <Link
          href={`/exam/plan/${exam.id}`}
          className="exam-cta exam-cta-success text-base"
        >
          {hasPlan ? '← המשך תכנית' : '← בנה תכנית'}
        </Link>
        {hasPlan && (
          <Link href={`/exam/simulation/${exam.id}`} className="exam-ghost">
            סימולציית מבחן
          </Link>
        )}
        <Link href={`/exam/games/${exam.id}?examId=${exam.id}`} className="exam-ghost">
          🎮 משחקים
        </Link>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────── Empty state

function EmptyState({ onSeed }: { onSeed: () => void }) {
  return (
    <div className="exam-card-strong p-8 text-center space-y-3">
      <div className="text-5xl">📚</div>
      <h2 className="text-xl font-bold">עדיין אין מבחנים בציר הזמן</h2>
      <p className="text-sm text-zinc-400 max-w-sm mx-auto">
        הוסף מבחן ידנית או טען מבחני דוגמה כדי להתחיל. תוכל גם להעלות שיעור במעבדה.
      </p>
      <div className="flex items-center justify-center gap-2 pt-2 flex-wrap">
        <button onClick={onSeed} className="exam-cta">
          טען מבחנים לדוגמה
        </button>
        <Link href="/exam/lab" className="exam-ghost">
          <FlaskConical size={14} />
          מעבדה
        </Link>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────── Stat card

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number | string
  tone: 'indigo' | 'clay' | 'success' | 'warn'
}

const TONE_STYLES: Record<StatCardProps['tone'], { iconBg: string; iconColor: string; numColor: string }> = {
  indigo:  { iconBg: 'bg-indigo-500/15',   iconColor: 'text-indigo-300', numColor: 'text-zinc-100' },
  clay:    { iconBg: 'bg-amber-500/15',    iconColor: 'text-amber-300',  numColor: 'text-zinc-100' },
  success: { iconBg: 'bg-emerald-500/15',  iconColor: 'text-emerald-300', numColor: 'text-zinc-100' },
  warn:    { iconBg: 'bg-orange-500/15',   iconColor: 'text-orange-300', numColor: 'text-zinc-100' },
}

function StatCard({ icon, label, value, tone }: StatCardProps) {
  const t = TONE_STYLES[tone]
  return (
    <div className="exam-card p-4 flex items-center gap-3">
      <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${t.iconBg} ${t.iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-zinc-400">{label}</div>
        <div className={`text-2xl font-bold tabular-nums leading-tight ${t.numColor}`}>
          {value}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────── Rank card

function GlobalRankCard({ pointEvents }: { pointEvents: PointEvent[] }) {
  const total = totalPoints(pointEvents)
  const rank = rankFor(total)
  const next = nextRank(total)
  const progress = rankProgress(total)
  const recent = recentEvents(pointEvents, 3)

  return (
    <div className="exam-card-strong p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="text-4xl shrink-0" aria-hidden>{rank.emoji}</div>
        <div className="flex-1 min-w-0">
          <div className={`text-xl font-bold ${rank.tone}`}>{rank.label}</div>
          <div className="text-xs text-zinc-400 mt-0.5">{total} נקודות</div>
        </div>
        <div className="text-left">
          <div className="text-[10px] text-zinc-500">צפי</div>
          <div className="text-2xl font-bold tabular-nums exam-emphasis">{rank.predictedScore}%</div>
        </div>
      </div>

      {next && (
        <div>
          <div className="flex justify-between text-[10px] text-zinc-500 mb-1.5">
            <span>{next.emoji} {next.label}</span>
            <span>{Math.max(0, next.threshold - total)} נק׳ עד הדרגה הבאה</span>
          </div>
          <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-gradient-to-l from-amber-400 via-orange-400 to-indigo-400 transition-all"
              style={{ width: `${Math.max(4, progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div className="pt-3 border-t border-white/5 space-y-1.5">
          <div className="text-[10px] uppercase tracking-widest text-zinc-500">פעילות אחרונה</div>
          {recent.map((e) => (
            <div key={e.id} className="flex justify-between text-xs">
              <span className="text-zinc-300">{SOURCE_LABEL[e.source]}</span>
              <span className="text-emerald-300 tabular-nums font-mono">+{e.amount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────── helpers

function makeSample(id: string, courseId: string, title: string, date: string, type: Exam['type']): Exam {
  return { id, course_id: courseId, title, date, type, source: 'manual' }
}

function addDays(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to + 'T00:00:00Z').getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}
