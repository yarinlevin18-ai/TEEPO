/**
 * Tree-builder powers the /summaries page (המוח). The whole grouping
 * hierarchy lives here — easy to misorder semesters or drop a course
 * into the wrong bucket in a refactor. Tests pin the contract.
 */

import { describe, it, expect } from 'vitest'
import { buildTree } from '@/lib/summaries-tree'
import type { Course } from '@/types'

/** Minimal valid Course factory. Only fields buildTree cares about are
 *  populated; everything else gets a stub so the typed Course matches. */
function course(
  partial: Partial<Course> & { id: string },
): Course {
  return {
    title: partial.title ?? partial.id,
    source: 'bgu',
    status: 'active',
    progress_percentage: 0,
    created_at: '2026-05-01T00:00:00.000Z',
    ...partial,
  } as Course
}

describe('buildTree', () => {
  it('returns empty shape for empty input', () => {
    const tree = buildTree([])
    expect(tree.years).toEqual([])
    expect(tree.unclassified).toBeNull()
  })

  it('groups courses by year_of_study then semester, sorted in display order', () => {
    const tree = buildTree([
      course({ id: 'a', year_of_study: 2, semester: 'ב' }),
      course({ id: 'b', year_of_study: 1, semester: 'א' }),
      course({ id: 'c', year_of_study: 1, semester: 'ב' }),
      course({ id: 'd', year_of_study: 1, semester: 'א' }),
    ])

    // Years sort ascending
    expect(tree.years.map(y => y.yearOfStudy)).toEqual([1, 2])

    // Year 1 has two semesters in canonical order (א, ב)
    const y1 = tree.years[0]
    expect(y1.semesters.map(s => s.semester)).toEqual(['א', 'ב'])
    expect(y1.semesters[0].courses).toHaveLength(2)
    expect(y1.semesters[1].courses).toHaveLength(1)
    expect(y1.courseCount).toBe(3)

    // Year 2 has only semester ב
    expect(tree.years[1].semesters.map(s => s.semester)).toEqual(['ב'])
  })

  it('honors canonical semester order א → ב → קיץ → no-sem within a year', () => {
    const tree = buildTree([
      course({ id: 'summer', year_of_study: 2, semester: 'קיץ' }),
      course({ id: 'no-sem', year_of_study: 2 }),       // no semester
      course({ id: 'bet',    year_of_study: 2, semester: 'ב' }),
      course({ id: 'alef',   year_of_study: 2, semester: 'א' }),
    ])

    const y2 = tree.years[0]
    expect(y2.semesters.map(s => s.label)).toEqual([
      'סמסטר א׳',
      'סמסטר ב׳',
      'קיץ',
      'ללא סמסטר',
    ])
  })

  it("puts courses with semester but no year_of_study under 'ללא שנה', sorted last", () => {
    const tree = buildTree([
      course({ id: 'no-year-sem-a', semester: 'א' }),
      course({ id: 'year-2', year_of_study: 2, semester: 'א' }),
      course({ id: 'no-year-sem-b', semester: 'ב' }),
    ])

    // Numeric year first, then 'no-year' bucket
    expect(tree.years.map(y => y.yearKey)).toEqual(['y2', 'no-year'])
    const noYear = tree.years[1]
    expect(noYear.label).toBe('ללא שנה')
    expect(noYear.yearOfStudy).toBeNull()
    // Inside the no-year group, semester sub-grouping still applies
    expect(noYear.semesters.map(s => s.semester)).toEqual(['א', 'ב'])
  })

  it("routes courses with neither year_of_study nor semester to the top-level 'לא מסווגים' bucket", () => {
    const tree = buildTree([
      course({ id: 'orphan-1' }),
      course({ id: 'orphan-2' }),
      course({ id: 'classified', year_of_study: 1, semester: 'א' }),
    ])
    expect(tree.unclassified).not.toBeNull()
    expect(tree.unclassified!.label).toBe('לא מסווגים')
    expect(tree.unclassified!.courses).toHaveLength(2)
    expect(tree.unclassified!.isUnclassified).toBe(true)
    // The classified one is NOT in the unclassified bucket
    expect(tree.unclassified!.courses.find(c => c.id === 'classified')).toBeUndefined()
  })

  it("returns unclassified: null when there are no truly-unclassified courses", () => {
    // All have at least one classification dimension.
    const tree = buildTree([
      course({ id: 'sem-only', semester: 'א' }),
      course({ id: 'full', year_of_study: 1, semester: 'ב' }),
    ])
    expect(tree.unclassified).toBeNull()
  })

  it('semester-bucket keys are stable and unique', () => {
    const tree = buildTree([
      course({ id: 'a', year_of_study: 1, semester: 'א' }),
      course({ id: 'b', year_of_study: 1, semester: 'ב' }),
      course({ id: 'c', year_of_study: 2, semester: 'א' }),
      course({ id: 'd', semester: 'א' }),
    ])
    const allKeys = tree.years.flatMap(y => y.semesters.map(s => s.key))
    const unique = new Set(allKeys)
    expect(unique.size).toBe(allKeys.length)
    // The numbered year buckets use 'y<N>-<sem>' format; no-year uses 'ny-<sem>'
    expect(allKeys).toContain('y1-א')
    expect(allKeys).toContain('y1-ב')
    expect(allKeys).toContain('y2-א')
    expect(allKeys).toContain('ny-א')
  })

  it('preserves original course order within a semester bucket (no implicit sort)', () => {
    // The page renders courses as-fed; if we ever decide to sort by title
    // it should be an explicit choice, not a buildTree implementation
    // detail. Pin the no-implicit-sort contract here.
    const tree = buildTree([
      course({ id: 'z-title', title: 'ז', year_of_study: 1, semester: 'א' }),
      course({ id: 'a-title', title: 'א', year_of_study: 1, semester: 'א' }),
    ])
    const sem = tree.years[0].semesters[0]
    expect(sem.courses.map(c => c.id)).toEqual(['z-title', 'a-title'])
  })

  it('courseCount on YearGroup equals sum of semester course counts', () => {
    const tree = buildTree([
      course({ id: 'a', year_of_study: 3, semester: 'א' }),
      course({ id: 'b', year_of_study: 3, semester: 'א' }),
      course({ id: 'c', year_of_study: 3, semester: 'ב' }),
      course({ id: 'd', year_of_study: 3, semester: 'קיץ' }),
      course({ id: 'e', year_of_study: 3 }),  // no semester → 'ללא סמסטר'
    ])
    const y3 = tree.years[0]
    expect(y3.courseCount).toBe(5)
  })
})
