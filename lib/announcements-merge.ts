/**
 * Pure-function helpers for merging Moodle announcement scrape results
 * into the persistent Drive DB list. Extracted from useAutoSync so the
 * dedup-and-cap logic can be unit-tested without a React/DOM env.
 *
 * Contract:
 *   - Dedup by `url` (Moodle forum discussion URLs are stable per post)
 *   - Existing entries' `acknowledged_at` is preserved (we don't want
 *     "marking as read" to be undone by the next sync)
 *   - Existing entries' title/body/author CAN be updated (instructor
 *     edited the post — we want fresh content)
 *   - Cap at MAX_KEPT items, sorted by posted_at desc, keep newest
 */

import type { Announcement, Course } from '@/types'
import type { SyncCourseResult, SyncAnnouncementItem } from '@/components/sync/SyncResultsModal'

/** Total announcement cap across all courses. Generous — we trim from
 *  the OLDEST end, so adding new posts never pushes recent ones out
 *  prematurely. Bumping this is cheap (just db.json size). */
export const MAX_KEPT_ANNOUNCEMENTS = 50

/** Convert a sync result's announcement into the persistent shape.
 *  Pull `course_id`, `course_color` from the parent SyncCourseResult
 *  (the item itself doesn't carry them — they're per-course attributes). */
function fromSyncItem(
  item: SyncAnnouncementItem,
  parent: SyncCourseResult,
  syncedAt: string,
): Announcement {
  return {
    id: `${parent.course_id ?? 'unknown'}::${item.url}`,
    course_id: parent.course_id ?? null,
    course_name: parent.course_name,
    course_color: parent.course_color ?? null,
    title: item.title,
    body: item.body,
    author: item.author,
    // Moodle ships unix seconds; we store ISO for consistency with the
    // rest of Drive DB (Assignment.deadline, StudyTask.scheduled_date).
    posted_at: new Date(item.posted_at * 1000).toISOString(),
    url: item.url,
    forum_name: item.forum_name,
    synced_at: syncedAt,
    acknowledged_at: null,
  }
}

export interface MergeOptions {
  /** Existing announcements from db.announcements (undefined treated as []). */
  existing: Announcement[] | undefined
  /** Per-course sync results, each with `new_announcements`. */
  syncResults: SyncCourseResult[]
  /** When the sync completed — used as `synced_at` on the new entries. */
  syncedAt: string
}

export interface MergeResult {
  /** The new full announcements list (capped, sorted, ready to persist). */
  merged: Announcement[]
  /** How many entries are truly NEW (weren't in `existing` by URL).
   *  Drives the "X הודעות חדשות" toast / counter on the dashboard. */
  newCount: number
}

/**
 * Merge fresh sync results into the persisted list. Dedup by URL,
 * preserve user's acknowledged_at, cap to MAX_KEPT_ANNOUNCEMENTS,
 * sort by posted_at desc.
 */
export function mergeAnnouncements({ existing, syncResults, syncedAt }: MergeOptions): MergeResult {
  const byUrl = new Map<string, Announcement>()

  // Seed with existing — these always win on `acknowledged_at` (we don't
  // want a sync to undo a user's "mark as read"). Content fields lose
  // to fresh sync data below.
  for (const ann of existing ?? []) {
    byUrl.set(ann.url, ann)
  }

  let newCount = 0

  for (const courseResult of syncResults) {
    for (const item of courseResult.new_announcements ?? []) {
      if (!item.url) continue  // defensive — shouldn't happen but guards an empty map key
      const fresh = fromSyncItem(item, courseResult, syncedAt)
      const prior = byUrl.get(item.url)
      if (prior) {
        // Update content fields but keep the user's ack state.
        byUrl.set(item.url, {
          ...prior,
          title: fresh.title,
          body: fresh.body,
          author: fresh.author,
          posted_at: fresh.posted_at,
          forum_name: fresh.forum_name,
          // synced_at bumps so "freshly seen" indicator stays meaningful
          synced_at: fresh.synced_at,
          // course meta also refreshes — instructor might have renamed
          course_name: fresh.course_name,
          course_color: fresh.course_color,
        })
      } else {
        byUrl.set(item.url, fresh)
        newCount += 1
      }
    }
  }

  // Sort by posted_at desc, then cap. Trimming from the END means we
  // drop the OLDEST entries when over the cap — recent posts always win.
  const merged = Array.from(byUrl.values())
    .sort((a, b) => (b.posted_at ?? '').localeCompare(a.posted_at ?? ''))
    .slice(0, MAX_KEPT_ANNOUNCEMENTS)

  return { merged, newCount }
}

/** Mark a single announcement as read (acknowledged). Returns a NEW
 *  array — Drive DB expects immutable updates. No-op when the id isn't
 *  found OR when it's already acknowledged. */
export function acknowledgeAnnouncement(
  existing: Announcement[] | undefined,
  id: string,
  at: string = new Date().toISOString(),
): Announcement[] {
  if (!existing) return []
  return existing.map((a) =>
    a.id === id && !a.acknowledged_at ? { ...a, acknowledged_at: at } : a,
  )
}

/** Mark all unread announcements as read. Used by the dashboard's
 *  "סמן הכל כנקרא" CTA. */
export function acknowledgeAllAnnouncements(
  existing: Announcement[] | undefined,
  at: string = new Date().toISOString(),
): Announcement[] {
  if (!existing) return []
  return existing.map((a) => (a.acknowledged_at ? a : { ...a, acknowledged_at: at }))
}

/** Count unread (acknowledged_at == null). Used by the topnav badge. */
export function countUnread(existing: Announcement[] | undefined): number {
  if (!existing) return 0
  return existing.filter((a) => !a.acknowledged_at).length
}

/** Best-effort: resolve a Moodle `course_moodle_id` (from the scraper)
 *  back to a Drive DB course uuid. Used when the sync result's
 *  `course_id` is missing (older backend). Currently unused — sync
 *  results always carry `course_id` post-PR #169 — but kept for the
 *  inevitable backend rollback we'd hit otherwise. */
export function lookupCourseId(courses: Course[], moodleId: string | number): string | null {
  if (!moodleId) return null
  const target = String(moodleId)
  const match = courses.find((c) => String((c as any).moodle_id ?? '') === target)
  return match?.id ?? null
}
