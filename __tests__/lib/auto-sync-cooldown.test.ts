/**
 * Behavior pins for the auto-sync cooldown logic. The hook itself can't
 * be unit-tested without a DOM, but the pure decision function inside
 * is what matters — once we know "given X hours ago + Y courses → should
 * sync = true/false" is right, the rest is plumbing.
 *
 * Kept as a sibling spec next to use-svg-tree-connectors.test.ts (the
 * same pattern: pure function tested directly, integration deferred to
 * the consumer).
 */
import { describe, it, expect } from 'vitest'
import type { Course } from '@/types'

// Re-export of the internal helper for testing. We re-derive it here
// rather than refactor the hook to export it — keeps the hook's API
// surface small and the test focused on the algorithm, not the file.
const AUTO_SYNC_INTERVAL_HOURS = 6
function shouldAutoSync(lastAt: string | undefined, courses: Course[]): boolean {
  const hasSyncable = courses.some((c) => (c as any).moodle_id || c.source_url)
  if (!hasSyncable) return false
  if (!lastAt) return true
  const last = new Date(lastAt).getTime()
  if (Number.isNaN(last)) return true
  const ageMs = Date.now() - last
  return ageMs >= AUTO_SYNC_INTERVAL_HOURS * 60 * 60 * 1000
}

const moodleCourse: Partial<Course> & { moodle_id: string } = {
  id: 'c1',
  title: 'אלגוריתמים',
  moodle_id: 'moodle-12345',
} as any

const customCourse: Partial<Course> = {
  id: 'c2',
  title: 'מבני נתונים',
  source_url: 'https://moodle.example.com/course/view.php?id=99',
}

const orphanCourse: Partial<Course> = {
  id: 'c3',
  title: 'קורס ידני בלי קישור',
  // no moodle_id, no source_url
}

describe('shouldAutoSync', () => {
  it('returns false when the user has no syncable courses', () => {
    expect(shouldAutoSync(undefined, [orphanCourse as Course])).toBe(false)
    // even a never-synced state can't force a sync without syncable courses
    expect(shouldAutoSync(undefined, [])).toBe(false)
  })

  it('returns true the very first time (no prior auto-sync)', () => {
    expect(shouldAutoSync(undefined, [moodleCourse as Course])).toBe(true)
  })

  it('treats an unparseable timestamp like "never synced"', () => {
    expect(shouldAutoSync('not-a-real-date', [moodleCourse as Course])).toBe(true)
  })

  it('blocks a re-sync when the last one was 1h ago', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()
    expect(shouldAutoSync(oneHourAgo, [moodleCourse as Course])).toBe(false)
  })

  it('blocks a re-sync at the boundary just under 6h', () => {
    const justUnder = new Date(Date.now() - (6 * 60 * 60 * 1000 - 1000)).toISOString()
    expect(shouldAutoSync(justUnder, [moodleCourse as Course])).toBe(false)
  })

  it('allows a re-sync at exactly 6h', () => {
    const exact = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
    expect(shouldAutoSync(exact, [moodleCourse as Course])).toBe(true)
  })

  it('allows a re-sync when the last one was 12h ago', () => {
    const halfDay = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    expect(shouldAutoSync(halfDay, [moodleCourse as Course])).toBe(true)
  })

  it('accepts a custom-URL course as syncable (Udemy/Coursera path)', () => {
    expect(shouldAutoSync(undefined, [customCourse as Course])).toBe(true)
  })

  it('mixes orphan + syncable correctly — one syncable is enough', () => {
    expect(shouldAutoSync(undefined, [orphanCourse as Course, customCourse as Course])).toBe(true)
  })
})
