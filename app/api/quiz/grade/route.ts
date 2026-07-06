/**
 * POST /api/quiz/grade
 *
 * Grade one free-text answer against its question's rubric. Called once per
 * question as the student submits, so feedback is progressive (Phosphor
 * pattern) rather than batched at the end.
 *
 * Body: { question, rubric, model_answer?, answer }
 * Auth: Bearer <google_access_token>. Verified against Google's tokeninfo
 *       endpoint — this route doesn't touch Drive, so without the check
 *       anyone could burn the Anthropic quota anonymously. Skipped under
 *       the dev auth bypass (same flag + prod guard as middleware.ts).
 *
 * Response: { score: 0-100, feedback, strengths: string[], gaps: string[] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callClaude, anthropicConfigured, AnthropicError } from '@/lib/practice/anthropic'
import { GradeResultSchema, extractJsonObject } from '@/lib/practice/schemas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const BodySchema = z.object({
  question: z.string().min(1),
  rubric: z.string().min(1),
  model_answer: z.string().optional(),
  answer: z.string().min(1).max(8000),
})

const SYSTEM = `You are the grader inside TEEPO, a study platform for Israeli university students.
You receive one open question, its grading rubric (criteria with point weights summing to 100), optionally a model answer, and a student's free-text answer.

Rules:
- Score strictly by the rubric: award each criterion's points proportionally to how well the answer satisfies it, and sum. The result is an integer 0–100.
- Judge content, not style. Length is not quality — an answer that restates the question or pads with generic filler earns nothing for it.
- An empty, off-topic or "I don't know" answer scores 0–10.
- Do not invent requirements that are not in the rubric.
- Write the feedback in Hebrew: 2–4 sentences, concrete and encouraging but honest — name what was right and what exactly is missing relative to the rubric.
- "strengths" and "gaps" are short Hebrew phrases (2–6 words each), max 3 items per list.

Output STRICT JSON only, no markdown fences, matching:
{"score": number, "feedback": string, "strengths": string[], "gaps": string[]}`

async function verifyGoogleToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(token)}`,
    )
    return res.ok
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  if (!anthropicConfigured()) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY חסר בהגדרות השרת' },
      { status: 503 },
    )
  }

  // Dev-only bypass — same guard as middleware.ts. Never active in prod.
  const devBypass =
    process.env.NODE_ENV !== 'production' &&
    process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'

  if (!devBypass) {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (!token || !(await verifyGoogleToken(token))) {
      return NextResponse.json({ error: 'Missing or invalid Google token' }, { status: 401 })
    }
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
  }
  const { question, rubric, model_answer, answer } = parsed.data

  const prompt = [
    `## השאלה\n${question}`,
    `## מחוון הציונים\n${rubric}`,
    model_answer ? `## תשובת מודל\n${model_answer}` : null,
    `## תשובת הסטודנט/ית\n${answer}`,
    `דרג את התשובה לפי המחוון. JSON בלבד.`,
  ].filter(Boolean).join('\n\n')

  try {
    const reply = await callClaude({
      system: SYSTEM,
      content: [{ type: 'text', text: prompt }],
      maxTokens: 1000,
    })
    const grade = GradeResultSchema.parse(extractJsonObject(reply))
    return NextResponse.json({ ...grade, score: Math.round(grade.score) })
  } catch (e) {
    if (e instanceof AnthropicError) {
      const status = e.status === 429 ? 429 : 502
      return NextResponse.json({ error: e.message }, { status })
    }
    return NextResponse.json(
      { error: 'המודל החזיר תשובה לא תקינה — נסה שוב' },
      { status: 502 },
    )
  }
}
