/**
 * POST /api/quiz/generate
 *
 * Turn a set of the user's own Drive files (a week's course material) into a
 * retrieval-practice quiz: constructed-response questions, each with a
 * grading rubric and a model answer. Phosphor-style — see docs/REBUILD_PLAN.md.
 *
 * Body: {
 *   files?: [{ id, name, mimeType }, ...]   // 0–6 Drive files
 *   text?: string                            // pasted material (no Drive needed)
 *   courseName: string
 *   questionCount?: number                   // 3–8, default 5
 * }
 * At least one of files/text must yield material.
 * Auth: Bearer <google_access_token> (drive.file scope — same files TEEPO
 *       already manages). The token doubles as the auth gate: if Drive
 *       rejects it, the request dies before any Anthropic tokens are spent.
 *       Under the dev auth bypass (same flag + prod guard as middleware.ts)
 *       the token is not required — text-only generation works offline.
 *
 * Response: { title, questions: [{ question, rubric, model_answer }], skipped: string[] }
 *
 * Why server-side: the Anthropic key must not reach the browser, and PDFs go
 * to Claude as base64 document blocks — fetching them here (Drive → server →
 * Anthropic) avoids a second multi-MB hop through the client.
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { callClaude, anthropicConfigured, AnthropicError, type ContentBlock } from '@/lib/practice/anthropic'
import { GeneratedQuizSchema, extractJsonObject } from '@/lib/practice/schemas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Multi-file PDF ingestion + generation can take a while.
export const maxDuration = 60

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

// Dev-only bypass — same guard as middleware.ts. Never active in prod.
const DEV_AUTH_BYPASS =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'

/** Per-PDF and total caps keep us inside Anthropic's request limit (and
 *  Vercel's memory) — a full semester scan is not the use case, one week is. */
const MAX_PDF_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
const MAX_TEXT_CHARS = 120_000

const BodySchema = z.object({
  files: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    mimeType: z.string().min(1),
  })).max(6).default([]),
  /** Pasted material — an alternative (or addition) to Drive files. */
  text: z.string().trim().min(40).max(200_000).optional(),
  courseName: z.string().min(1),
  questionCount: z.number().int().min(3).max(8).default(5),
})

const GOOGLE_EXPORTABLE = new Set([
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.presentation',
])

const SYSTEM = `You are the quiz author inside TEEPO, a study platform for Israeli university students.
You receive course material (lecture slides, notes, summaries) and write a retrieval-practice quiz.

Rules:
- Base every question ONLY on the provided material. Never invent facts that are not in it.
- Write constructed-response (open) questions that require explaining, deriving, applying or comparing — not yes/no, not multiple choice, and not trivia about section numbers or formatting.
- Cover the material's most important concepts; prefer breadth over asking twice about one topic.
- Write questions and model answers in the language of the material (Hebrew material → Hebrew questions).
- For each question write a grading rubric: 2–4 criteria, each with a point weight, weights summing to 100. The rubric must be concrete enough that a grader who has not seen the material could apply it.
- Keep the model answer concise (3–6 sentences) — the ideal full-credit answer.
- "title" is a short Hebrew label for the quiz based on the material's topic (not the file names).

Output STRICT JSON only, no markdown fences, matching:
{"title": string, "questions": [{"question": string, "rubric": string, "model_answer": string}]}`

async function driveFetch(token: string, url: string): Promise<Response> {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
}

export async function POST(req: NextRequest) {
  if (!anthropicConfigured()) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY חסר בהגדרות השרת' },
      { status: 503 },
    )
  }

  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token && !DEV_AUTH_BYPASS) {
    return NextResponse.json({ error: 'Missing Google token' }, { status: 401 })
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
  }
  const { files, text, courseName, questionCount } = parsed.data
  if (files.length === 0 && !text) {
    return NextResponse.json({ error: 'בחר קבצים או הדבק טקסט' }, { status: 400 })
  }

  // ── Pull material out of Drive ──────────────────────────────────────
  const blocks: ContentBlock[] = []
  const skipped: string[] = []
  let totalBytes = 0

  if (!token) {
    // Dev bypass without a real Google token — Drive is unreachable.
    skipped.push(...files.map(f => f.name))
  } else {
    for (const f of files) {
      try {
        if (GOOGLE_EXPORTABLE.has(f.mimeType)) {
          const res = await driveFetch(
            token,
            `${DRIVE_API}/files/${f.id}/export?mimeType=${encodeURIComponent('text/plain')}`,
          )
          // Under the bypass a 401 just means the fake token can't reach
          // Drive — degrade to "skipped" instead of failing the request.
          if (res.status === 401 && !DEV_AUTH_BYPASS) {
            return NextResponse.json({ error: 'Google token expired' }, { status: 401 })
          }
          if (!res.ok) { skipped.push(f.name); continue }
          const body = (await res.text()).slice(0, MAX_TEXT_CHARS)
          if (!body.trim()) { skipped.push(f.name); continue }
          blocks.push({ type: 'text', text: `--- קובץ: ${f.name} ---\n${body}` })
        } else if (f.mimeType === 'application/pdf') {
          const res = await driveFetch(token, `${DRIVE_API}/files/${f.id}?alt=media`)
          if (res.status === 401 && !DEV_AUTH_BYPASS) {
            return NextResponse.json({ error: 'Google token expired' }, { status: 401 })
          }
          if (!res.ok) { skipped.push(f.name); continue }
          const buf = await res.arrayBuffer()
          if (buf.byteLength > MAX_PDF_BYTES || totalBytes + buf.byteLength > MAX_TOTAL_BYTES) {
            skipped.push(f.name)
            continue
          }
          totalBytes += buf.byteLength
          blocks.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: Buffer.from(buf).toString('base64'),
            },
          })
        } else if (f.mimeType.startsWith('text/')) {
          const res = await driveFetch(token, `${DRIVE_API}/files/${f.id}?alt=media`)
          if (res.status === 401 && !DEV_AUTH_BYPASS) {
            return NextResponse.json({ error: 'Google token expired' }, { status: 401 })
          }
          if (!res.ok) { skipped.push(f.name); continue }
          const body = (await res.text()).slice(0, MAX_TEXT_CHARS)
          blocks.push({ type: 'text', text: `--- קובץ: ${f.name} ---\n${body}` })
        } else {
          skipped.push(f.name)
        }
      } catch {
        skipped.push(f.name)
      }
    }
  }

  if (text) {
    blocks.push({ type: 'text', text: `--- חומר שהודבק ---\n${text.slice(0, MAX_TEXT_CHARS)}` })
  }

  if (blocks.length === 0) {
    return NextResponse.json(
      { error: 'לא הצלחנו לקרוא אף אחד מהקבצים שנבחרו', skipped },
      { status: 422 },
    )
  }

  blocks.push({
    type: 'text',
    text: `החומר לעיל שייך לקורס "${courseName}". כתוב בוחן תרגול של ${questionCount} שאלות פתוחות על החומר, לפי הכללים במשימה שלך. JSON בלבד.`,
  })

  // ── Generate ────────────────────────────────────────────────────────
  try {
    const reply = await callClaude({ system: SYSTEM, content: blocks, maxTokens: 4000 })
    const quiz = GeneratedQuizSchema.parse(extractJsonObject(reply))
    return NextResponse.json({ ...quiz, skipped })
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
