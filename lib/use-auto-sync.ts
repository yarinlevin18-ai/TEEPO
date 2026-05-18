'use client'

/**
 * useAutoSync — silently sync Moodle data when the dashboard loads,
 * if enough time has passed since the last automatic sync.
 *
 * Design decisions:
 *   - Client-driven, NOT a Vercel cron. Cron has no JWT to send, can't
 *     write to the user's Drive (the OAuth token lives in their
 *     browser), and the backend's Moodle session is per-user. Client
 *     piggybacks on existing auth and only burns Render compute when
 *     the user is actually using the app.
 *   - Cooldown via `db.settings.last_auto_sync_at`. We DON'T touch this
 *     field for manual syncs (the "מסנכרן" button) — users should be
 *     able to refresh on demand without delaying the next automatic
 *     run.
 *   - Cross-tab guard via localStorage. If the user has 3 tabs open we
 *     only let one of them run the sync (the others see the lock and
 *     skip). Lock auto-expires after 5 min so a hung sync doesn't
 *     block forever.
 *   - 30-second startup delay so we don't compete with the page's
 *     initial data hydration for network bandwidth.
 *   - Errors are silent (logged to console). The user discovers
 *     sync state via the freshness indicator in the topnav — we
 *     don't pop modals at them while they're trying to use the app.
 */

import { useEffect, useRef } from 'react'
import { useDB } from './db-context'
import { runSync } from './run-sync'
import { mergeAnnouncements } from './announcements-merge'
import type { Announcement, Course } from '@/types'

/** Auto-sync if `last_auto_sync_at` is older than this. Lecture loads
 *  + Moodle scrapes are non-trivial so we don't want to hammer the
 *  backend on every page navigation. 6h matches a typical "morning
 *  + afternoon" study cadence — student opens TEEPO in the morning,
 *  sees fresh data; reopens after lunch, sees the next sync. */
const AUTO_SYNC_INTERVAL_HOURS = 6

/** Delay between dashboard mount and the actual sync fire. Lets the
 *  page settle (Drive DB hydrates, calendar fetches, topnav renders)
 *  before we kick off a 30-90s backend request. */
const STARTUP_DELAY_MS = 30_000

/** localStorage key for the cross-tab in-progress flag. Value is a
 *  millis timestamp; lock auto-expires after LOCK_TTL_MS. */
const LOCK_KEY = 'teepo_auto_sync_lock'
const LOCK_TTL_MS = 5 * 60 * 1000  // 5 minutes — longer than any realistic sync

function shouldAutoSync(lastAt: string | undefined, courses: Course[]): boolean {
  // Need at least one Moodle-sourced course for the sync to do anything.
  const hasSyncable = courses.some((c) => (c as any).moodle_id || c.source_url)
  if (!hasSyncable) return false

  if (!lastAt) return true  // never synced before
  const last = new Date(lastAt).getTime()
  if (Number.isNaN(last)) return true
  const ageMs = Date.now() - last
  return ageMs >= AUTO_SYNC_INTERVAL_HOURS * 60 * 60 * 1000
}

/** Try to acquire the cross-tab lock. Returns true if we got it.
 *  Stale locks (older than LOCK_TTL_MS) are stolen — protects against
 *  a tab that crashed mid-sync without releasing. */
function acquireLock(): boolean {
  if (typeof localStorage === 'undefined') return true
  const existing = localStorage.getItem(LOCK_KEY)
  if (existing) {
    const ts = parseInt(existing, 10)
    if (!Number.isNaN(ts) && Date.now() - ts < LOCK_TTL_MS) {
      return false  // another tab is mid-sync
    }
  }
  localStorage.setItem(LOCK_KEY, String(Date.now()))
  return true
}

function releaseLock(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(LOCK_KEY)
}

export interface UseAutoSyncOptions {
  /** Skip the sync if Moodle is disconnected — pointless to try and
   *  it just spams the user's console with "not-connected" warnings.
   *  Caller passes the live state from useMoodleStatus / db settings. */
  moodleConnected?: boolean
  /** Optional: kill switch (e.g. user is on a tab that they explicitly
   *  marked "don't sync from this tab"). Default true. */
  enabled?: boolean
}

/**
 * Mount once in the dashboard layout. The hook fires at most once per
 * dashboard session (and silently bails if anything's wrong).
 */
export function useAutoSync({ moodleConnected, enabled = true }: UseAutoSyncOptions = {}): void {
  const { db, ready, mutate, updateSettings } = useDB() as any
  // Guard against StrictMode double-invocation and React 18 effects
  // re-running. Once we've decided to fire (or skip), don't reconsider.
  const decidedRef = useRef(false)

  useEffect(() => {
    if (!enabled || !ready || decidedRef.current) return

    const courses: Course[] = (db?.courses ?? []) as Course[]
    const lastAt: string | undefined = db?.settings?.last_auto_sync_at

    if (!shouldAutoSync(lastAt, courses)) {
      decidedRef.current = true
      return
    }
    // Don't bother trying when the backend says Moodle isn't connected
    // — the sync will just return 'not-connected' and waste a wake.
    if (moodleConnected === false) {
      decidedRef.current = true
      return
    }
    decidedRef.current = true

    let cancelled = false
    const timer = setTimeout(async () => {
      if (cancelled) return
      if (!acquireLock()) {
        // Another tab is doing this — just bail; the other tab's success
        // will eventually flow into db.settings.last_auto_sync_at and
        // our next page load will see fresh state.
        return
      }
      try {
        const result = await runSync({ courses })
        switch (result.kind) {
          case 'ok': {
            // Mirror per-course cutoff (same as the button) + merge new
            // announcements into the persistent list + bump the auto-sync
            // timestamp so we won't refire for another 6h.
            const syncedAt = result.results.synced_at
            const syncedIds = new Set(
              result.results.results.map((r) => r.course_id).filter(Boolean),
            )

            // Pre-compute the merged announcements list using the pure
            // helper so the mutate() closure stays small and we can log
            // the new count for visibility.
            const existingAnns = (db?.announcements ?? []) as Announcement[]
            const mergedAnns = mergeAnnouncements({
              existing: existingAnns,
              syncResults: result.results.results,
              syncedAt,
            })

            if (mutate) {
              try {
                await mutate((d: any) => ({
                  ...d,
                  courses: (d.courses ?? []).map((c: any) =>
                    syncedIds.has(c.id) ? { ...c, last_synced_at: syncedAt } : c,
                  ),
                  // Persist the merged announcements list. mergeAnnouncements
                  // already capped + sorted + preserved acknowledged_at.
                  announcements: mergedAnns.merged,
                }))
              } catch {
                /* non-fatal */
              }
            }
            if (typeof updateSettings === 'function') {
              try { await updateSettings({ last_auto_sync_at: new Date().toISOString() }) } catch { /* non-fatal */ }
            }
            // eslint-disable-next-line no-console
            console.info(
              `[auto-sync] ok — ${result.results.totals.new_assignments} new assignments, ` +
              `${result.results.totals.new_files} new files, ` +
              `${result.results.totals.new_grades} new grades, ` +
              `${mergedAnns.newCount} new announcements`,
            )
            break
          }
          case 'nothing-to-sync':
            // Bump the timestamp anyway — no courses to sync means
            // there's nothing to discover; don't re-attempt every page
            // load until the user adds a course.
            if (typeof updateSettings === 'function') {
              try { await updateSettings({ last_auto_sync_at: new Date().toISOString() }) } catch { /* non-fatal */ }
            }
            break
          case 'wake-failed':
            // eslint-disable-next-line no-console
            console.warn(`[auto-sync] backend ${result.reason} — will retry next dashboard load`)
            break
          case 'not-connected':
            // eslint-disable-next-line no-console
            console.info('[auto-sync] Moodle session expired; user needs to reconnect at /moodle')
            break
          case 'error':
            // eslint-disable-next-line no-console
            console.warn('[auto-sync] failed:', result.error)
            break
        }
      } finally {
        releaseLock()
      }
    }, STARTUP_DELAY_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // We intentionally only depend on `ready` + `enabled` + `moodleConnected` —
    // re-running on every db change would defeat the cooldown. The hook
    // makes its fire/skip decision once and sticks with it via decidedRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, enabled, moodleConnected])
}
