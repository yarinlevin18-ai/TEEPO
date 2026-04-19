'use client'

/**
 * notebook-ai-client — one-shot calls to the notebook-mode Claude
 * backend, used by the inline editor assistants (slash menu + bubble menu).
 *
 * The existing LessonNotebookChat keeps a persistent Socket.io connection
 * for an ongoing chat. For quick inline actions — "continue writing",
 * "fix this paragraph", "shorten selection" — we instead open a short-lived
 * socket, send ONE message with mode="notebook", wait for the `reply`,
 * and close. This keeps the surface area small and avoids interfering with
 * the chat panel's state.
 *
 * All prompts are Hebrew and instruct Claude to respond in Hebrew, since
 * that's the primary user language.
 *
 * Future surface: when we add audio transcription + summarisation of
 * recorded lessons / Zoom calls, the result can be fed in as `context`
 * here and the user can ask the AI to work with it inline.
 */

import { io, Socket } from 'socket.io-client'

const BACKEND =
  process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

/** Result of an inline AI action. Either a string to insert or an error. */
export type AiActionResult =
  | { ok: true; text: string }
  | { ok: false; error: string }

export interface AiActionInput {
  /** Instruction to Claude, already composed in Hebrew. */
  prompt: string
  /** The editor's current plain-text content (up to 150KB). */
  context: string
  /** Optional abort signal (AbortController.signal). */
  signal?: AbortSignal
  /** Optional course id (helps backend tag the session). */
  courseId?: string
}

/**
 * Fire one message and wait for the reply. Times out after 45 seconds
 * to fail gracefully if the backend is cold-starting or unreachable.
 */
export function runNotebookAi(input: AiActionInput): Promise<AiActionResult> {
  return new Promise((resolve) => {
    let settled = false
    let socket: Socket | null = null
    const TIMEOUT_MS = 45_000

    const finish = (res: AiActionResult) => {
      if (settled) return
      settled = true
      try { socket?.disconnect() } catch {}
      resolve(res)
    }

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'פג תוקף הבקשה. נסה שוב.' })
    }, TIMEOUT_MS)

    input.signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      finish({ ok: false, error: 'הפעולה בוטלה.' })
    })

    try {
      socket = io(BACKEND, {
        transports: ['websocket', 'polling'],
        reconnection: false,
        timeout: 10_000,
      })

      socket.on('connect_error', (err) => {
        clearTimeout(timer)
        finish({ ok: false, error: `שגיאת חיבור: ${err.message || 'לא הצלחתי להתחבר.'}` })
      })

      socket.on('error', (data: { message?: string }) => {
        clearTimeout(timer)
        finish({ ok: false, error: data?.message || 'שגיאה לא צפויה.' })
      })

      socket.on('reply', (data: { text?: string }) => {
        clearTimeout(timer)
        const text = (data?.text || '').trim()
        if (!text) finish({ ok: false, error: 'התשובה חזרה ריקה.' })
        else finish({ ok: true, text })
      })

      socket.on('connect', () => {
        socket!.emit('message', {
          text: input.prompt,
          context: input.context.slice(0, 150_000),
          agent_type: 'study_buddy',
          course_id: input.courseId || '',
          mode: 'notebook',
        })
      })
    } catch (err) {
      clearTimeout(timer)
      finish({ ok: false, error: `שגיאה: ${String(err)}` })
    }
  })
}

// ─────────────────────────────────────────────────────────────────────
// Prompt builders — keep these in one place so both slash and bubble
// menus can share them. Each returns a Hebrew instruction that, together
// with the context, fully specifies the task for Claude.
// ─────────────────────────────────────────────────────────────────────

/** Continue writing from where the user left off. */
export function promptContinue(): string {
  return [
    'המשך לכתוב מהמקום שעצרתי, באותו סגנון וטון.',
    'כתוב 2–3 משפטים בלבד, עברית רהוטה.',
    'אל תחזור על מה שכבר כתבתי, אל תוסיף כותרת, אל תתחיל במרכאות.',
    'החזר רק את ההמשך — טקסט גולמי בלי הסברים.',
  ].join(' ')
}

/** Summarise everything written so far. */
export function promptSummarize(): string {
  return [
    'סכם את הסיכום שלי לכמה נקודות ליבה (3–6 bullets קצרים).',
    'החזר רק את הסיכום בעברית, בלי כותרת ובלי הקדמה.',
    'השתמש ב-"- " בתחילת כל שורה.',
  ].join(' ')
}

/** Expand/elaborate on the currently focused paragraph. */
export function promptExpand(paragraph: string): string {
  return [
    'הפסקה הבאה קצרה מדי:',
    `"${paragraph}"`,
    'הרחב אותה ל-3–5 משפטים שמסבירים את הרעיון לעומק.',
    'שמור על אותו טון וסגנון שהיה במקור. החזר רק את הטקסט המורחב, בלי כותרת ובלי מרכאות.',
  ].join('\n')
}

/** Fix grammar / phrasing of the current paragraph. */
export function promptFix(paragraph: string): string {
  return [
    'תקן את הפסקה הבאה מבחינת ניסוח, דקדוק וזרימה, אבל שמור על המשמעות והטון המקוריים:',
    `"${paragraph}"`,
    'החזר רק את הגרסה המתוקנת, בלי הסברים ובלי מרכאות.',
  ].join('\n')
}

/** Turn the focused paragraph into bullet points. */
export function promptToList(paragraph: string): string {
  return [
    'הפוך את הפסקה הבאה לרשימת bullets של 3–5 נקודות קצרות:',
    `"${paragraph}"`,
    'כל שורה מתחילה ב-"- ". בלי כותרת, בלי הקדמה, רק השורות.',
  ].join('\n')
}

/** Improve selected text — keep meaning, better phrasing. */
export function promptImprove(selection: string): string {
  return [
    'שפר את ניסוח הטקסט הבא בעברית רהוטה ומדויקת, בלי לשנות את המשמעות:',
    `"${selection}"`,
    'החזר רק את הטקסט המשופר, בלי מרכאות ובלי הסברים.',
  ].join('\n')
}

/** Shorten selected text. */
export function promptShorten(selection: string): string {
  return [
    'קצר את הטקסט הבא בכ-50%, שמור על הרעיון המרכזי:',
    `"${selection}"`,
    'החזר רק את הגרסה המקוצרת, בלי מרכאות ובלי הסברים.',
  ].join('\n')
}

/** Explain the selected text to the user (inserts an explanation). */
export function promptExplain(selection: string): string {
  return [
    'הסבר את הקטע הבא בעברית פשוטה, במשפט אחד או שניים:',
    `"${selection}"`,
    'החזר רק את ההסבר, בלי מרכאות ובלי כותרת.',
  ].join('\n')
}
