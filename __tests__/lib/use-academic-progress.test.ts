import { describe, it, expect } from 'vitest'
import {
  semesterRank,
  semesterSortKey,
  pickCurrentSemester,
  resolveCurrentSemesterKey,
} from '@/lib/use-academic-progress'
import type { StudentCourse } from '@/types'

function course(over: Partial<StudentCourse>): StudentCourse {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    course_id: 'c1',
    course_name: 'קורס',
    credits: 3,
    status: 'completed',
    source: 'manual',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }
}

describe('semesterRank', () => {
  it('maps Hebrew and Latin variants to the same rank', () => {
    expect(semesterRank('א')).toBe('1')
    expect(semesterRank("סמסטר א'")).toBe('1')
    expect(semesterRank('a')).toBe('1')
    expect(semesterRank('ב')).toBe('2')
    expect(semesterRank('b')).toBe('2')
    expect(semesterRank('קיץ')).toBe('3')
    expect(semesterRank('Summer')).toBe('3')
    expect(semesterRank('???')).toBe('4')
  })
})

describe('semesterSortKey', () => {
  it('sorts later semesters lexicographically after earlier ones', () => {
    const a = semesterSortKey({ academic_year: '2024', semester: 'א' })
    const b = semesterSortKey({ academic_year: '2024', semester: 'ב' })
    const next = semesterSortKey({ academic_year: '2025', semester: 'א' })
    expect(a < b).toBe(true)
    expect(b < next).toBe(true)
  })
})

describe('resolveCurrentSemesterKey', () => {
  const courses = [
    course({ academic_year: '2024', semester: 'א', status: 'completed' }),
    course({ academic_year: '2024', semester: 'ב', status: 'completed' }),
    course({ academic_year: '2025', semester: 'a', status: 'in_progress' }),
  ]

  it('derives from in-progress courses when no explicit semester is set', () => {
    expect(resolveCurrentSemesterKey(courses, null)).toBe(
      semesterSortKey({ academic_year: '2025', semester: 'א' }),
    )
    expect(resolveCurrentSemesterKey(courses, undefined)).toBe(
      pickCurrentSemester(courses),
    )
  })

  it('explicit semester wins and matches scraped Latin values by rank', () => {
    // Explicit 'א' must match the scraped 'a' row in 2025 (latest year wins)
    expect(resolveCurrentSemesterKey(courses, 'א')).toBe(
      semesterSortKey({ academic_year: '2025', semester: 'א' }),
    )
    // Explicit 'ב' anchors to the 2024 ב row even though in-progress is א
    expect(resolveCurrentSemesterKey(courses, 'ב')).toBe(
      semesterSortKey({ academic_year: '2024', semester: 'ב' }),
    )
  })

  it('falls back to derivation when no course rows match the explicit semester', () => {
    expect(resolveCurrentSemesterKey(courses, 'קיץ')).toBe(
      pickCurrentSemester(courses),
    )
  })

  it('returns null when there is nothing to anchor on', () => {
    expect(resolveCurrentSemesterKey([], 'א')).toBeNull()
    expect(resolveCurrentSemesterKey([], null)).toBeNull()
  })
})
