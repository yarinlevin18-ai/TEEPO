'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { QuestionRunner } from '@/components/exam/QuestionRunner'
import { FlashcardDeck, type SessionResult } from '@/components/exam/FlashcardDeck'
import { api } from '@/lib/api-client'
import { sampleMcqs } from '@/lib/exam/sample-questions'
import { sampleFlashcards } from '@/lib/exam/sample-flashcards'
import { savePracticeSession } from '@/lib/exam/practice-storage'
import { upsertFlashcards, dueFlashcards } from '@/lib/exam/flashcard-storage'
import { loadPlanFromStorage } from '@/lib/exam/plan-storage'
import type { Question, PracticeSession, StudyPlan, Flashcard } from '@/types'

type Kind = 'mcq' | 'flashcard'

export default function PracticePage({ params }: { params: { planId: string } }) {
  const router = useRouter()
  const search = useSearchParams()
  // The URL `planId` is the localStorage key. ?examId= identifies which saved
  // plan to load (falls back to planId for direct visits without context).
  const examId = search.get('examId') ?? params.planId
  const topicId = search.get('topic')
  const kind: Kind = search.get('kind') === 'flashcard' ? 'flashcard' : 'mcq'

  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [cards, setCards] = useState<Flashcard[] | null>(null)
  const [generating, setGenerating] = useState(false)
  const [usedFallback, setUsedFallback] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sessionId] = useState(() => `sess_${Date.now()}`)

  useEffect(() => {
    setPlan(loadPlanFromStorage(examId))
  }, [examId])

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
    savePracticeSession(params.planId, session)
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
      const existing = dueFlashcards(params.planId, topic?.id)
      // Merge: prefer existing card state when ids collide.
      const byId = new Map<string, Flashcard>(fresh.map((c) => [c.id, c]))
      for (const c of existing) byId.set(c.id, c)
      setCards(Array.from(byId.values()))
    } catch (e: any) {
      console.warn('Flashcard generation failed, using offline sample:', e.message)
      setUsedFallback(true)
      const sampled = sampleFlashcards(
        topic?.title ?? 'נושא כללי',
        topic?.id ?? 'free',
        plan?.course_id ?? 'unknown',
      )
      const existing = dueFlashcards(params.planId, topic?.id)
      const byId = new Map<string, Flashcard>(sampled.map((c) => [c.id, c]))
      for (const c of existing) byId.set(c.id, c)
      setCards(Array.from(byId.values()))
    } finally {
      setGenerating(false)
    }
  }

  const onFlashcardSession = (result: SessionResult) => {
    upsertFlashcards(params.planId, result.reviewed)
    // Bounce back to the plan view; could show a summary screen later.
    router.back()
  }

  // ----- Render -----

  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 max-w-3xl mx-auto">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">{kind === 'flashcard' ? 'כרטיסיות זיכרון' : 'תרגול'}</h1>
          <p className="text-zinc-400 text-sm mt-1">{topic ? topic.title : 'תרגול חופשי'}</p>
        </div>
        <button onClick={() => router.back()} className="text-sm text-zinc-400 hover:text-zinc-200">
          → חזרה לתכנית
        </button>
      </header>

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

      {kind === 'mcq' ? (
        <QuestionRunner
          planId={params.planId}
          questions={questions}
          onRequestGenerate={generateMcqs}
          generating={generating}
          onComplete={onMcqComplete}
        />
      ) : cards === null ? (
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
