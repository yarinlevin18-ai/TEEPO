'use client'

import { useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { QuestionRunner } from '@/components/exam/QuestionRunner'
import { FlashcardDeck, type SessionResult } from '@/components/exam/FlashcardDeck'
import { OpenQuestionRunner, type Evaluation } from '@/components/exam/OpenQuestionRunner'
import { api } from '@/lib/api-client'
import {
  sampleMcqs,
  sampleOpenQuestions,
  offlineEvaluateOpen,
  type OpenQuestion,
} from '@/lib/exam/sample-questions'
import { sampleFlashcards } from '@/lib/exam/sample-flashcards'
import { useExamStore } from '@/lib/exam/use-exam-store'
import {
  pointsForFlashcards,
  pointsForMcq,
  pointsForOpen,
} from '@/lib/exam/points'
import type { Question, PracticeSession, Flashcard } from '@/types'

type Kind = 'mcq' | 'open' | 'flashcard'

function parseKind(raw: string | null): Kind {
  if (raw === 'flashcard') return 'flashcard'
  if (raw === 'open') return 'open'
  return 'mcq'
}

export default function PracticePage({ params }: { params: { planId: string } }) {
  const router = useRouter()
  const search = useSearchParams()
  const store = useExamStore()
  // The URL `planId` matches a StudyPlan.id. ?examId= helps look up the plan
  // by exam when the planId is unknown (e.g. legacy localStorage links).
  const examIdParam = search.get('examId')
  const topicId = search.get('topic')
  const kind: Kind = parseKind(search.get('kind'))

  const plan = useMemo(() => {
    const byId = store.plans.find((p) => p.id === params.planId)
    if (byId) return byId
    if (examIdParam) return store.getPlanByExam(examIdParam)
    return null
  }, [store.plans, store.getPlanByExam, params.planId, examIdParam])

  const examId = examIdParam ?? plan?.exam_id ?? params.planId

  const [questions, setQuestions] = useState<Question[]>([])
  const [openQuestions, setOpenQuestions] = useState<OpenQuestion[]>([])
  const [cards, setCards] = useState<Flashcard[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [usedFallback, setUsedFallback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId] = useState(() => `sess_${Date.now()}`)

  const topic = useMemo(() => {
    if (!plan || !topicId) return null
    return plan.topics.find((t) => t.id === topicId) ?? null
  }, [plan, topicId])

  // ----- MCQ -----

  const generateMcqs = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await api.exam.generatePractice({
        type: 'mcq',
        topic: topic?.title ?? 'נושא כללי',
        sources: topic?.source_files.map((f) => ({ file_id: f })) ?? [],
        n: 8,
        difficulty: 'medium',
      })
      setQuestions(toQuestions(res.questions, sessionId))
    } catch (e: any) {
      console.warn('MCQ generation failed, using offline sample:', e.message)
      setUsedFallback(true)
      setQuestions(sampleMcqs(topic?.title ?? 'נושא כללי', sessionId))
    } finally {
      setGenerating(false)
    }
  }

  const onMcqComplete = (result: {
    total: number
    correct: number
    answers: Record<string, { label: string; is_correct: boolean }>
  }) => {
    const session: PracticeSession = {
      id: sessionId,
      course_id: plan?.course_id ?? 'unknown',
      topic_id: topic?.id ?? 'unknown',
      type: 'mcq',
      status: 'reviewed',
      questions: questions.map((q) => ({
        ...q,
        user_answer: result.answers[q.id]?.label,
        is_correct: result.answers[q.id]?.is_correct,
      })),
      score: Math.round((result.correct / result.total) * 100),
      created_at: new Date().toISOString(),
    }
    void store.savePracticeSession(session)
    void store.awardPoints({
      source: 'practice_mcq',
      amount: pointsForMcq(session.score ?? 0),
      examId: examId || undefined,
      planId: plan?.id,
      meta: { score: session.score, correct: result.correct, total: result.total },
    })
  }

  // ----- Flashcards -----

  const generateFlashcards = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await api.exam.generatePractice({
        type: 'flashcard',
        topic: topic?.title ?? 'נושא כללי',
        sources: topic?.source_files.map((f) => ({ file_id: f })) ?? [],
        n: 20,
      })
      const fresh = toFlashcards(res.flashcards, topic?.id ?? 'free', plan?.course_id ?? 'unknown')
      setCards(mergeWithDue(fresh, store.flashcards, topic?.id))
    } catch (e: any) {
      console.warn('Flashcard generation failed, using offline sample:', e.message)
      setUsedFallback(true)
      const sampled = sampleFlashcards(
        topic?.title ?? 'נושא כללי',
        topic?.id ?? 'free',
        plan?.course_id ?? 'unknown',
      )
      setCards(mergeWithDue(sampled, store.flashcards, topic?.id))
    } finally {
      setGenerating(false)
    }
  }

  const onFlashcardSession = (result: SessionResult) => {
    void store.upsertFlashcards(result.reviewed)
    void store.awardPoints({
      source: 'practice_flashcard',
      amount: pointsForFlashcards(result.knownCount),
      examId: examId || undefined,
      planId: plan?.id,
      meta: { known: result.knownCount, total: result.totalCount },
    })
    router.back()
  }

  // ----- Open questions -----

  const generateOpen = async () => {
    setGenerating(true)
    setError(null)
    try {
      const res = await api.exam.generatePractice({
        type: 'open',
        topic: topic?.title ?? 'נושא כללי',
        sources: topic?.source_files.map((f) => ({ file_id: f })) ?? [],
        n: 4,
        difficulty: 'medium',
      })
      setOpenQuestions(toOpenQuestions(res.questions, sessionId))
    } catch (e: any) {
      console.warn('Open generation failed, using offline sample:', e.message)
      setUsedFallback(true)
      setOpenQuestions(sampleOpenQuestions(topic?.title ?? 'נושא כללי', sessionId))
    } finally {
      setGenerating(false)
    }
  }

  const evaluateOpenAnswer = async (q: OpenQuestion, answer: string): Promise<Evaluation> => {
    try {
      return await api.exam.evaluateOpen({
        question: q.content,
        reference_answer: q.reference_answer,
        course_snippets: [],
        student_answer: answer,
      })
    } catch (e: any) {
      console.warn('Open evaluation failed, using offline heuristic:', e.message)
      setUsedFallback(true)
      return offlineEvaluateOpen(q, answer)
    }
  }

  const onOpenComplete = (
    results: Array<{ question: OpenQuestion; answer: string; evaluation: Evaluation }>,
  ) => {
    const session: PracticeSession = {
      id: sessionId,
      course_id: plan?.course_id ?? 'unknown',
      topic_id: topic?.id ?? 'unknown',
      type: 'open',
      status: 'reviewed',
      questions: results.map((r) => ({
        id: r.question.id,
        session_id: sessionId,
        type: 'open',
        content: r.question.content,
        user_answer: r.answer,
        ai_verdict: r.evaluation.verdict,
        explanation: r.evaluation.reasoning,
        source_file_ref: r.question.source_file_ref,
      })),
      // Score = % full + half-credit for partial.
      score: Math.round(
        ((results.filter((r) => r.evaluation.verdict === 'full').length +
          0.5 * results.filter((r) => r.evaluation.verdict === 'partial').length) /
          Math.max(1, results.length)) *
          100,
      ),
      created_at: new Date().toISOString(),
    }
    void store.savePracticeSession(session)
    void store.awardPoints({
      source: 'practice_open',
      amount: pointsForOpen(session.score ?? 0),
      examId: examId || undefined,
      planId: plan?.id,
      meta: { score: session.score },
    })
  }

  // ----- Render -----

  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 max-w-3xl mx-auto">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {kind === 'flashcard' ? 'כרטיסיות זיכרון' : kind === 'open' ? 'שאלות פתוחות' : 'תרגול'}
          </h1>
          <p className="text-zinc-400 text-sm mt-1">{topic ? topic.title : 'תרגול חופשי'}</p>
        </div>
        <button onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-zinc-200">
          → חזרה לתכנית
        </button>
      </header>

      {/* Mode switcher — visible at all times so the user can flip between modes for the same topic. */}
      <div className="mb-4 flex gap-2 text-xs flex-wrap" role="tablist">
        {(['mcq', 'open', 'flashcard'] as const).map((k) => {
          const isActive = kind === k
          const label = k === 'flashcard' ? 'כרטיסיות' : k === 'open' ? 'פתוחות' : 'אמריקאיות'
          const qs = new URLSearchParams()
          if (topicId) qs.set('topic', topicId)
          if (examId) qs.set('examId', examId)
          if (k !== 'mcq') qs.set('kind', k)
          const href = `/exam/practice/${params.planId}?${qs.toString()}`
          return (
            <a
              key={k}
              href={href}
              role="tab"
              aria-selected={isActive}
              className={`px-3 py-1.5 rounded-lg transition ${
                isActive
                  ? 'bg-gradient-to-l from-fuchsia-500 to-blue-500 text-white'
                  : 'bg-white/5 hover:bg-white/10 text-zinc-300'
              }`}
            >
              {label}
            </a>
          )
        })}
        {(() => {
          const qs = new URLSearchParams()
          if (topicId) qs.set('topic', topicId)
          if (examId) qs.set('examId', examId)
          const href = `/exam/games/${params.planId}?${qs.toString()}`
          return (
            <a
              href={href}
              className="px-3 py-1.5 rounded-lg transition bg-white/5 hover:bg-white/10 text-zinc-300 mr-auto"
              title="משחקי לימוד"
            >
              🎮 משחקים
            </a>
          )
        })()}
      </div>

      {usedFallback && (
        <div className="mb-4 rounded-lg bg-amber-500/10 border border-amber-500/40 p-3 text-xs text-amber-200">
          ⚠ מצב הדגמה: השרת לא זמין, התוכן הוא דוגמה מקומית.
        </div>
      )}
      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-red-500/10 border border-red-500/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {kind === 'mcq' && (
        <QuestionRunner
          planId={params.planId}
          questions={questions}
          onRequestGenerate={generateMcqs}
          generating={generating}
          onComplete={onMcqComplete}
        />
      )}

      {kind === 'open' && (
        openQuestions.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-zinc-300 mb-4">{generating ? '⏳ יוצר שאלות…' : 'מוכן להתחיל סבב שאלות פתוחות.'}</p>
            <button
              onClick={generateOpen}
              disabled={generating}
              className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
            >
              צור שאלות
            </button>
          </div>
        ) : (
          <OpenQuestionRunner
            questions={openQuestions}
            evaluate={evaluateOpenAnswer}
            onComplete={onOpenComplete}
          />
        )
      )}

      {kind === 'flashcard' && (
        cards === null ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
            <p className="text-zinc-300 mb-4">{generating ? '⏳ יוצר כרטיסיות…' : 'מוכן להתחיל סבב כרטיסיות.'}</p>
            <button
              onClick={generateFlashcards}
              disabled={generating}
              className="px-5 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold disabled:opacity-40"
            >
              צור כרטיסיות
            </button>
          </div>
        ) : (
          <FlashcardDeck cards={cards} onSessionComplete={onFlashcardSession} />
        )
      )}
    </main>
  )
}

// ---- Normalizers ----

function toQuestions(
  raw: Array<{
    content: string
    options: Array<{ label: string; text: string; is_correct: boolean; explanation: string }>
    source_ref: string
    topic_id?: string
  }>,
  sessionId: string,
): Question[] {
  return raw.map((q, i) => ({
    id: `q_${sessionId}_${i}`,
    session_id: sessionId,
    type: 'mcq',
    content: q.content,
    options: q.options.map((o) => ({
      label: o.label as 'א' | 'ב' | 'ג' | 'ד',
      text: o.text,
      is_correct: o.is_correct,
      explanation: o.explanation,
    })),
    explanation: q.options.find((o) => o.is_correct)?.explanation ?? '',
    source_file_ref: q.source_ref,
  }))
}

function toFlashcards(
  raw: Array<{ front: string; back: string; source_ref?: string }> | undefined,
  topicId: string,
  courseId: string,
): Flashcard[] {
  if (!raw) return []
  return raw.map((c, i) => ({
    id: `card_${courseId}_${topicId}_${i}`,
    course_id: courseId,
    topic_id: topicId,
    front: c.front,
    back: c.back,
    status: 'new',
  }))
}

function toOpenQuestions(
  raw:
    | Array<{ content: string; reference_answer?: string; key_points?: string[]; source_ref?: string }>
    | undefined,
  sessionId: string,
): OpenQuestion[] {
  if (!raw) return []
  return raw.map((q, i) => ({
    id: `oq_${sessionId}_${i}`,
    session_id: sessionId,
    content: q.content,
    reference_answer: q.reference_answer ?? '',
    key_points: q.key_points ?? [],
    source_file_ref: q.source_ref ?? '',
  }))
}

// Merge a freshly-generated batch with any cards already in the user's bank
// for this topic so spaced-repetition state survives across sessions.
function mergeWithDue(
  fresh: Flashcard[],
  bank: Flashcard[],
  topicId: string | undefined,
): Flashcard[] {
  const today = new Date().toISOString().slice(0, 10)
  const due = bank.filter((c) => {
    if (topicId && c.topic_id !== topicId) return false
    if (c.status === 'new' || c.status === 'learning') return true
    if (!c.next_due) return true
    return c.next_due <= today
  })
  const byId = new Map<string, Flashcard>(fresh.map((c) => [c.id, c]))
  for (const c of due) byId.set(c.id, c)
  return Array.from(byId.values())
}
