// Topic mastery scoring.
//
// Combines four signals per topic:
//   - MCQ accuracy:        % correct across MCQ practice sessions for the topic.
//   - Open-question quality: weighted avg of AI verdicts (full=1, partial=0.5,
//                            insufficient=0, uncertain=0.5).
//   - Flashcard known-rate: known cards / total cards in the topic.
//   - Simulation per-topic: avg `correct_pct` from sim analyses that scored
//                           this topic.
//
// Each signal contributes 0..1; missing signals don't drag the score down,
// they just aren't counted. Final score is weighted average over present
// signals, scaled to 0..100. A topic with zero signals is "unstarted".

import type { Flashcard, PracticeSession, Simulation, StudyPlan, Topic } from '@/types'

export type MasteryStatus = 'unstarted' | 'weak' | 'progressing' | 'mastered'

export interface MasteryScore {
  topic_id: string
  topic_title: string
  /** 0..100 where present, null when no signals. */
  score: number | null
  status: MasteryStatus
  /** Per-signal breakdown (0..1 each, or null if no data). */
  breakdown: {
    mcq: number | null
    open: number | null
    flashcards: number | null
    simulation: number | null
  }
  /** Total questions / cards / sims that fed into the score. */
  sample_size: number
}

const VERDICT_WEIGHT: Record<string, number> = {
  full: 1,
  partial: 0.5,
  insufficient: 0,
  uncertain: 0.5, // neutral — uncertainty is the AI's, not the student's
}

export function topicMastery(
  topic: Topic,
  plan: StudyPlan,
  sessions: PracticeSession[],
  simulations: Simulation[],
  flashcards: Flashcard[],
): MasteryScore {
  // ----- MCQ -----
  const mcqSessions = sessions.filter(
    (s) => s.type === 'mcq' && s.topic_id === topic.id && s.course_id === plan.course_id,
  )
  let mcqCorrect = 0
  let mcqTotal = 0
  for (const s of mcqSessions) {
    for (const q of s.questions) {
      if (q.type !== 'mcq') continue
      if (q.is_correct === undefined) continue
      mcqTotal++
      if (q.is_correct) mcqCorrect++
    }
  }
  const mcq = mcqTotal > 0 ? mcqCorrect / mcqTotal : null

  // ----- Open -----
  const openSessions = sessions.filter(
    (s) => s.type === 'open' && s.topic_id === topic.id && s.course_id === plan.course_id,
  )
  let openSum = 0
  let openCount = 0
  for (const s of openSessions) {
    for (const q of s.questions) {
      if (q.type !== 'open' || !q.ai_verdict) continue
      openSum += VERDICT_WEIGHT[q.ai_verdict] ?? 0.5
      openCount++
    }
  }
  const open = openCount > 0 ? openSum / openCount : null

  // ----- Flashcards -----
  const topicCards = flashcards.filter((c) => c.topic_id === topic.id)
  let known = 0
  for (const c of topicCards) {
    if (c.status === 'known' || c.status === 'due_again') known++
  }
  const flashcardsRatio = topicCards.length > 0 ? known / topicCards.length : null

  // ----- Simulations -----
  // Simulation analysis groups results by topic_id. We use whatever sim ran
  // for this exam (matched by exam_id when present, else by course_id).
  const relevantSims = simulations.filter((s) => {
    if (s.exam_id && plan.exam_id) return s.exam_id === plan.exam_id
    return s.course_id === plan.course_id
  })
  let simSum = 0
  let simCount = 0
  for (const s of relevantSims) {
    const byTopic = s.analysis?.by_topic ?? []
    const hit = byTopic.find((t) => t.topic_id === topic.id)
    if (hit) {
      simSum += hit.correct_pct / 100
      simCount += hit.n_questions
    }
  }
  const simulation = simCount > 0 ? simSum / Math.max(1, relevantSims.length) : null

  // ----- Compose -----
  const signals: { value: number; weight: number; n: number }[] = []
  if (mcq !== null) signals.push({ value: mcq, weight: 1, n: mcqTotal })
  if (open !== null) signals.push({ value: open, weight: 1, n: openCount })
  if (flashcardsRatio !== null) signals.push({ value: flashcardsRatio, weight: 0.6, n: topicCards.length })
  if (simulation !== null) signals.push({ value: simulation, weight: 1.5, n: simCount })

  let score: number | null = null
  let sampleSize = 0
  if (signals.length > 0) {
    const totalWeight = signals.reduce((s, x) => s + x.weight, 0)
    const weightedSum = signals.reduce((s, x) => s + x.value * x.weight, 0)
    score = Math.round((weightedSum / totalWeight) * 100)
    sampleSize = signals.reduce((s, x) => s + x.n, 0)
  }

  return {
    topic_id: topic.id,
    topic_title: topic.title,
    score,
    status: classifyStatus(score),
    breakdown: { mcq, open, flashcards: flashcardsRatio, simulation },
    sample_size: sampleSize,
  }
}

function classifyStatus(score: number | null): MasteryStatus {
  if (score === null) return 'unstarted'
  if (score >= 80) return 'mastered'
  if (score >= 50) return 'progressing'
  return 'weak'
}

export function planMastery(
  plan: StudyPlan,
  sessions: PracticeSession[],
  simulations: Simulation[],
  flashcards: Flashcard[],
): MasteryScore[] {
  return plan.topics.map((t) => topicMastery(t, plan, sessions, simulations, flashcards))
}

export const STATUS_TONE: Record<MasteryStatus, { bg: string; text: string; label: string }> = {
  unstarted: { bg: 'bg-zinc-700/40', text: 'text-zinc-400', label: 'לא התחיל' },
  weak: { bg: 'bg-red-500/40', text: 'text-red-100', label: 'חלש' },
  progressing: { bg: 'bg-amber-500/40', text: 'text-amber-100', label: 'מתקדם' },
  mastered: { bg: 'bg-emerald-500/40', text: 'text-emerald-100', label: 'שולט' },
}
