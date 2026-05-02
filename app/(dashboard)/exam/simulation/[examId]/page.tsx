'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { SimulationTimer } from '@/components/exam/SimulationTimer'
import { sampleExam, totalPoints, type SimQuestion } from '@/lib/exam/sample-exam'
import { useExamStore } from '@/lib/exam/use-exam-store'
import { api } from '@/lib/api-client'
import { pointsForSimulation } from '@/lib/exam/points'
import type { Simulation, SimulationAnalysis } from '@/types'

type Phase = 'configure' | 'running' | 'analyzing' | 'complete'

export default function SimulationPage({ params }: { params: { examId: string } }) {
  const store = useExamStore()
  const exam = store.exams.find((e) => e.id === params.examId) ?? null

  const [phase, setPhase] = useState<Phase>('configure')
  const [duration, setDuration] = useState(120)
  const [questions, setQuestions] = useState<SimQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [analysis, setAnalysis] = useState<SimulationAnalysis | null>(null)
  const [usedFallback, setUsedFallback] = useState(false)
  const [simId] = useState(() => `sim_${Date.now()}`)
  const history = useMemo(
    () => store.simulations.filter((s) => s.exam_id === params.examId),
    [store.simulations, params.examId],
  )

  const start = () => {
    // No real PDF parsing in local-build phase — load sample exam.
    const qs = sampleExam(params.examId)
    setQuestions(qs)
    setUsedFallback(true)
    setPhase('running')
  }

  const submit = async (a: Record<string, string>) => {
    setAnswers(a)
    setPhase('analyzing')

    const qa = questions.map((q) => ({
      question: q.content,
      type: q.type,
      topic_id: q.topic_id,
      user_answer: a[q.id] ?? '',
      reference_answer: q.reference_answer,
      correct_label: q.correct_label,
      points: q.points,
    }))
    const topicMapping = Object.fromEntries(questions.map((q) => [q.id, q.topic_id]))

    let result: SimulationAnalysis
    try {
      const res = await api.exam.submitSimulation(simId, { qa, topic_mapping: topicMapping })
      result = res.analysis
    } catch (e) {
      console.warn('Simulation analysis failed, using offline scorer:', (e as Error).message)
      result = offlineAnalyze(questions, a)
    }
    setAnalysis(result)

    // Persist the run.
    const sim: Simulation = {
      id: simId,
      course_id: exam?.course_id ?? 'unknown',
      exam_id: params.examId,
      exam_pdf_ref: 'sample',
      duration_minutes: duration,
      submitted_at: new Date().toISOString(),
      status: 'complete',
      score: result.estimated_score,
      analysis: result,
    }
    await store.saveSimulation(sim)
    void store.awardPoints({
      source: 'simulation',
      amount: pointsForSimulation(result.estimated_score),
      examId: params.examId,
      meta: { score: result.estimated_score, duration_minutes: duration },
    })
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(`teepo_exam_sim_inflight_${params.examId}`)
    }

    setPhase('complete')
  }

  // ---- Render ----

  if (phase === 'running') {
    return (
      <SimulationTimer
        examId={params.examId}
        questions={questions}
        durationMinutes={duration}
        onSubmit={submit}
      />
    )
  }

  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 max-w-3xl mx-auto">
      {phase === 'configure' && (
        <ConfigureView
          examId={params.examId}
          duration={duration}
          onDuration={setDuration}
          onStart={start}
          history={history}
        />
      )}

      {phase === 'analyzing' && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center space-y-3">
          <div className="text-5xl">⏳</div>
          <h2 className="text-xl font-bold">מנתח את הסימולציה…</h2>
          <p className="text-sm text-zinc-400">בודק תשובות, מצליב לחומר הקורס, ומגבש המלצות.</p>
        </div>
      )}

      {phase === 'complete' && analysis && (
        <CompleteView
          examId={params.examId}
          questions={questions}
          answers={answers}
          analysis={analysis}
          usedFallback={usedFallback}
        />
      )}
    </main>
  )
}

// ---- Configure ----

function ConfigureView({
  examId,
  duration,
  onDuration,
  onStart,
  history,
}: {
  examId: string
  duration: number
  onDuration: (d: number) => void
  onStart: () => void
  history: Simulation[]
}) {
  return (
    <div dir="rtl" className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">סימולציית מבחן</h1>
          <p className="text-zinc-400 text-sm mt-1">מבחן #{examId}</p>
        </div>
        <Link href={`/exam/plan/${examId}`} className="text-sm text-zinc-400 hover:text-zinc-200">
          → חזרה לתכנית
        </Link>
      </header>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-4">
        <h2 className="font-semibold">לפני שמתחילים</h2>
        <ul className="text-sm text-zinc-300 space-y-1.5 list-disc pr-5">
          <li>סביבה מינימליסטית — אין הסחות, אין הודעות.</li>
          <li>השעון יורד; הגשה אוטומטית בסוף הזמן.</li>
          <li>תשובות נשמרות אוטומטית — רענון לא יבטל את ההתקדמות.</li>
          <li>לאחר הגשה: ניתוח AI עם פירוט לפי שאלה ולפי נושא.</li>
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-3">
        <label className="block text-sm font-medium">משך הסימולציה</label>
        <div className="flex gap-2">
          {[60, 90, 120, 180].map((m) => (
            <button
              key={m}
              onClick={() => onDuration(m)}
              className={`px-4 py-2 rounded-lg transition ${
                duration === m
                  ? 'bg-gradient-to-l from-fuchsia-500 to-blue-500 text-white'
                  : 'bg-white/5 hover:bg-white/10'
              }`}
            >
              {m} דקות
            </button>
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold mb-3">היסטוריה</h2>
          <ul className="space-y-2 text-sm">
            {history
              .slice()
              .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))
              .slice(0, 5)
              .map((s) => (
                <li key={s.id} className="flex justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-zinc-400">
                    {s.submitted_at ? new Date(s.submitted_at).toLocaleString('he-IL') : '—'}
                  </span>
                  <span className="font-mono">{s.score ?? '—'}%</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      <button
        onClick={onStart}
        className="w-full py-4 rounded-lg bg-gradient-to-l from-red-500 to-pink-500 font-bold text-lg shadow-lg shadow-red-500/20"
      >
        התחל סימולציה
      </button>
    </div>
  )
}

// ---- Complete ----

function CompleteView({
  examId,
  questions,
  answers,
  analysis,
  usedFallback,
}: {
  examId: string
  questions: SimQuestion[]
  answers: Record<string, string>
  analysis: SimulationAnalysis
  usedFallback: boolean
}) {
  const score = analysis.estimated_score
  return (
    <div dir="rtl" className="space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">תוצאות סימולציה</h1>
        <Link href={`/exam/plan/${examId}`} className="text-sm text-zinc-400 hover:text-zinc-200">
          → חזרה לתכנית
        </Link>
      </header>

      {usedFallback && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/40 p-3 text-xs text-amber-200">
          ⚠ מצב הדגמה: שאלות וניתוח מקומיים. ב-production הניתוח יבוצע ע״י AI על המבחן שהועלה.
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-blue-500/10 p-8 text-center">
        <div className="text-7xl font-bold tabular-nums">
          {score}
          <span className="text-2xl text-zinc-400">%</span>
        </div>
        <div className="text-lg font-semibold mt-2">
          {score >= 90 ? 'מצוין!' : score >= 70 ? 'טוב מאוד' : score >= 50 ? 'יש לאן לשאוף' : 'דורש תרגול נוסף'}
        </div>
      </div>

      {analysis.by_topic.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold mb-4">פירוט לפי נושא</h2>
          <ul className="space-y-3">
            {analysis.by_topic.map((t) => {
              const topicTitle = questions.find((q) => q.topic_id === t.topic_id)?.topic_title ?? t.topic_id
              return (
                <li key={t.topic_id} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{topicTitle}</span>
                    <span className="text-zinc-400">
                      {t.correct_pct}% · {t.n_questions} שאלות
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5">
                    <div
                      className={`h-full rounded-full ${
                        t.correct_pct >= 70 ? 'bg-emerald-400' : t.correct_pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
                      }`}
                      style={{ width: `${t.correct_pct}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {analysis.recommendations.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="font-semibold mb-3">המלצות</h2>
          <ul className="space-y-2 text-sm">
            {analysis.recommendations.map((r, i) => (
              <li key={i} className="rounded-lg bg-white/5 p-3">
                <div className="font-medium">{r.action}</div>
                {r.minutes > 0 && (
                  <div className="text-xs text-zinc-400 mt-1">~{r.minutes} דקות</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="font-semibold mb-3">שאלה אחר שאלה</h2>
        <ul className="space-y-2 text-sm">
          {questions.map((q, i) => {
            const userAnswer = answers[q.id] ?? ''
            const isMcqCorrect = q.type === 'mcq' && userAnswer === q.correct_label
            const correct = q.type === 'mcq' ? isMcqCorrect : userAnswer.trim().length > 30
            return (
              <li
                key={q.id}
                className={`rounded-lg p-3 border ${
                  correct ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-red-500/10 border-red-500/40'
                }`}
              >
                <div className="font-medium">
                  {i + 1}. {q.content}
                </div>
                {q.type === 'mcq' && (
                  <div className="text-xs text-zinc-400 mt-1">
                    ענית: {userAnswer || '—'} · נכון: {q.correct_label}
                  </div>
                )}
                {q.type === 'open' && (
                  <div className="text-xs text-zinc-400 mt-1">
                    {userAnswer.length === 0 ? 'לא נענתה' : `${userAnswer.length} תווים`}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// ---- Offline analyzer ----

function offlineAnalyze(
  questions: SimQuestion[],
  answers: Record<string, string>,
): SimulationAnalysis {
  const total = totalPoints(questions)
  const earned = questions.reduce((sum, q) => {
    const a = answers[q.id] ?? ''
    if (q.type === 'mcq') return sum + (a === q.correct_label ? q.points : 0)
    // Heuristic for offline mode: long-enough answer earns ~70% of points.
    if (q.type === 'open') return sum + (a.trim().length >= 30 ? Math.round(q.points * 0.7) : 0)
    return sum
  }, 0)
  const estimated = Math.round((earned / total) * 100)

  const byTopic = aggregateByTopic(questions, answers)
  const strengths = byTopic.filter((t) => t.correct_pct >= 70).map((t) => t.topic_id)
  const weaknesses = byTopic.filter((t) => t.correct_pct < 50).map((t) => t.topic_id)

  return {
    estimated_score: estimated,
    by_topic: byTopic,
    strengths,
    weaknesses,
    recommendations: weaknesses.map((tid) => {
      const q = questions.find((qq) => qq.topic_id === tid)
      return {
        action: `הוסף 30 דקות תרגול בנושא "${q?.topic_title ?? tid}"`,
        topic_id: tid,
        minutes: 30,
      }
    }),
  }
}

function aggregateByTopic(
  questions: SimQuestion[],
  answers: Record<string, string>,
): SimulationAnalysis['by_topic'] {
  const buckets = new Map<string, { earned: number; total: number; count: number }>()
  for (const q of questions) {
    const a = answers[q.id] ?? ''
    let earned = 0
    if (q.type === 'mcq' && a === q.correct_label) earned = q.points
    else if (q.type === 'open' && a.trim().length >= 30) earned = Math.round(q.points * 0.7)

    const cur = buckets.get(q.topic_id) ?? { earned: 0, total: 0, count: 0 }
    cur.earned += earned
    cur.total += q.points
    cur.count += 1
    buckets.set(q.topic_id, cur)
  }
  return Array.from(buckets.entries()).map(([topic_id, b]) => ({
    topic_id,
    correct_pct: Math.round((b.earned / b.total) * 100),
    n_questions: b.count,
  }))
}
