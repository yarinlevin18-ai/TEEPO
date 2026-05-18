/**
 * Shared sync runner — the actual Moodle → backend → Drive sync flow,
 * extracted from SyncAllButton so both the manual button (with modal UI)
 * and the silent useAutoSync hook can share one implementation.
 *
 * Returns a tagged-union result. Callers do their own UI:
 *   - 'ok'              → results paid back (totals + per-course items)
 *   - 'wake-failed'     → couldn't reach Render at all
 *   - 'not-connected'   → backend says Moodle session is gone
 *   - 'error'           → some other failure mid-sync
 *
 * Important: this function does NOT update Drive DB on its own — the
 * caller decides whether to mirror `synced_at` onto courses (button:
 * yes, immediately; auto-sync: yes plus updates last_auto_sync_at).
 */
import { supabase } from './supabase'
import { BACKEND_URL as BACKEND } from './backend-url'
import type { Course } from '@/types'
import type { SyncProgress, SyncResultsPayload } from '@/components/sync/SyncResultsModal'

/** Backend on Render free tier sleeps after ~15min idle. The first
 *  request after that takes 30-60s to wake the container; we ping
 *  /health with a 90s timeout to absorb the cold-start so the real
 *  sync call runs against a warm server. */
async function wakeBackend(): Promise<'awake' | 'suspended' | 'unreachable'> {
  try {
    const res = await fetch(`${BACKEND}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(90_000),
    })
    if (res.ok) return 'awake'
    // Render's routing layer returns this header when there's no app
    // container behind it (suspended, failed deploy, deleted service).
    if (res.headers.get('x-render-routing') === 'no-server') return 'suspended'
    // Other 404/5xx — backend reachable, /health just missing. Let the
    // main sync decide.
    return 'awake'
  } catch {
    return 'unreachable'
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {}
}

/** Course palette — kept here so SyncAllButton and the auto-sync flow
 *  send the same color in the payload (the modal renders these dots). */
const COURSE_PALETTE = [
  '#e11d48', '#0d9488', '#6366f1', '#d97706', '#8b5cf6', '#16a34a',
] as const

function paletteIdx(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h) % COURSE_PALETTE.length
}

export type RunSyncResult =
  | { kind: 'ok'; results: SyncResultsPayload }
  | { kind: 'wake-failed'; reason: 'suspended' | 'unreachable' }
  | { kind: 'not-connected'; reason: string | null }
  | { kind: 'error'; error: string }
  | { kind: 'nothing-to-sync' }

export interface RunSyncOptions {
  courses: Course[]
  /** Optional progress callback — the button uses this to animate the
   *  "checking X of Y" label; auto-sync ignores it. Called with the
   *  cheap fake-progress ticker; backend is a single round-trip. */
  onProgress?: (p: SyncProgress) => void
  /** Auto-sync passes a shorter timeout (60s) so a wedged backend
   *  doesn't block subsequent dashboard renders. Default 90s — same
   *  as the cold-start window for the manual button. */
  wakeTimeoutMs?: number
}

/**
 * Run a full Moodle sync. Returns a tagged result describing what
 * happened. Never throws — all error paths become typed result variants.
 */
export async function runSync(opts: RunSyncOptions): Promise<RunSyncResult> {
  const { courses, onProgress } = opts

  // Build the payload — only courses with a moodle_id (or a source_url
  // for Udemy/Coursera) can possibly be scraped.
  const payload = courses
    .filter((c) => (c as any).moodle_id || c.source_url)
    .map((c) => ({
      course_id: c.id,
      moodle_id: (c as any).moodle_id ?? '',
      title: c.title,
      source_url: c.source_url ?? '',
      color: COURSE_PALETTE[paletteIdx(c.id)],
      last_synced_at: c.last_synced_at,
    }))

  if (payload.length === 0) return { kind: 'nothing-to-sync' }

  onProgress?.({ current: 0, total: payload.length, label: 'מעיר את השרת…' })

  // Wake step — short-circuit if Render is asleep AND we can't even
  // hit /health. Auto-sync exits silently here; the manual button shows
  // a "Render suspended" error.
  const wake = await wakeBackend()
  if (wake !== 'awake') {
    return { kind: 'wake-failed', reason: wake }
  }

  onProgress?.({ current: 0, total: payload.length, label: payload[0]?.title ?? 'מתחיל…' })

  // Fake progress ticker — the backend call is a single round-trip,
  // so we animate per-course to keep the modal alive. Auto-sync just
  // ignores the callback.
  let ticker: ReturnType<typeof setInterval> | null = null
  if (onProgress && payload.length > 0) {
    let i = 0
    ticker = setInterval(() => {
      i = Math.min(i + 1, payload.length)
      onProgress({
        current: i,
        total: payload.length,
        label: payload[Math.min(i, payload.length - 1)]?.title ?? '',
      })
    }, 600)
  }

  try {
    const headers = await authHeaders()
    const res = await fetch(`${BACKEND}/api/sync/all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ courses: payload }),
      signal: AbortSignal.timeout(120_000),
    })
    if (ticker) { clearInterval(ticker); ticker = null }

    if (res.status === 401) {
      return { kind: 'error', error: 'הסשן פג. צא והתחבר מחדש כדי לסנכרן.' }
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { kind: 'error', error: detail.slice(0, 200) || `HTTP ${res.status}` }
    }
    const data = (await res.json()) as SyncResultsPayload
    if (data.moodle_connected === false) {
      return { kind: 'not-connected', reason: data.moodle_error ?? null }
    }
    return { kind: 'ok', results: data }
  } catch (e: any) {
    if (ticker) clearInterval(ticker)
    let msg = e?.message || 'שגיאה לא ידועה'
    const lower = msg.toLowerCase()
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      msg = 'השרת לא הגיב תוך 2 דקות — נסה שוב בעוד דקה (השרת בRender מתעורר 30-60 שניות אחרי חוסר פעילות).'
    } else if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
      msg = 'לא הצלחנו להגיע לשרת. ודא שיש חיבור לאינטרנט ונסה שוב — אם זו הריצה הראשונה היום, השרת ב-Render לוקח כדקה להתעורר.'
    }
    return { kind: 'error', error: msg }
  }
}
