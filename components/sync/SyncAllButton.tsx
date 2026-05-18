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
import { runSync } from '@/lib/run-sync'
import type { Course } from '@/types'
import SyncResultsModal, {
  type SyncProgress,
  type SyncResultsPayload,
  type SyncStage,
} from './SyncResultsModal'

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
    setStage('progress')
    setError(null)
    setProgress({ current: 0, total: 0, label: 'מעיר את השרת…' })

    const result = await runSync({
      courses,
      onProgress: (p) => setProgress(p),
    })

    switch (result.kind) {
      case 'nothing-to-sync':
        setStage('results')
        setResults({
          courses_scanned: 0,
          synced_at: new Date().toISOString(),
          results: [],
          totals: { new_assignments: 0, new_files: 0, new_grades: 0 },
        })
        return

      case 'wake-failed':
        setError(
          result.reason === 'suspended'
            ? 'שרת הסנכרון לא רץ ב-Render כרגע (suspended / לא פרוס). ' +
              'התחבר ל-Render dashboard כדי לראות למה השירות נפל ולהפעיל אותו מחדש.'
            : 'אין חיבור לשרת. בדוק שיש חיבור לאינטרנט, ושכתובת ה-backend ב-Vercel מצביעה על שירות פעיל ב-Render.',
        )
        setStage('error')
        return

      case 'not-connected':
        setNotConnectedReason(result.reason)
        setStage('not_connected')
        return

      case 'error':
        setError(result.error)
        setStage('error')
        return

      case 'ok': {
        setResults(result.results)
        setStage('results')

        // Mirror the cutoff onto Drive-DB courses so the next sync sends
        // the right baseline. Best-effort — if mutate isn't wired we just
        // skip and the next sync re-checks the full window.
        if (mutate && result.results.synced_at) {
          const syncedIds = new Set(
            result.results.results.map((r) => r.course_id).filter(Boolean),
          )
          try {
            await mutate((d: any) => ({
              ...d,
              courses: (d.courses ?? []).map((c: any) =>
                syncedIds.has(c.id) ? { ...c, last_synced_at: result.results.synced_at } : c,
              ),
            }))
          } catch {
            // non-fatal — modal still shows results
          }
        }
        return
      }
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
