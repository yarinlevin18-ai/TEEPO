// Mistake aggregation across practice sessions.
//
// Produces a deduplicated, recency-sorted list of every question the student
// answered wrong (MCQ) or got an AI verdict of partial/insufficient (open).
// Used by /exam/mistakes for the dedicated review queue and by the mastery
// heatmap as a "weak" signal.

import type { PracticeSession, Question, StudyPlan } from '@/types'

export type MistakeKind = 'mcq' | 'open'

export interface Mistake {
  session_id: string
  question_id: string
  kind: MistakeKind
  content: string
  user_answer?: string
  correct_answer?: string  // mcq only
  explanation?: string
  source_ref?: string
  topic_id: string
  topic_title?: string
  exam_id?: string
  course_id: string
  created_at: string
  /** AI verdict for open questions. */
  ai_verdict?: 'full' | 'partial' | 'insufficient' | 'uncertain'
}

function correctMcqLabel(q: Question): string | undefined {
  if (q.type !== 'mcq' || !q.options) return undefined
  return q.options.find((o) => o.is_correct)?.label
}

function topicTitleOf(plans: StudyPlan[], topicId: string): string | undefined {
  for (const p of plans) {
    const t = p.topics.find((tt) => tt.id === topicId)
    if (t) return t.title
  }
  return undefined
}

function planExamId(plans: StudyPlan[], session: PracticeSession): string | undefined {
  // session.course_id is the link we have. Match via the plan that has that course_id
  // and includes the session's topic.
  const plan = plans.find(
    (p) => p.course_id === session.course_id && p.topics.some((t) => t.id === session.topic_id),
  )
  return plan?.exam_id
}

export function collectMistakes(
  sessions: PracticeSession[],
  plans: StudyPlan[],
): Mistake[] {
  const out: Mistake[] = []

  for (const s of sessions) {
    const examId = planExamId(plans, s)
    const topicTitle = topicTitleOf(plans, s.topic_id)

    for (const q of s.questions) {
      // MCQ: anything where is_correct === false
      if (q.type === 'mcq' && q.is_correct === false) {
        out.push({
          session_id: s.id,
          question_id: q.id,
          kind: 'mcq',
          content: q.content,
          user_answer: q.user_answer,
          correct_answer: correctMcqLabel(q),
          explanation: q.explanation,
          source_ref: q.source_file_ref,
          topic_id: s.topic_id,
          topic_title: topicTitle,
          exam_id: examId,
          course_id: s.course_id,
          created_at: s.created_at,
        })
        continue
      }

      // Open: partial or insufficient (uncertain doesn't count as a "mistake" — needs verification).
      if (
        q.type === 'open' &&
        (q.ai_verdict === 'partial' || q.ai_verdict === 'insufficient')
      ) {
        out.push({
          session_id: s.id,
          question_id: q.id,
          kind: 'open',
          content: q.content,
          user_answer: q.user_answer,
          explanation: q.explanation,
          source_ref: q.source_file_ref,
          topic_id: s.topic_id,
          topic_title: topicTitle,
          exam_id: examId,
          course_id: s.course_id,
          created_at: s.created_at,
          ai_verdict: q.ai_verdict,
        })
      }
    }
  }

  // Dedupe by question content (same question wrongly answered in multiple sessions
  // should only show once — most recent wins).
  const byContent = new Map<string, Mistake>()
  out.sort((a, b) => b.created_at.localeCompare(a.created_at))
  for (const m of out) {
    const key = `${m.kind}:${m.content}`
    if (!byContent.has(key)) byContent.set(key, m)
  }
  return Array.from(byContent.values())
}

export function mistakesByTopic(mistakes: Mistake[]): Map<string, Mistake[]> {
  const out = new Map<string, Mistake[]>()
  for (const m of mistakes) {
    const arr = out.get(m.topic_id) ?? []
    arr.push(m)
    out.set(m.topic_id, arr)
  }
  return out
}
