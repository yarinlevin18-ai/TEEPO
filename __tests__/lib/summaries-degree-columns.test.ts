/**
 * Pin the dual-degree chip-key contract — without per-degree scoping
 * both degrees' "סמסטר א'" chips share a key and the page can't
 * distinguish them, breaking dual-degree selection entirely.
 */
import { describe, it, expect } from 'vitest'
import { buildDegreeColumns } from '@/lib/summaries-degree-columns'
import type { Course } from '@/types'

function course(partial: Partial<Course> & { id: string; degree_id?: string }): Course {
  return {
    id: partial.id,
    user_id: 'u1',
    title: partial.title ?? partial.id,
    source: 'bgu',
    progress_percentage: 0,
    status: 'active',
    created_at: '2026-01-01',
    semester: partial.semester,
    year_of_study: partial.year_of_study,
    academic_year: partial.academic_year,
    degree_id: partial.degree_id,
  } as Course
}

describe('buildDegreeColumns — dual-degree chip keys', () => {
  const degrees = [
    { id: 'deg-poli',  name: 'פוליטיקה' },
    { id: 'deg-iyzm', name: 'יזמות' },
  ]

  it('makes chip keys unique across degrees', () => {
    // Two courses, one per degree, both in "שנה א' סמסטר א' תשפ״ו" —
    // without scoping their chip keys would collide.
    const courses = [
      course({
        id: 'c1',
        degree_id: 'deg-poli',
        year_of_study: 1,
        semester: 'א',
        academic_year: '2025',
      }),
      course({
        id: 'c2',
        degree_id: 'deg-iyzm',
        year_of_study: 1,
        semester: 'א',
        academic_year: '2025',
      }),
    ]
    const { degrees: cols } = buildDegreeColumns(courses, degrees)
    expect(cols).toHaveLength(2)
    const polChip = cols[0].chips[0]
    const iyzChip = cols[1].chips[0]
    expect(polChip.key).not.toBe(iyzChip.key)
    expect(polChip.key.startsWith('deg-poli')).toBe(true)
    expect(iyzChip.key.startsWith('deg-iyzm')).toBe(true)
    // Each chip's bucket carries its own degree's course only.
    expect(polChip.bucket.courses.map(c => c.id)).toEqual(['c1'])
    expect(iyzChip.bucket.courses.map(c => c.id)).toEqual(['c2'])
  })

  it('routes unassigned courses to the first degree', () => {
    const courses = [
      course({ id: 'c1', semester: 'א', year_of_study: 1 }), // no degree_id
    ]
    const { degrees: cols } = buildDegreeColumns(courses, degrees)
    expect(cols[0].chips[0].bucket.courses.map(c => c.id)).toEqual(['c1'])
    expect(cols[1].chips).toEqual([])
  })

  it('ignores course.degree_id when it references a non-existent degree', () => {
    // If user deletes a degree but courses still reference its id, those
    // courses fall back to the first valid degree.
    const courses = [
      course({ id: 'c1', degree_id: 'deg-deleted', semester: 'א', year_of_study: 1 }),
    ]
    const { degrees: cols } = buildDegreeColumns(courses, degrees)
    expect(cols[0].chips[0].bucket.courses.map(c => c.id)).toEqual(['c1'])
  })

  it('returns empty result for no degrees (defensive)', () => {
    const { degrees: cols, total } = buildDegreeColumns([], [])
    expect(cols).toEqual([])
    expect(total).toBe(0)
  })

  it('preserves the underlying bucket.key (used by year-row grouping)', () => {
    const courses = [
      course({ id: 'c1', degree_id: 'deg-poli', year_of_study: 1, semester: 'א' }),
    ]
    const { degrees: cols } = buildDegreeColumns(courses, degrees)
    // The chip.key gets degree-scoped, but the inner SemesterBucket.key
    // stays raw because the year-bucket recovery uses its prefix.
    expect(cols[0].chips[0].bucket.key).toBe('y1-א')
  })
})
