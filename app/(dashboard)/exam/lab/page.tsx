'use client'

// Test lab — paste a lesson, run the full Claude pipeline against it,
// and inspect what comes back. No persistence, no plan needed. The
// fastest way to validate end-to-end behavior with real source content.

import { useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api-client'
import { QuestionRunner } from '@/components/exam/QuestionRunner'
import { FlashcardDeck } from '@/components/exam/FlashcardDeck'
import { OpenQuestionRunner, type Evaluation } from '@/components/exam/OpenQuestionRunner'
import type { OpenQuestion } from '@/lib/exam/sample-questions'
import type { Flashcard, Question } from '@/types'

interface ExtractedTopic {
  title: string
  estimated_weight: number
  source_refs: string[]
}

export default function LabPage() {
  const [courseName, setCourseName] = useState('הקורס שלי')
  const [lessonTitle, setLessonTitle] = useState('שיעור 1')
  const [lessonText, setLessonText] = useState('')
  const [topicForGen, setTopicForGen] = useState('')

  const [topics, setTopics] = useState<ExtractedTopic[] | null>(null)
  const [questions, setQuestions] = useState<Question[] | null>(null)
  const [openQuestions, setOpenQuestions] = useState<OpenQuestion[] | null>(null)
  const [flashcards, setFlashcards] = useState<Flashcard[] | null>(null)

  const [busy, setBusy] = useState<'topics' | 'mcq' | 'open' | 'flashcard' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sessionId] = useState(() => `lab_${Date.now()}`)

  const sourcePayload = () => [
    {
      type: 'lecture',
      title: lessonTitle,
      file_id: 'lab-paste',
      content: lessonText,
    },
  ]

  const onUploadFile = async (file: File) => {
    if (!file) return
    setError(null)
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        const res = await api.exam.parseExamPdf(file)
        const text = res.questions.map((q) => `Q${q.number} (p${q.page}): ${q.text}`).join('\n\n')
        setLessonText(text)
        if (res.via_ocr) {
          setError('הקובץ עובד עם OCR — בדוק את הטקסט לפני שתתקדם.')
        }
      } catch (e: any) {
        setError(`נכשל לעבד PDF: ${e.message}`)
      }
      return
    }
    // Plain text / other — read directly.
    const text = await file.text()
    setLessonText(text)
  }

  const runExtract = async () => {
    if (!lessonText.trim()) {
      setError('הדבק תחילה תוכן שיעור.')
      return
    }
    setBusy('topics')
    setError(null)
    try {
      const res = await api.exam.extractTopics({
        course_name: courseName,
        exam_type: 'midterm',
        materials: sourcePayload(),
      })
      setTopics(res.topics as ExtractedTopic[])
      if (!topicForGen && res.topics[0]?.title) {
        setTopicForGen(res.topics[0].title)
      }
    } catch (e: any) {
      setError(`חילוץ נושאים נכשל: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const runMcq = async () => {
    if (!lessonText.trim()) return setError('הדבק תחילה תוכן שיעור.')
    if (!topicForGen.trim()) return setError('בחר נושא לתרגול.')
    setBusy('mcq')
    setError(null)
    setQuestions(null)
    try {
      const res = await api.exam.generatePractice({
        type: 'mcq',
        topic: topicForGen,
        sources: sourcePayload(),
        n: 6,
        difficulty: 'medium',
      })
      const qs: Question[] = res.questions.map((q: any, i: number) => ({
        id: `lab_${sessionId}_q${i}`,
        session_id: sessionId,
        type: 'mcq',
        content: q.content,
        options: q.options.map((o: any) => ({
          label: o.label,
          text: o.text,
          is_correct: o.is_correct,
          explanation: o.explanation,
        })),
        explanation: q.options.find((o: any) => o.is_correct)?.explanation ?? '',
        source_file_ref: q.source_ref ?? lessonTitle,
      }))
      setQuestions(qs)
    } catch (e: any) {
      setError(`יצירת אמריקאיות נכשלה: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const runOpen = async () => {
    if (!lessonText.trim()) return setError('הדבק תחילה תוכן שיעור.')
    if (!topicForGen.trim()) return setError('בחר נושא לתרגול.')
    setBusy('open')
    setError(null)
    setOpenQuestions(null)
    try {
      const res = await api.exam.generatePractice({
        type: 'open',
        topic: topicForGen,
        sources: sourcePayload(),
        n: 3,
        difficulty: 'medium',
      })
      const qs: OpenQuestion[] = (res.questions ?? []).map((q: any, i: number) => ({
        id: `lab_${sessionId}_oq${i}`,
        session_id: sessionId,
        content: q.content,
        reference_answer: q.reference_answer ?? '',
        key_points: q.key_points ?? [],
        source_file_ref: q.source_ref ?? lessonTitle,
      }))
      setOpenQuestions(qs)
    } catch (e: any) {
      setError(`יצירת שאלות פתוחות נכשלה: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const runFlashcards = async () => {
    if (!lessonText.trim()) return setError('הדבק תחילה תוכן שיעור.')
    if (!topicForGen.trim()) return setError('בחר נושא לתרגול.')
    setBusy('flashcard')
    setError(null)
    setFlashcards(null)
    try {
      const res = await api.exam.generatePractice({
        type: 'flashcard',
        topic: topicForGen,
        sources: sourcePayload(),
        n: 12,
      })
      const cards: Flashcard[] = (res.flashcards ?? []).map((c: any, i: number) => ({
        id: `lab_${sessionId}_fc${i}`,
        course_id: 'lab',
        topic_id: topicForGen,
        front: c.front,
        back: c.back,
        status: 'new',
      }))
      setFlashcards(cards)
    } catch (e: any) {
      setError(`יצירת כרטיסיות נכשלה: ${e.message}`)
    } finally {
      setBusy(null)
    }
  }

  const evaluateOpen = async (q: OpenQuestion, answer: string): Promise<Evaluation> => {
    try {
      return await api.exam.evaluateOpen({
        question: q.content,
        reference_answer: q.reference_answer,
        course_snippets: [lessonText.slice(0, 3000)],
        student_answer: answer,
      })
    } catch (e: any) {
      return {
        verdict: 'uncertain',
        reasoning: `הערכה אוטומטית לא זמינה (${e.message}). מומלץ לבדוק עם המרצה.`,
        missing_points: q.key_points,
        confidence: 0.3,
      }
    }
  }

  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 max-w-4xl mx-auto space-y-6">
      <header className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">🧪 מעבדת בדיקה</h1>
          <p className="text-zinc-400 text-sm mt-1">
            הדבק תוכן שיעור והרץ את ה-AI עליו — חילוץ נושאים, אמריקאיות, פתוחות, וכרטיסיות.
          </p>
        </div>
        <Link href="/exam" className="text-sm text-zinc-400 hover:text-zinc-200">
          → דשבורד
        </Link>
      </header>

      {error && (
        <div role="alert" className="rounded-lg bg-red-500/10 border border-red-500/40 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">תוכן השיעור</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">שם הקורס</label>
            <input
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
              dir="rtl"
              className="w-full bg-white/5 border border-white/10 rounded-lg p-2 outline-none focus:border-fuchsia-400 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">שם השיעור</label>
            <input
              value={lessonTitle}
              onChange={(e) => setLessonTitle(e.target.value)}
              dir="rtl"
              className="w-full bg-white/5 border border-white/10 rounded-lg p-2 outline-none focus:border-fuchsia-400 text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 flex items-center gap-1.5">
            📎
            <span>העלאת קובץ (PDF / TXT)</span>
            <input
              type="file"
              accept=".pdf,.txt,.md"
              onChange={(e) => e.target.files?.[0] && onUploadFile(e.target.files[0])}
              className="hidden"
            />
          </label>
          <span className="text-xs text-zinc-600">או הדבק טקסט למטה</span>
        </div>

        <textarea
          value={lessonText}
          onChange={(e) => setLessonText(e.target.value)}
          rows={12}
          dir="rtl"
          placeholder="הדבק כאן את תוכן השיעור — סיכום, מצגת מומרת לטקסט, פרק מספר, וכו׳."
          className="w-full bg-white/5 border border-white/10 rounded-lg p-3 outline-none focus:border-fuchsia-400 resize-y text-sm leading-relaxed"
        />
        <div className="text-xs text-zinc-500">{lessonText.length} תווים · {lessonText.split(/\s+/).filter(Boolean).length} מילים</div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <ActionButton
            label="חלץ נושאים"
            running={busy === 'topics'}
            onClick={runExtract}
          />
          <ActionButton
            label="צור 6 אמריקאיות"
            running={busy === 'mcq'}
            onClick={runMcq}
          />
          <ActionButton
            label="צור 3 שאלות פתוחות"
            running={busy === 'open'}
            onClick={runOpen}
          />
          <ActionButton
            label="צור 12 כרטיסיות"
            running={busy === 'flashcard'}
            onClick={runFlashcards}
          />
        </div>

        {(questions || openQuestions || flashcards) && (
          <div className="flex items-center gap-2 text-xs">
            <label className="text-zinc-400">נושא לתרגול:</label>
            <input
              value={topicForGen}
              onChange={(e) => setTopicForGen(e.target.value)}
              dir="rtl"
              className="flex-1 max-w-md bg-white/5 border border-white/10 rounded-md p-1.5 outline-none focus:border-fuchsia-400"
            />
          </div>
        )}
      </section>

      {topics && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            🧠 נושאים שזוהו ({topics.length})
          </h2>
          <ul className="space-y-2">
            {topics.map((t, i) => (
              <li
                key={i}
                onClick={() => setTopicForGen(t.title)}
                className={`cursor-pointer rounded-lg border p-3 transition ${
                  topicForGen === t.title
                    ? 'bg-fuchsia-500/15 border-fuchsia-400'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
              >
                <div className="flex justify-between items-baseline">
                  <span className="font-medium">{t.title}</span>
                  <span className="text-xs text-zinc-400">משקל {t.estimated_weight}/5</span>
                </div>
                {t.source_refs.length > 0 && (
                  <div className="text-xs text-zinc-500 mt-1">
                    מקור: {t.source_refs.join(', ')}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {questions && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            ✅ שאלות אמריקאיות ({questions.length})
          </h2>
          <QuestionRunner planId="lab" questions={questions} />
        </section>
      )}

      {openQuestions && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            📝 שאלות פתוחות ({openQuestions.length})
          </h2>
          <OpenQuestionRunner questions={openQuestions} evaluate={evaluateOpen} />
        </section>
      )}

      {flashcards && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-3">
            🎴 כרטיסיות זיכרון ({flashcards.length})
          </h2>
          <FlashcardDeck cards={flashcards} />
        </section>
      )}
    </main>
  )
}

function ActionButton({
  label,
  running,
  onClick,
}: {
  label: string
  running: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={running}
      className="px-4 py-2 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-semibold text-sm disabled:opacity-50 transition"
    >
      {running ? '⏳ ' : ''}{label}
    </button>
  )
}
