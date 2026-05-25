/**
 * matchCourseForEvent powers the dashboard "היום בלוח" row → /summaries
 * deep link. If the matcher misfires the user lands on the wrong course
 * (or sees a non-clickable row), so these tests pin the normalization +
 * scoring rules.
 */

import { describe, it, expect } from 'vitest'
import { matchCourseForEvent, normalizeTitle } from '@/lib/event-course-match'
import type { Course } from '@/types'

function course(id: string, title: string): Course {
  return {
    id,
    title,
    source: 'bgu',
    progress_percentage: 0,
  } as Course
}

describe('normalizeTitle', () => {
  it('strips Hebrew geresh + gershayim variants', () => {
    expect(normalizeTitle("מבוא למדמ״ח")).toBe(normalizeTitle('מבוא למדמח'))
    expect(normalizeTitle('מבוא ל-מדמ״ח')).toBe(normalizeTitle('מבוא ל מדמח'))
  })

  it('lower-cases Latin chars but leaves Hebrew intact', () => {
    expect(normalizeTitle('Intro to CS')).toBe('intro to cs')
    expect(normalizeTitle('English Advanced B G12 S2'))
      .toBe('english advanced b g12 s2')
  })

  it('replaces dashes / em-dashes / colons with a single space', () => {
    expect(normalizeTitle('מבוא — פיזיקה')).toBe('מבוא פיזיקה')
    expect(normalizeTitle('הרצאה: מבוא')).toBe('הרצאה מבוא')
  })
})

describe('matchCourseForEvent', () => {
  const courses = [
    course('a', 'מבוא למדמ״ח'),
    course('b', 'מבוא לפיזיקה'),
    course('c', 'מבוא לפיזיקה 2'),
    course('d', 'English Advanced B G12 S2'),
    course('e', 'Linear Algebra'),
  ]

  it('matches an exact-substring calendar title to its course', () => {
    expect(matchCourseForEvent('הרצאה: מבוא למדמ״ח', courses)?.id).toBe('a')
  })

  it('matches when calendar title has a suffix like "תרגול"', () => {
    expect(matchCourseForEvent('מבוא לפיזיקה - תרגול 5', courses)?.id).toBe('b')
  })

  it('picks the more specific course when several share a prefix', () => {
    // "מבוא לפיזיקה 2 - שיעור" should beat the shorter "מבוא לפיזיקה".
    expect(matchCourseForEvent('מבוא לפיזיקה 2 - שיעור', courses)?.id).toBe('c')
  })

  it('matches English titles case-insensitively', () => {
    expect(matchCourseForEvent('LINEAR ALGEBRA Class', courses)?.id).toBe('e')
  })

  it('matches when the course name contains the event name (reverse direction)', () => {
    // Calendar slot just says "English Advanced" — should still find the longer course.
    expect(matchCourseForEvent('English Advanced', courses)?.id).toBe('d')
  })

  it('returns null when no course matches', () => {
    expect(matchCourseForEvent('שחייה', courses)).toBeNull()
    expect(matchCourseForEvent('Yoga class', courses)).toBeNull()
  })

  it('returns null for empty input', () => {
    expect(matchCourseForEvent('', courses)).toBeNull()
    expect(matchCourseForEvent('any title', [])).toBeNull()
  })

  it('ignores tiny overlaps (<4 chars)', () => {
    // Event title "הוא" overlaps with "מבוא" only on the "וא" suffix — no match.
    expect(matchCourseForEvent('הוא', courses)).toBeNull()
  })
})
