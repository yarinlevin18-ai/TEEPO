"use client"

// PlanWizard — 4-step plan creation flow (spec §3.2.1, scenario §8.1).
//
//   1. Topics    — extract candidates from course materials, let user edit
//   2. Ratings   — self-rating 1-5 per topic
//   3. Schedule  — daily minutes, available days of week, preferred time
//   4. Preview   — generated day-by-day plan, confirm
//
// On confirm, calls onComplete(plan) so the parent can persist to Drive DB.

import { useState } from 'react'
import { api } from '@/lib/api-client'
import type { ExamType, StudyPlan, Topic } from '@/types'

type Step = 'topics' | 'rate' | 'schedule' | 'preview'

const DAY_LABELS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] // Sun..Sat
const DEFAULT_AVAILABLE_DAYS = [0, 1, 2, 3, 4] // Sun-Thu
const DEFAULT_DAILY_MINUTES = 90

interface CourseMaterial {
  type: 'lecture' | 'note' | 'assignment'
  title: string
  file_id: string
  pages?: number
}

interface Props {
  examId: string
  examTitle: string
  examDate: string                    // YYYY-MM-DD
  examType: ExamType
  courseId: string
  courseName: string
  materials: CourseMaterial[]
  onCancel: () => void
  onComplete: (plan: Omit<StudyPlan, 'id' | 'created_at'>) => Promise<void> | void
}

interface TopicDraft {
  id: string
  title: string
  source_refs: string[]
  rating: 1 | 2 | 3 | 4 | 5
}

export function PlanWizard(props: Props) {
  const [step, setStep] = useState<Step>('topics')
  const [topics, setTopics] = useState<TopicDraft[]>([])
  const [extracting, setExtracting] = useState(false)
  const [building, setBuilding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dailyMinutes, setDailyMinutes] = useState(DEFAULT_DAILY_MINUTES)
  const [availableDays, setAvailableDays] = useState<number[]>(DEFAULT_AVAILABLE_DAYS)
  const [preferredTime, setPreferredTime] = useState<StudyPlan['preferred_time']>('evening')
  const [previewDays, setPreviewDays] = useState<
    Array<{ date: string; activities: Array<{ type: string; topic_id: string; minutes: number; instruction: string }> }>
  >([])
  const [usedFallback, setUsedFallback] = useState(false)

  // Auto-extract on mount of step 1. Falls back to canned topics if the
  // backend is unreachable so the rest of the flow can be exercised offline.
  const extractTopics = async () => {
    setExtracting(true)
    setError(null)
    try {
      const res = await api.exam.extractTopics({
        course_name: props.courseName,
        exam_type: props.examType,
        materials: props.materials,
      })
      setTopics(
        res.topics.map((t, i) => ({
          id: `t_${i}`,
          title: t.title,
          source_refs: t.source_refs,
          rating: 3,
        })),
      )
    } catch (e: any) {
      console.warn('Topic extraction failed, using offline sample:', e.message)
      setUsedFallback(true)
      setTopics(sampleTopics(props.courseName))
    } finally {
      setExtracting(false)
    }
  }

  const buildPlan = async () => {
    setBuilding(true)
    setError(null)
    try {
      const daysAvailable = daysBetweenStr(today(), props.examDate)
      const res = await api.exam.buildPlan({
        days_available: daysAvailable,
        daily_minutes: dailyMinutes,
        available_days: availableDays.map((d) => DAY_LABELS[d]),
        topics: topics.map((t) => ({ id: t.id, title: t.title, rating: t.rating })),
      })
      setPreviewDays(res.days)
      setStep('preview')
    } catch (e: any) {
      console.warn('Plan build failed, using offline allocator:', e.message)
      setUsedFallback(true)
      setPreviewDays(localBuildPlan(topics, dailyMinutes, availableDays, props.examDate))
      setStep('preview')
    } finally {
      setBuilding(false)
    }
  }

  const confirm = async () => {
    const planTopics: Topic[] = topics.map((t) => ({
      id: t.id,
      plan_id: '', // assigned by Drive DB on save
      title: t.title,
      source_files: t.source_refs,
      self_rating: t.rating,
      priority_weight: 6 - t.rating,
      status: 'not_started',
    }))
    const plan: Omit<StudyPlan, 'id' | 'created_at'> = {
      exam_id: props.examId,
      course_id: props.courseId,
      status: 'active',
      daily_minutes: dailyMinutes,
      available_days: availableDays,
      preferred_time: preferredTime,
      topics: planTopics,
      days: previewDays.map((d, i) => ({
        id: `day_${i}`,
        plan_id: '',
        date: d.date,
        planned_topics: Array.from(new Set(d.activities.map((a) => a.topic_id))),
        planned_activities: d.activities.map((a) => ({
          type: a.type as any,
          topic_id: a.topic_id,
          minutes: a.minutes,
          instruction: a.instruction,
          done: false,
        })),
        status: 'upcoming',
      })),
      exam_date: props.examDate,
      calendar_synced: false,
    }
    await props.onComplete(plan)
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto space-y-6">
      <Header step={step} examTitle={props.examTitle} />
      {usedFallback && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/40 p-3 text-xs text-amber-200">
          ⚠ מצב הדגמה: השרת לא זמין, התוכן הוא דוגמה מקומית. ההגיון של הממשק זהה — לחץ דרך כל השלבים כדי לבדוק את הזרימה.
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-lg bg-red-500/10 border border-red-500/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {step === 'topics' && (
        <TopicsStep
          topics={topics}
          extracting={extracting}
          onExtract={extractTopics}
          onChange={setTopics}
          onNext={() => setStep('rate')}
          onCancel={props.onCancel}
        />
      )}

      {step === 'rate' && (
        <RateStep
          topics={topics}
          onChange={setTopics}
          onBack={() => setStep('topics')}
          onNext={() => setStep('schedule')}
        />
      )}

      {step === 'schedule' && (
        <ScheduleStep
          dailyMinutes={dailyMinutes}
          availableDays={availableDays}
          preferredTime={preferredTime}
          onDailyMinutes={setDailyMinutes}
          onAvailableDays={setAvailableDays}
          onPreferredTime={setPreferredTime}
          onBack={() => setStep('rate')}
          onBuild={buildPlan}
          building={building}
        />
      )}

      {step === 'preview' && (
        <PreviewStep
          days={previewDays}
          examDate={props.examDate}
          onBack={() => setStep('schedule')}
          onConfirm={confirm}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------ Header

function Header({ step, examTitle }: { step: Step; examTitle: string }) {
  const stepIdx = (['topics', 'rate', 'schedule', 'preview'] as Step[]).indexOf(step)
  return (
    <header>
      <h2 className="text-xl font-bold mb-1">בניית תכנית חזרה — {examTitle}</h2>
      <p className="text-sm text-zinc-400 mb-3">שלב {stepIdx + 1} מתוך 4</p>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= stepIdx ? 'bg-fuchsia-400' : 'bg-white/10'
            }`}
          />
        ))}
      </div>
    </header>
  )
}

// ------------------------------------------------------------ Step 1: Topics

function TopicsStep({
  topics,
  extracting,
  onExtract,
  onChange,
  onNext,
  onCancel,
}: {
  topics: TopicDraft[]
  extracting: boolean
  onExtract: () => void
  onChange: (t: TopicDraft[]) => void
  onNext: () => void
  onCancel: () => void
}) {
  const updateTitle = (id: string, title: string) =>
    onChange(topics.map((t) => (t.id === id ? { ...t, title } : t)))
  const remove = (id: string) => onChange(topics.filter((t) => t.id !== id))
  const add = () =>
    onChange([
      ...topics,
      { id: `t_${Date.now()}`, title: 'נושא חדש', source_refs: [], rating: 3 },
    ])

  if (topics.length === 0 && !extracting) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-zinc-300 mb-4">נחלץ אוטומטית את הנושאים מחומר הקורס שלך.</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onCancel}
            className="px-5 py-2 rounded-lg bg-white/5 border border-white/10"
          >
            ביטול
          </button>
          <button
            onClick={onExtract}
            className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold"
          >
            חלץ נושאים
          </button>
        </div>
      </div>
    )
  }

  if (extracting) {
    return <p className="text-center text-zinc-400 py-12">⏳ חולץ נושאים…</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">ערוך את הרשימה לפי הצורך — הוסף, מחק, או שנה כותרות.</p>
      <ul className="space-y-2">
        {topics.map((t) => (
          <li key={t.id} className="flex gap-2 items-center rounded-lg bg-white/5 border border-white/10 p-2">
            <input
              value={t.title}
              onChange={(e) => updateTitle(t.id, e.target.value)}
              className="flex-1 bg-transparent outline-none px-2 py-1"
              dir="rtl"
            />
            <button
              onClick={() => remove(t.id)}
              aria-label={`מחק נושא ${t.title}`}
              className="text-zinc-400 hover:text-red-400 px-2"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button onClick={add} className="text-sm text-fuchsia-300 hover:text-fuchsia-200">
        + הוסף נושא
      </button>
      <div className="flex justify-between pt-4">
        <button onClick={onCancel} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
          ביטול
        </button>
        <button
          onClick={onNext}
          disabled={topics.length === 0}
          className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
        >
          המשך ←
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ Step 2: Ratings

function RateStep({
  topics,
  onChange,
  onBack,
  onNext,
}: {
  topics: TopicDraft[]
  onChange: (t: TopicDraft[]) => void
  onBack: () => void
  onNext: () => void
}) {
  const setRating = (id: string, rating: 1 | 2 | 3 | 4 | 5) =>
    onChange(topics.map((t) => (t.id === id ? { ...t, rating } : t)))

  return (
    <div className="space-y-4">
      <div>
        <p className="text-zinc-300">דרג את רמת ההיכרות שלך עם כל נושא.</p>
        <p className="text-xs text-zinc-500 mt-1">1 = לא נגעתי בזה · 5 = שולט</p>
      </div>
      <ul className="space-y-2">
        {topics.map((t) => (
          <li key={t.id} className="flex justify-between items-center rounded-lg bg-white/5 border border-white/10 p-3">
            <span className="font-medium">{t.title}</span>
            <div className="flex gap-1">
              {([1, 2, 3, 4, 5] as const).map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(t.id, n)}
                  aria-label={`דירוג ${n}`}
                  className={`w-9 h-9 rounded-md font-semibold transition ${
                    t.rating === n
                      ? 'bg-gradient-to-l from-fuchsia-500 to-blue-500 text-white'
                      : 'bg-white/5 hover:bg-white/10 text-zinc-300'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
          → חזרה
        </button>
        <button
          onClick={onNext}
          className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold"
        >
          המשך ←
        </button>
      </div>
    </div>
  )
}

// ------------------------------------------------------------ Step 3: Schedule

function ScheduleStep({
  dailyMinutes,
  availableDays,
  preferredTime,
  onDailyMinutes,
  onAvailableDays,
  onPreferredTime,
  onBack,
  onBuild,
  building,
}: {
  dailyMinutes: number
  availableDays: number[]
  preferredTime: StudyPlan['preferred_time']
  onDailyMinutes: (m: number) => void
  onAvailableDays: (d: number[]) => void
  onPreferredTime: (t: StudyPlan['preferred_time']) => void
  onBack: () => void
  onBuild: () => void
  building: boolean
}) {
  const toggleDay = (d: number) => {
    if (availableDays.includes(d)) onAvailableDays(availableDays.filter((x) => x !== d))
    else onAvailableDays([...availableDays, d].sort())
  }

  return (
    <div className="space-y-6">
      <Field label="כמה דקות ביום?">
        <input
          type="number"
          min={30}
          max={240}
          step={15}
          value={dailyMinutes}
          onChange={(e) => onDailyMinutes(Math.max(30, Math.min(240, Number(e.target.value))))}
          className="w-32 bg-white/5 border border-white/10 rounded-lg px-3 py-2 outline-none"
        />
        <span className="text-zinc-400 text-sm mr-2">דקות</span>
      </Field>

      <Field label="באילו ימים בשבוע?">
        <div className="flex gap-1.5">
          {DAY_LABELS.map((label, idx) => (
            <button
              key={idx}
              onClick={() => toggleDay(idx)}
              className={`w-10 h-10 rounded-md font-semibold transition ${
                availableDays.includes(idx)
                  ? 'bg-gradient-to-l from-fuchsia-500 to-blue-500 text-white'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="באיזה זמן ביום אתה מעדיף ללמוד?">
        <div className="flex gap-2">
          {(['morning', 'afternoon', 'evening'] as const).map((t) => (
            <button
              key={t}
              onClick={() => onPreferredTime(t)}
              className={`px-4 py-2 rounded-lg transition ${
                preferredTime === t
                  ? 'bg-gradient-to-l from-fuchsia-500 to-blue-500 text-white'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300'
              }`}
            >
              {t === 'morning' ? 'בוקר' : t === 'afternoon' ? 'צהריים' : 'ערב'}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex justify-between pt-4">
        <button onClick={onBack} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
          → חזרה
        </button>
        <button
          onClick={onBuild}
          disabled={building || availableDays.length === 0}
          className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
        >
          {building ? '⏳ בונה תכנית…' : 'בנה תכנית ←'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-zinc-300 mb-2">{label}</label>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  )
}

// ------------------------------------------------------------ Step 4: Preview

function PreviewStep({
  days,
  examDate,
  onBack,
  onConfirm,
}: {
  days: Array<{ date: string; activities: Array<{ type: string; topic_id: string; minutes: number; instruction: string }> }>
  examDate: string
  onBack: () => void
  onConfirm: () => void
}) {
  const totalMinutes = days.reduce(
    (s, d) => s + d.activities.reduce((ss, a) => ss + a.minutes, 0),
    0,
  )

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-blue-500/10 p-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <Stat label="ימי הכנה" value={String(days.length)} />
          <Stat label="סה״כ זמן" value={`${Math.round(totalMinutes / 60)}h`} />
          <Stat label="תאריך מבחן" value={examDate} />
        </div>
      </div>

      <ul className="space-y-2 max-h-80 overflow-y-auto">
        {days.map((d) => {
          const total = d.activities.reduce((s, a) => s + a.minutes, 0)
          return (
            <li key={d.date} className="rounded-lg bg-white/5 border border-white/10 p-3">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{d.date}</span>
                <span className="text-zinc-400">{total} דקות</span>
              </div>
              <ul className="mt-1.5 text-xs text-zinc-400 list-disc list-inside space-y-0.5">
                {d.activities.map((a, i) => (
                  <li key={i}>{a.instruction}</li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>

      <div className="flex justify-between pt-2">
        <button onClick={onBack} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10">
          → חזרה
        </button>
        <button
          onClick={onConfirm}
          className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold"
        >
          אשר ושמור
        </button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="text-2xl font-bold mt-0.5">{value}</div>
    </div>
  )
}

// ------------------------------------------------------------ helpers

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetweenStr(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime()
  const b = new Date(to + 'T00:00:00Z').getTime()
  return Math.max(0, Math.round((b - a) / 86400000))
}

// ---- Offline fallbacks (used when the backend is unreachable) ----

function sampleTopics(courseName: string): TopicDraft[] {
  // Pick a domain-flavored set so the demo doesn't feel generic.
  const lower = courseName.toLowerCase()
  let titles: string[]
  if (lower.includes('אלגו') || lower.includes('algo')) {
    titles = ['DFS', 'BFS', 'Dynamic Programming', 'גרפים', 'NP-Completeness', 'סיבוכיות']
  } else if (lower.includes('סוצ') || lower.includes('socio')) {
    titles = ['פונקציונליזם', 'תיאוריית הקונפליקט', 'אינטראקציוניזם', 'מודרניזציה', 'גלובליזציה']
  } else {
    titles = ['פרק 1 — מבוא', 'פרק 2', 'פרק 3', 'פרק 4', 'פרק 5', 'סיכום']
  }
  return titles.map((title, i) => ({
    id: `t_${i}`,
    title,
    source_refs: [],
    rating: 3,
  }))
}

function localBuildPlan(
  topics: TopicDraft[],
  dailyMinutes: number,
  availableDays: number[],
  examDate: string,
): Array<{
  date: string
  activities: Array<{ type: string; topic_id: string; minutes: number; instruction: string }>
}> {
  // Generate the date list — every available weekday between today and exam.
  const dates: string[] = []
  const cur = new Date(today() + 'T00:00:00Z')
  const end = new Date(examDate + 'T00:00:00Z')
  while (cur < end) {
    if (availableDays.includes(cur.getUTCDay())) dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }

  // Allocate per-topic minutes by inverse-rating weight; reserve last 7 days for review.
  const reviewStart = Math.max(0, dates.length - 7)
  const teachingDates = dates.slice(0, reviewStart)
  const reviewDates = dates.slice(reviewStart)

  const totalWeight = topics.reduce((s, t) => s + (6 - t.rating), 0) || 1
  const totalMinutes = teachingDates.length * dailyMinutes
  const budget: Record<string, number> = {}
  topics.forEach((t) => {
    budget[t.id] = Math.round(((6 - t.rating) / totalWeight) * totalMinutes)
  })

  const days = teachingDates.map((date) => {
    const sorted = [...topics].sort((a, b) => (budget[b.id] ?? 0) - (budget[a.id] ?? 0))
    const top = sorted[0]
    if (!top || (budget[top.id] ?? 0) <= 0) {
      return {
        date,
        activities: [
          { type: 'review', topic_id: 'all', minutes: dailyMinutes, instruction: 'חזרה כללית' },
        ],
      }
    }
    const minutes = Math.min(dailyMinutes, budget[top.id])
    budget[top.id] -= minutes
    return {
      date,
      activities: [
        {
          type: 'read',
          topic_id: top.id,
          minutes: Math.round(minutes * 0.4),
          instruction: `קריאה: ${top.title}`,
        },
        {
          type: 'practice',
          topic_id: top.id,
          minutes: Math.round(minutes * 0.4),
          instruction: `תרגול: ${top.title}`,
        },
        {
          type: 'flashcards',
          topic_id: top.id,
          minutes: Math.round(minutes * 0.2),
          instruction: 'כרטיסיות זיכרון',
        },
      ],
    }
  })

  reviewDates.forEach((date, i) => {
    days.push({
      date,
      activities: [
        i === reviewDates.length - 2 || i === reviewDates.length - 4
          ? {
              type: 'simulation',
              topic_id: 'all',
              minutes: 180,
              instruction: 'סימולציית מבחן',
            }
          : {
              type: 'review',
              topic_id: 'all',
              minutes: dailyMinutes,
              instruction: 'סבב חזרה',
            },
      ],
    })
  })

  return days
}
