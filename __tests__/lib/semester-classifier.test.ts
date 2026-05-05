/**
 * Semester classification — the foundation of the calendar / credits views.
 * BGU course titles get parsed for academic year + semester; getting it
 * wrong means every course shows up under the wrong semester bucket.
 */

import { describe, it, expect } from 'vitest'
import { classifyCourse, computeYearOfStudy } from '@/lib/semester-classifier'

describe('classifyCourse', () => {
  it('parses Hebrew "סמסטר א" / "סמסטר ב" / "קיץ" out of titles', () => {
    expect(classifyCourse({ title: 'מבוא למדעי המחשב — סמסטר א' }).semester).toBe('א')
    expect(classifyCourse({ title: 'אלגוריתמים סמסטר ב 2024' }).semester).toBe('ב')
    expect(classifyCourse({ title: 'סדנת קיץ — חישוביות' }).semester).toBe('קיץ')
  })

  it('falls back to Moodle dates when title is silent', () => {
    // Late-October start = sem-A in Israeli academic calendar
    const lateOctober = Math.floor(new Date('2024-10-27').getTime() / 1000)
    const result = classifyCourse({
      title: 'Anonymous Course',
      moodle_startdate: lateOctober,
    })
    expect(result.semester).toBe('א')
  })

  it('extracts academic year from BGU shortname suffix', () => {
    // BGU shortnames look like "201-1-3301-25" — last two digits → 2025
    const result = classifyCourse({
      title: 'whatever',
      shortname: '201-1-3301-25',
    })
    expect(result.academic_year).toBe('2025')
  })
})

describe('computeYearOfStudy', () => {
  it('returns 1 when course is in the same academic year as degree start', () => {
    expect(computeYearOfStudy({ year: 2023, month: 10 }, 2023)).toBe(1)
  })

  it('returns 2 the year after degree start', () => {
    expect(computeYearOfStudy({ year: 2023, month: 10 }, 2024)).toBe(2)
  })

  it('returns undefined when course year falls outside the 1..4 degree window', () => {
    // 10 years after degree start = year 11 → out of range
    expect(computeYearOfStudy({ year: 2020, month: 10 }, 2030)).toBeUndefined()
    // Course year before degree start = year 0 → out of range
    expect(computeYearOfStudy({ year: 2024, month: 10 }, 2023)).toBeUndefined()
  })
})
