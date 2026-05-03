'use client'

// Mistake bank — every wrong/partial answer the student has produced,
// grouped by topic. Click a topic to launch a focused practice session.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useExamStore } from '@/lib/exam/use-exam-store'
import {
  collectMistakes,
  mistakesByTopic,
  type Mistake,
} from '@/lib/exam/mistakes'

export default function MistakesPage() {
  const store = useExamStore()
  const mistakes = useMemo(
    () => collectMistakes(store.practiceSessions, store.plans),
    [store.practiceSessions, store.plans],
  )
  const grouped = useMemo(() => mistakesByTopic(mistakes), [mistakes])
  const [openTopic, setOpenTopic] = useState<string | null>(null)

  const examLink = (m: Mistake): string | null => {
    const plan = store.plans.find((p) => p.exam_id === m.exam_id)
    if (!plan) return null
    const qs = new URLSearchParams()
    qs.set('topic', m.topic_id)
    if (m.exam_id) qs.set('examId', m.exam_id)
    return `/exam/practice/${plan.id}?${qs.toString()}`
  }

  return (
    <main dir="rtl" className="min-h-screen p-6 lg:p-10 max-w-4xl mx-auto space-y-6">
      <header className="flex items-baseline justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">📕 בנק הטעויות</h1>
          <p className="text-zinc-400 text-sm mt-1">
            כל מה שטעית בו — מקובץ לפי נושא ומסודר מהחדש לישן.
          </p>
        </div>
        <Link href="/exam" className="text-sm text-zinc-400 hover:text-zinc-200">
          → דשבורד
        </Link>
      </header>

      {mistakes.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-12 text-center">
          <div className="text-5xl mb-3">🎯</div>
          <h2 className="text-lg font-bold mb-1">אין טעויות עדיין</h2>
          <p className="text-sm text-zinc-400">
            תרגל קצת ונאסוף כאן את הדברים שצריך לחזור עליהם.
          </p>
        </div>
      ) : (
        <>
          <Stats mistakes={mistakes} />

          <ul className="space-y-3">
            {Array.from(grouped.entries())
              .sort((a, b) => b[1].length - a[1].length)
              .map(([topicId, list]) => {
                const isOpen = openTopic === topicId
                const title = list[0]?.topic_title ?? topicId
                const link = examLink(list[0])
                return (
                  <li
                    key={topicId}
                    className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden"
                  >
                    <button
                      onClick={() => setOpenTopic(isOpen ? null : topicId)}
                      className="w-full flex items-center justify-between p-4 hover:bg-white/[0.03] transition"
                    >
                      <div className="text-right">
                        <div className="font-semibold">{title}</div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {list.length} {list.length === 1 ? 'טעות' : 'טעויות'} · אחרון:{' '}
                          {new Date(list[0].created_at).toLocaleDateString('he-IL')}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {link && (
                          <Link
                            href={link}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs px-3 py-1.5 rounded-lg bg-gradient-to-l from-fuchsia-500 to-blue-500 font-medium"
                          >
                            תרגל מחדש
                          </Link>
                        )}
                        <span className="text-zinc-500">{isOpen ? '▲' : '▼'}</span>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-white/5 p-4 space-y-3">
                        {list.map((m) => (
                          <MistakeRow key={m.question_id} mistake={m} />
                        ))}
                      </div>
                    )}
                  </li>
                )
              })}
          </ul>
        </>
      )}
    </main>
  )
}

function Stats({ mistakes }: { mistakes: Mistake[] }) {
  const mcqCount = mistakes.filter((m) => m.kind === 'mcq').length
  const openCount = mistakes.filter((m) => m.kind === 'open').length
  const partial = mistakes.filter((m) => m.ai_verdict === 'partial').length
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard label="סה״כ טעויות" value={mistakes.length} tone="text-zinc-100" />
      <StatCard label="אמריקאיות" value={mcqCount} tone="text-fuchsia-300" />
      <StatCard label="פתוחות" value={openCount} tone="text-cyan-300" />
      <StatCard label="חלקיות" value={partial} tone="text-amber-300" />
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-center">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  )
}

function MistakeRow({ mistake: m }: { mistake: Mistake }) {
  return (
    <div className="rounded-lg bg-white/[0.04] border border-white/5 p-3 text-sm space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-zinc-500">
          {m.kind === 'mcq' ? 'אמריקאית' : 'פתוחה'}
        </span>
        <span className="text-[10px] text-zinc-500">
          {new Date(m.created_at).toLocaleDateString('he-IL')}
        </span>
      </div>
      <div className="font-medium leading-relaxed">{m.content}</div>
      {m.kind === 'mcq' ? (
        <div className="text-xs space-y-0.5">
          <div className="text-red-300">ענית: {m.user_answer ?? '—'}</div>
          <div className="text-emerald-300">תשובה נכונה: {m.correct_answer ?? '—'}</div>
        </div>
      ) : (
        <div className="text-xs space-y-0.5">
          <div className="text-zinc-400">תשובתך:</div>
          <div className="text-zinc-300 line-clamp-3">{m.user_answer || '—'}</div>
          {m.ai_verdict && (
            <div
              className={
                m.ai_verdict === 'partial' ? 'text-amber-300' : 'text-red-300'
              }
            >
              שיפוט AI: {m.ai_verdict === 'partial' ? 'חלקי' : 'לא מספק'}
            </div>
          )}
        </div>
      )}
      {m.explanation && (
        <div className="text-xs text-zinc-400 italic border-r-2 border-cyan-400/40 pr-2 mt-2">
          {m.explanation}
        </div>
      )}
      {m.source_ref && (
        <div className="text-[10px] text-zinc-500">מקור: {m.source_ref}</div>
      )}
    </div>
  )
}
