/**
 * Pure-function tests for the announcements merge pipeline. The
 * useAutoSync hook + dashboard widget are integration-tested by the
 * consumer pages; these tests pin the dedup / cap / preservation rules
 * that the entire UX depends on.
 */
import { describe, it, expect } from 'vitest'
import type { Announcement } from '@/types'
import type { SyncCourseResult } from '@/components/sync/SyncResultsModal'
import {
  mergeAnnouncements,
  acknowledgeAnnouncement,
  acknowledgeAllAnnouncements,
  countUnread,
  MAX_KEPT_ANNOUNCEMENTS,
} from '@/lib/announcements-merge'

// ──────────────────────────────────────────────────────────────────────
// Test helpers
// ──────────────────────────────────────────────────────────────────────

function existingAnn(over: Partial<Announcement> = {}): Announcement {
  return {
    id: 'course-1::https://moodle.example/discuss/123',
    course_id: 'course-1',
    course_name: 'מבני נתונים',
    course_color: '#0d9488',
    title: 'הודעה לדוגמה',
    body: 'גוף הודעה...',
    author: 'פרופ׳ לוי',
    posted_at: '2026-05-01T10:00:00.000Z',
    url: 'https://moodle.example/discuss/123',
    forum_name: 'הודעות',
    synced_at: '2026-05-01T10:05:00.000Z',
    acknowledged_at: null,
    ...over,
  }
}

function courseResult(
  newAnns: Array<{
    url: string
    title?: string
    body?: string
    author?: string
    posted_at?: number  // unix seconds
    forum_name?: string
  }>,
  over: Partial<SyncCourseResult> = {},
): SyncCourseResult {
  return {
    course_id: 'course-1',
    moodle_id: '1234',
    course_name: 'מבני נתונים',
    course_color: '#0d9488',
    new_assignments: [],
    new_files: [],
    new_grades: [],
    new_announcements: newAnns.map(a => ({
      title: a.title ?? 'הודעה חדשה',
      body: a.body ?? 'גוף',
      author: a.author ?? 'מרצה',
      posted_at: a.posted_at ?? 1716105600,  // 2024-05-19 ~10:00 UTC
      url: a.url,
      forum_name: a.forum_name ?? 'הודעות',
    })),
    error: null,
    ...over,
  }
}

const SYNCED_AT = '2026-05-19T12:00:00.000Z'

// ──────────────────────────────────────────────────────────────────────
// mergeAnnouncements
// ──────────────────────────────────────────────────────────────────────

describe('mergeAnnouncements', () => {
  it('returns empty merged + newCount=0 when no existing and no sync results', () => {
    const result = mergeAnnouncements({
      existing: undefined,
      syncResults: [],
      syncedAt: SYNCED_AT,
    })
    expect(result.merged).toEqual([])
    expect(result.newCount).toBe(0)
  })

  it('adds a fresh announcement when nothing existed before', () => {
    const result = mergeAnnouncements({
      existing: [],
      syncResults: [
        courseResult([{ url: 'https://moodle/disc/1', title: 'מבחן בעוד שבוע' }]),
      ],
      syncedAt: SYNCED_AT,
    })
    expect(result.newCount).toBe(1)
    expect(result.merged).toHaveLength(1)
    expect(result.merged[0].title).toBe('מבחן בעוד שבוע')
    expect(result.merged[0].acknowledged_at).toBe(null)
    expect(result.merged[0].synced_at).toBe(SYNCED_AT)
  })

  it('does NOT bump newCount when an announcement with the same URL re-appears', () => {
    const prior = existingAnn({ url: 'https://moodle/disc/123' })
    const result = mergeAnnouncements({
      existing: [prior],
      syncResults: [
        courseResult([{ url: 'https://moodle/disc/123', title: 'עודכן: מבחן בעוד שבועיים' }]),
      ],
      syncedAt: SYNCED_AT,
    })
    expect(result.newCount).toBe(0)
    expect(result.merged).toHaveLength(1)
  })

  it('refreshes content fields (title/body/author) for re-appearing posts', () => {
    const prior = existingAnn({
      url: 'https://moodle/disc/123',
      title: 'הודעה ישנה',
      body: 'גוף ישן',
      author: 'אבי',
    })
    const result = mergeAnnouncements({
      existing: [prior],
      syncResults: [
        courseResult([{
          url: 'https://moodle/disc/123',
          title: 'הודעה מעודכנת',
          body: 'גוף חדש',
          author: 'מאיה',
        }]),
      ],
      syncedAt: SYNCED_AT,
    })
    expect(result.merged[0].title).toBe('הודעה מעודכנת')
    expect(result.merged[0].body).toBe('גוף חדש')
    expect(result.merged[0].author).toBe('מאיה')
  })

  it('PRESERVES acknowledged_at across a re-sync', () => {
    // Critical invariant: marking-as-read must not be undone by syncing.
    const ackTime = '2026-05-15T09:00:00.000Z'
    const prior = existingAnn({
      url: 'https://moodle/disc/123',
      acknowledged_at: ackTime,
    })
    const result = mergeAnnouncements({
      existing: [prior],
      syncResults: [
        courseResult([{ url: 'https://moodle/disc/123', title: 'הודעה עם תיקון' }]),
      ],
      syncedAt: SYNCED_AT,
    })
    expect(result.merged[0].acknowledged_at).toBe(ackTime)
  })

  it('bumps synced_at on the touched entry — so the "freshly seen" hint stays meaningful', () => {
    const prior = existingAnn({
      url: 'https://moodle/disc/123',
      synced_at: '2026-04-01T10:00:00.000Z',
    })
    const result = mergeAnnouncements({
      existing: [prior],
      syncResults: [courseResult([{ url: 'https://moodle/disc/123' }])],
      syncedAt: SYNCED_AT,
    })
    expect(result.merged[0].synced_at).toBe(SYNCED_AT)
  })

  it('sorts by posted_at DESC so newest are first', () => {
    // unix seconds for predictable comparison
    const oldest = courseResult([{
      url: 'https://moodle/disc/old',
      title: 'ישנה',
      posted_at: 1600000000,  // 2020
    }])
    const newest = courseResult([{
      url: 'https://moodle/disc/new',
      title: 'חדשה',
      posted_at: 1800000000,  // 2027
    }])
    const middle = courseResult([{
      url: 'https://moodle/disc/mid',
      title: 'אמצע',
      posted_at: 1700000000,  // 2023
    }])
    const result = mergeAnnouncements({
      existing: [],
      syncResults: [oldest, newest, middle],
      syncedAt: SYNCED_AT,
    })
    expect(result.merged.map(a => a.title)).toEqual(['חדשה', 'אמצע', 'ישנה'])
  })

  it(`caps the list at MAX_KEPT_ANNOUNCEMENTS (${MAX_KEPT_ANNOUNCEMENTS}), trimming OLDEST first`, () => {
    // Existing: 30 entries, posted_at from oldest (2020) to newer (2023).
    const existing: Announcement[] = []
    for (let i = 0; i < 30; i++) {
      existing.push(existingAnn({
        id: `course-1::https://moodle/old-${i}`,
        url: `https://moodle/old-${i}`,
        title: `ישנה ${i}`,
        posted_at: new Date(2020, 0, i + 1).toISOString(),
      }))
    }
    // Incoming: 25 NEW entries with newer timestamps. Total 55 → 5 over the cap.
    const incomingNew = []
    for (let i = 0; i < 25; i++) {
      incomingNew.push({
        url: `https://moodle/new-${i}`,
        title: `חדשה ${i}`,
        posted_at: Math.floor(new Date(2026, 0, i + 1).getTime() / 1000),
      })
    }
    const result = mergeAnnouncements({
      existing,
      syncResults: [courseResult(incomingNew)],
      syncedAt: SYNCED_AT,
    })
    expect(result.merged.length).toBe(MAX_KEPT_ANNOUNCEMENTS)
    expect(result.newCount).toBe(25)
    // Newest entries kept; oldest dropped. The first item should be the
    // newest incoming entry, the last should NOT be one of the 5 oldest
    // existing items (id 0..4) — those were trimmed.
    const titles = result.merged.map(a => a.title)
    expect(titles[0]).toBe('חדשה 24')  // newest incoming
    // The 5 oldest existing (ישנה 0..4) should be trimmed.
    for (let i = 0; i < 5; i++) {
      expect(titles).not.toContain(`ישנה ${i}`)
    }
  })

  it('skips items with empty URL (defensive — avoids polluting the dedup map)', () => {
    const result = mergeAnnouncements({
      existing: [],
      syncResults: [
        courseResult([
          { url: '', title: 'ללא URL — צריך לדלג' },
          { url: 'https://moodle/disc/ok', title: 'תקין' },
        ]),
      ],
      syncedAt: SYNCED_AT,
    })
    expect(result.merged).toHaveLength(1)
    expect(result.merged[0].title).toBe('תקין')
  })

  it('handles multiple courses in the same sync run, attributing each announcement to its course', () => {
    const a = courseResult([{ url: 'https://moodle/a/1', title: 'מקורס א' }], {
      course_id: 'course-a',
      course_name: 'אלגוריתמים',
      course_color: '#8b5cf6',
    })
    const b = courseResult([{ url: 'https://moodle/b/1', title: 'מקורס ב' }], {
      course_id: 'course-b',
      course_name: 'מבני נתונים',
      course_color: '#0d9488',
    })
    const result = mergeAnnouncements({
      existing: [],
      syncResults: [a, b],
      syncedAt: SYNCED_AT,
    })
    expect(result.merged).toHaveLength(2)
    const byTitle = Object.fromEntries(result.merged.map(x => [x.title, x]))
    expect(byTitle['מקורס א'].course_id).toBe('course-a')
    expect(byTitle['מקורס א'].course_color).toBe('#8b5cf6')
    expect(byTitle['מקורס ב'].course_id).toBe('course-b')
    expect(byTitle['מקורס ב'].course_color).toBe('#0d9488')
  })

  it('treats sync_results with no new_announcements field as zero new (backward compat)', () => {
    // Older backends won't return new_announcements at all — the
    // pipeline must not crash.
    const legacyResult: SyncCourseResult = {
      course_id: 'course-1',
      moodle_id: '1234',
      course_name: 'מבני נתונים',
      course_color: '#0d9488',
      new_assignments: [],
      new_files: [],
      new_grades: [],
      // new_announcements intentionally omitted
      error: null,
    }
    const result = mergeAnnouncements({
      existing: [existingAnn()],
      syncResults: [legacyResult],
      syncedAt: SYNCED_AT,
    })
    expect(result.newCount).toBe(0)
    expect(result.merged).toHaveLength(1)
  })
})

// ──────────────────────────────────────────────────────────────────────
// acknowledgeAnnouncement / acknowledgeAllAnnouncements / countUnread
// ──────────────────────────────────────────────────────────────────────

describe('acknowledgeAnnouncement', () => {
  it('marks the target as read without touching others', () => {
    const a = existingAnn({ id: 'one' })
    const b = existingAnn({ id: 'two' })
    const result = acknowledgeAnnouncement([a, b], 'one', '2026-05-19T13:00:00.000Z')
    expect(result.find(x => x.id === 'one')?.acknowledged_at).toBe('2026-05-19T13:00:00.000Z')
    expect(result.find(x => x.id === 'two')?.acknowledged_at).toBe(null)
  })

  it('is a no-op when the id is missing', () => {
    const a = existingAnn({ id: 'one' })
    const result = acknowledgeAnnouncement([a], 'nonexistent', '2026-05-19T13:00:00.000Z')
    expect(result[0].acknowledged_at).toBe(null)
  })

  it('does NOT overwrite an existing acknowledged_at', () => {
    const a = existingAnn({ id: 'one', acknowledged_at: '2026-05-01T00:00:00.000Z' })
    const result = acknowledgeAnnouncement([a], 'one', '2026-05-19T13:00:00.000Z')
    expect(result[0].acknowledged_at).toBe('2026-05-01T00:00:00.000Z')
  })

  it('handles undefined input', () => {
    expect(acknowledgeAnnouncement(undefined, 'one')).toEqual([])
  })
})

describe('acknowledgeAllAnnouncements', () => {
  it('marks every previously-unread item with the same timestamp', () => {
    const items = [
      existingAnn({ id: 'a', acknowledged_at: null }),
      existingAnn({ id: 'b', acknowledged_at: null }),
      existingAnn({ id: 'c', acknowledged_at: '2026-05-01T00:00:00.000Z' }),
    ]
    const result = acknowledgeAllAnnouncements(items, '2026-05-19T13:00:00.000Z')
    expect(result[0].acknowledged_at).toBe('2026-05-19T13:00:00.000Z')
    expect(result[1].acknowledged_at).toBe('2026-05-19T13:00:00.000Z')
    // Pre-acked entry keeps its original timestamp
    expect(result[2].acknowledged_at).toBe('2026-05-01T00:00:00.000Z')
  })
})

describe('countUnread', () => {
  it('counts items where acknowledged_at is null', () => {
    expect(countUnread([
      existingAnn({ acknowledged_at: null }),
      existingAnn({ acknowledged_at: null }),
      existingAnn({ acknowledged_at: '2026-05-01T00:00:00.000Z' }),
    ])).toBe(2)
  })

  it('returns 0 for empty / undefined', () => {
    expect(countUnread([])).toBe(0)
    expect(countUnread(undefined)).toBe(0)
  })
})
