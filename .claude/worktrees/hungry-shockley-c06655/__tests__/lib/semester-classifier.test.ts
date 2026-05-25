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

  it('parses English S1/S2/S3 semester markers from titles', () => {
    // BGU English-track courses use "S1"/"S2"/"S3" instead of "סמ 1".
    expect(classifyCourse({ title: 'English Advanced B G12 S1' }).semester).toBe('א')
    expect(classifyCourse({ title: 'English Advanced B G12 S2' }).semester).toBe('ב')
    expect(classifyCourse({ title: 'Summer Workshop S3' }).semester).toBe('קיץ')
  })

  it('does NOT misread S-prefixed words as semester markers', () => {
    // "Systems" / "Statistics" must not match the S<digit> pattern.
    expect(classifyCourse({ title: 'Systems Analysis' }).semester).toBeUndefined()
    expect(classifyCourse({ title: 'Statistics for Managers' }).semester).toBeUndefined()
  })

  it('extracts academic year from Gregorian "YYYY-N" / "YYYY/YY" patterns', () => {
    // BGU titles sometimes include the year as "2025-6" or "2025/26".
    expect(classifyCourse({ title: 'יזמות חברה וסביבה 2025-6' }).academic_year).toBe('2025')
    expect(classifyCourse({ title: 'Strategic Management 2024/25' }).academic_year).toBe('2024')
    expect(classifyCourse({ title: 'AY 2026/2027 Seminar' }).academic_year).toBe('2026')
  })

  it('does NOT match implausible years (out of 2000-2099)', () => {
    // 1985-86 looks like the pattern but is pre-2000 → reject.
    expect(classifyCourse({ title: 'Legacy 1985-86 archive' }).academic_year).toBeUndefined()
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
