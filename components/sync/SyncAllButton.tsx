'use client'

/**
 * SyncAllButton — kicks off the bulk Moodle sync flow.
 *
 * Two visual variants, same handler:
 *   - "mini"  → the green pill in the top nav (matches `.sync-mini` in the mockup)
 *   - "ghost" → the page-head ghost button on /assignments
 *
 * Behaviour: opens the SyncResultsModal in "progress" state, fires the
 * POST /api/sync/all request, then transitions the modal to its
 * "results" or "error" state when the response lands. Mirrors the
 * returned `synced_at` cutoff onto each course in the local Drive DB
 * so the next sync-all call sends the right diff baseline.
 */

import { useCallback, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useDB } from '@/lib/db-context'
import { supabase } from '@/lib/supabase'
import type { Course } from '@/types'
import SyncResultsModal, {
  type SyncProgress,
  type SyncResultsPayload,
  type SyncStage,
} from './SyncResultsModal'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

/** Backend on Render free tier sleeps after ~15min idle. The first
 *  request after that takes 30-60s to wake the container, and the
 *  browser kills the connection long before — surfacing as a generic
 *  "Failed to fetch". We do a separate /health ping FIRST with a 90s
 *  timeout to absorb the cold-start; the real sync call then runs
 *  against a warm server. */
async function wakeBackend(): Promise<void> {
  try {
    await fetch(`${BACKEND}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(90_000),
    })
  } catch {
    // Best-effort — if /health is unreachable the main fetch below
    // will fail with a clearer message we can surface to the user.
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {}
}

// Deterministic palette index — must match /assignments and /summaries so the
// course dots in the modal use the same color the user sees elsewhere.
const COURSE_PALETTE: Array<{ color: string; soft: string }> = [
  { color: '#e11d48', soft: 'rgba(225,29,72,.12)' }, // rose
  { color: '#0d9488', soft: 'rgba(13,148,136,.12)' }, // teal
  { color: '#6366f1', soft: 'rgba(99,102,241,.12)' }, // indigo
  { color: '#d97706', soft: 'rgba(217,119,6,.12)' }, // amber
  { color: '#8b5cf6', soft: 'rgba(139,92,246,.12)' }, // violet
  { color: '#16a34a', soft: 'rgba(22,163,74,.12)' }, // accent
]

function paletteIdx(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return Math.abs(h) % COURSE_PALETTE.length
}

interface Props {
  variant?: 'mini' | 'ghost'
  label?: string
  className?: string
}

export default function SyncAllButton({ variant = 'mini', label, className = '' }: Props) {
  const { db, mutate } = useDB() as { db: { courses?: Course[] } | null; mutate?: (fn: (d: any) => any) => Promise<void> }
  const [stage, setStage] = useState<SyncStage>('idle')
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [results, setResults] = useState<SyncResultsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notConnectedReason, setNotConnectedReason] = useState<string | null>(null)

  const close = useCallback(() => {
    if (stage === 'progress') return // don't allow close mid-flight
    setStage('idle')
    setProgress(null)
    setResults(null)
    setError(null)
    setNotConnectedReason(null)
  }, [stage])

  const run = useCallback(async () => {
    const courses = (db?.courses ?? []) as Course[]
    // Snapshot the moodle-sourced courses for the request — anything without
    // a moodle_id can't be synced from Moodle anyway.
    const payload = courses
      .filter((c) => (c as any).moodle_id || c.source_url)
      .map((c) => {
        const idx = paletteIdx(c.id)
        return {
          course_id: c.id,
          moodle_id: (c as any).moodle_id ?? '',
          title: c.title,
          source_url: c.source_url ?? '',
          color: COURSE_PALETTE[idx].color,
          last_synced_at: c.last_synced_at,
        }
      })

    setStage('progress')
    setError(null)
    setProgress({ current: 0, total: payload.length, label: 'מעיר את השרת…' })

    // Wake the Render free-tier backend first — first request after
    // ~15min idle takes ~60s as the container boots. Without this the
    // main fetch dies with "Failed to fetch" and the user thinks
    // something is broken.
    await wakeBackend()
    setProgress({ current: 0, total: payload.length, label: payload[0]?.title ?? 'מתחיל…' })

    // Cheap progress animation — the backend call is a single round-trip,
    // so we fake the "checking course X of Y" step to keep the modal alive.
    let ticker: ReturnType<typeof setInterval> | null = null
    if (payload.length > 0) {
      let i = 0
      ticker = setInterval(() => {
        i = Math.min(i + 1, payload.length)
        setProgress({
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
      if (ticker) clearInterval(ticker)
      if (res.status === 401) {
        throw new Error('הסשן פג. צא והתחבר מחדש כדי לסנכרן.')
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(detail.slice(0, 200) || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as SyncResultsPayload
      // Short-circuit when the backend tells us Moodle isn't connected —
      // show the "connect" CTA instead of confusing empty results.
      if (data.moodle_connected === false) {
        setNotConnectedReason(data.moodle_error ?? null)
        setStage('not_connected')
        return
      }
      setResults(data)
      setStage('results')

      // Mirror the cutoff onto Drive-DB courses so the next sync sends
      // the right baseline. Best-effort — if mutate isn't wired we just
      // skip and the next sync re-checks the full window.
      if (mutate && data.synced_at) {
        const syncedIds = new Set(data.results.map((r) => r.course_id).filter(Boolean))
        try {
          await mutate((d: any) => ({
            ...d,
            courses: (d.courses ?? []).map((c: any) =>
              syncedIds.has(c.id) ? { ...c, last_synced_at: data.synced_at } : c,
            ),
          }))
        } catch {
          // non-fatal — modal still shows results
        }
      }
    } catch (e: any) {
      if (ticker) clearInterval(ticker)
      // Translate the common low-level failures into Hebrew the user
      // can actually act on. "Failed to fetch" is the WebKit/Blink
      // umbrella message for network errors — most often it means the
      // Render backend timed out waking up, sometimes it means we're
      // offline.
      let msg = e?.message || 'שגיאה לא ידועה'
      const lower = msg.toLowerCase()
      if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
        msg = 'השרת לא הגיב תוך 2 דקות — נסה שוב בעוד דקה (השרת בRender מתעורר 30-60 שניות אחרי חוסר פעילות).'
      } else if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
        msg = 'לא הצלחנו להגיע לשרת. ודא שיש חיבור לאינטרנט ונסה שוב — אם זו הריצה הראשונה היום, השרת ב-Render לוקח כדקה להתעורר.'
      }
      setError(msg)
      setStage('error')
    }
  }, [db?.courses, mutate])

  const Icon = (
    <RefreshCw size={variant === 'mini' ? 14 : 15} className={stage === 'progress' ? 'sync-icon-spin' : ''} />
  )

  const button =
    variant === 'mini' ? (
      <button
        type="button"
        className={`sync-mini ${stage === 'progress' ? 'syncing' : ''} ${className}`}
        onClick={run}
        title="סרוק את כל הקורסים עכשיו"
        disabled={stage === 'progress'}
      >
        {Icon}
        <span>{label ?? 'סנכרן'}</span>
      </button>
    ) : (
      <button
        type="button"
        className={`asn-btn asn-btn-ghost ${className}`}
        onClick={run}
        disabled={stage === 'progress'}
      >
        {Icon}
        <span>{label ?? 'סנכרן הכל מ-Moodle'}</span>
      </button>
    )

  return (
    <>
      {button}
      <SyncResultsModal
        stage={stage}
        progress={progress}
        results={results}
        error={error}
        notConnectedReason={notConnectedReason}
        onRetry={run}
        onClose={close}
      />
    </>
  )
}
