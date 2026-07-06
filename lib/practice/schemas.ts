/**
 * Practice quiz — shared zod schemas + JSON extraction.
 *
 * Used on both sides of the /api/quiz/* boundary: the API routes validate
 * Claude's output with these before responding, and the practice page
 * validates the API responses before trusting them (Zod-at-boundaries rule).
 *
 * Keep this file free of server-only imports — it's bundled client-side too.
 */
import { z } from 'zod'

/** One generated constructed-response question, pre-persistence (no ids yet). */
export const GeneratedQuestionSchema = z.object({
  question: z.string().min(8),
  rubric: z.string().min(8),
  model_answer: z.string().optional(),
})

export const GeneratedQuizSchema = z.object({
  title: z.string().min(1),
  questions: z.array(GeneratedQuestionSchema).min(1).max(12),
})

export type GeneratedQuiz = z.infer<typeof GeneratedQuizSchema>

/** Grading verdict for a single answer. */
export const GradeResultSchema = z.object({
  score: z.number().min(0).max(100),
  feedback: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
})

export type GradeResult = z.infer<typeof GradeResultSchema>

/**
 * Pull a JSON object out of an LLM reply. Tolerates markdown code fences
 * and prose before/after the object — grabs the outermost {...} span.
 * Throws (SyntaxError from JSON.parse, or Error when no object at all)
 * so callers can surface a clean "model returned garbage" error.
 */
export function extractJsonObject(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, '')
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('No JSON object found in model output')
  }
  return JSON.parse(stripped.slice(start, end + 1))
}
