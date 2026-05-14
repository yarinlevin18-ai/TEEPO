/**
 * Tests for pathForCourse + sanitizeFolderName — the pure path-building
 * functions that decide where a course's folder lives in Drive.
 *
 * Bugs here cascade everywhere: into reclassifyCourse's "samePath" check
 * (PR #99), into the /summaries 'צור תיקיות' CTA's stale-path filter,
 * and into the import endpoint's folder-existence reprovisioning.
 *
 * The function is small but the matrix of (year?, semester?) states has
 * sharp edges — explicitly pin each.
 */

import { describe, it, expect } from 'vitest'
import { pathForCourse, sanitizeFolderName } from '@/lib/drive-folders'
import type { Course } from '@/types'

/** Minimal valid Course factory — only fields pathForCourse cares about. */
function course(partial: Partial<Course> & { title: string }): Course {
  return {
    id: 'c1',
    source: 'bgu',
    status: 'active',
    progress_percentage: 0,
    created_at: '2026-05-01T00:00:00.000Z',
    ...partial,
  } as Course
}

describe('sanitizeFolderName', () => {
  it('preserves Hebrew + spaces + most ASCII', () => {
    expect(sanitizeFolderName('מבוא למדעי המחשב')).toBe('מבוא למדעי המחשב')
  })

  it('replaces forward and backward slashes with dashes', () => {
    expect(sanitizeFolderName('Algebra 1/Linear')).toBe('Algebra 1-Linear')
    expect(sanitizeFolderName('Sub\\folder\\bad')).toBe('Sub-folder-bad')
  })

  it('trims surrounding whitespace', () => {
    expect(sanitizeFolderName('  spaced  ')).toBe('spaced')
  })

  it('caps the length at 200 chars so Drive does not reject', () => {
    const long = 'א'.repeat(300)
    const out = sanitizeFolderName(long)
    expect(out.length).toBe(200)
  })

  it('falls back to a placeholder when the result is empty', () => {
    expect(sanitizeFolderName('')).toBe('קורס ללא שם')
    expect(sanitizeFolderName('   ')).toBe('קורס ללא שם')
  })

  it('preserves Hebrew gershayim and apostrophes', () => {
    // These characters appear in real BGU titles (שיווק אסטרטגי תשפ״ה).
    expect(sanitizeFolderName('שיווק תשפ"ה')).toBe('שיווק תשפ"ה')
    expect(sanitizeFolderName('סמסטר א\'')).toBe('סמסטר א\'')
  })
})

describe('pathForCourse', () => {
  it('routes a fully unclassified course to לא מסווגים/<title>', () => {
    const p = pathForCourse(course({ title: 'מבוא' }))
    expect(p).toEqual(['לא מסווגים', 'מבוא'])
  })

  it('routes a fully-classified course to תואר ראשון/שנה X/סמסטר Y/<title>', () => {
    const p = pathForCourse(course({
      title: 'מבוא למדמ"ח',
      year_of_study: 2,
      semester: 'א',
    }))
    expect(p).toEqual(['תואר ראשון', 'שנה ב׳', 'סמסטר א׳', 'מבוא למדמ"ח'])
  })

  it('uses קיץ (no סמסטר prefix) for the summer semester', () => {
    const p = pathForCourse(course({
      title: 'סדנת קיץ',
      year_of_study: 1,
      semester: 'קיץ',
    }))
    expect(p).toEqual(['תואר ראשון', 'שנה א׳', 'קיץ', 'סדנת קיץ'])
  })

  it('uses "ללא שנה" when semester is set but year_of_study is missing', () => {
    const p = pathForCourse(course({
      title: 'אלגוריתמים',
      semester: 'ב',
    }))
    expect(p).toEqual(['תואר ראשון', 'ללא שנה', 'סמסטר ב׳', 'אלגוריתמים'])
  })

  it('uses "ללא סמסטר" when year_of_study is set but semester is missing', () => {
    const p = pathForCourse(course({
      title: 'פרויקט גמר',
      year_of_study: 4,
    }))
    expect(p).toEqual(['תואר ראשון', 'שנה ד׳', 'ללא סמסטר', 'פרויקט גמר'])
  })

  it('routes a course with neither year nor semester to לא מסווגים (NOT to תואר ראשון/ללא שנה/ללא סמסטר)', () => {
    // Subtle correctness check: PR #97/#99 logic assumes truly-unclassified
    // courses bypass the תואר ראשון tree entirely. Locks that in.
    const p = pathForCourse(course({ title: 'Whatever' }))
    expect(p[0]).toBe('לא מסווגים')
    expect(p).not.toContain('תואר ראשון')
  })

  it('sanitizes the title segment (slashes → dashes)', () => {
    const p = pathForCourse(course({
      title: 'A/B Testing 101',
      year_of_study: 1,
      semester: 'א',
    }))
    expect(p[3]).toBe('A-B Testing 101')
  })

  it('handles unknown year_of_study values by falling back to "ללא שנה"', () => {
    // year_of_study is typed 1|2|3|4, but real BGU data sometimes has 5+
    // for masters-track or extended programs. Don't crash; fall back.
    const p = pathForCourse(course({
      title: 'Advanced',
      year_of_study: 7 as any,
      semester: 'א',
    }))
    expect(p[1]).toBe('ללא שנה')
  })

  it('returns a result that round-trips through .join("/") cleanly', () => {
    // Multiple places in db-context compare paths via .join('/'). Ensure no
    // segment contains a '/' that would corrupt the comparison.
    const cases: Course[] = [
      course({ title: 'מבוא', year_of_study: 1, semester: 'א' }),
      course({ title: 'אלגוריתמים', semester: 'ב' }),
      course({ title: 'A/B Testing', year_of_study: 2, semester: 'ב' }),
      course({ title: 'Whatever' }),
    ]
    for (const c of cases) {
      const path = pathForCourse(c)
      for (const seg of path) {
        expect(seg).not.toContain('/')
      }
    }
  })

  it("reclassifying a course from לא מסווגים to a real year always changes the .join('/') result", () => {
    // PR #99: reclassifyCourse uses .join('/') equality to decide whether to
    // move the Drive folder. Make sure picking a year/semester from nothing
    // always reports a different path.
    const before = pathForCourse(course({ title: 'מבוא' }))
    const after = pathForCourse(course({
      title: 'מבוא',
      year_of_study: 1,
      semester: 'א',
    }))
    expect(before.join('/')).not.toBe(after.join('/'))
  })
})
