/**
 * Tree-builder for the /summaries page (המוח).
 *
 * Groups courses into the hierarchy:
 *   degree → year-of-study (1..4 + virtual 'no-year') → semester (א/ב/קיץ +
 *   virtual 'no-sem') → courses
 *
 * Plus a top-level 'לא מסווגים' bucket for courses missing BOTH year_of_study
 * and semester — anything that's at least partially classified gets placed
 * somewhere in the year/semester grid so the user can still find it.
 *
 * Extracted from app/(dashboard)/summaries/page.tsx so the logic can be
 * unit-tested without rendering React. The page imports buildTree + the
 * types from here.
 */

import type { Course } from '@/types'

export type HebSemester = 'א' | 'ב' | 'קיץ'

/** A leaf bucket — collection of courses inside a single semester (or the
 *  catch-all "no year_of_study" pool). The SemesterCoursesPanel + bulk
 *  classify UI render against this shape unchanged. */
export interface SemesterBucket {
  key: string
  label: string
  semester: HebSemester | null
  courses: Course[]
  isUnclassified: boolean
}

export interface YearGroup {
  /** 1-4 for real years, null for the "ללא שנה" group (courses that have
   *  a semester set but no year_of_study yet — usually because the user
   *  hasn't set their degree-start year in /settings). */
  yearOfStudy: 1 | 2 | 3 | 4 | null
  yearKey: string                 // 'y1' … 'y4', or 'no-year'
  label: string                   // "שנה א'", …, "ללא שנה"
  semesters: SemesterBucket[]
  courseCount: number
}

export interface DegreeTree {
  years: YearGroup[]
  /** Courses missing BOTH year_of_study AND semester. Rendered as a
   *  sibling of the year row in the tree. */
  unclassified: SemesterBucket | null
}

const YEAR_LABEL: Record<number, string> = {
  1: "שנה א'",
  2: "שנה ב'",
  3: "שנה ג'",
  4: "שנה ד'",
}

/** Build the tree: courses → years → semesters. Courses with neither
 *  year_of_study NOR semester end up in the top-level לא מסווגים bucket. */
export function buildTree(courses: Course[]): DegreeTree {
  // year key is either number 1-4 or the literal 'no-year' for courses
  // with semester but no year_of_study (very common pre-classifier).
  type YearKey = number | 'no-year'
  const yearMap = new Map<YearKey, Map<string, Course[]>>()
  const unclassifiedCourses: Course[] = []

  for (const c of courses) {
    const yos = c.year_of_study
    const sem = c.semester
    if (!yos && !sem) { unclassifiedCourses.push(c); continue }
    const yearKey: YearKey = yos ?? 'no-year'
    const semKey = sem ?? 'no-sem'
    if (!yearMap.has(yearKey)) yearMap.set(yearKey, new Map())
    const semMap = yearMap.get(yearKey)!
    if (!semMap.has(semKey)) semMap.set(semKey, [])
    semMap.get(semKey)!.push(c)
  }

  const semOrder: Array<HebSemester | 'no-sem'> = ['א', 'ב', 'קיץ', 'no-sem']
  // Sort: numeric years ascending, then 'no-year' at the end so the visible
  // sequence reads שנה א', ב', …, ללא שנה, לא מסווגים.
  const yearKeys = Array.from(yearMap.keys()).sort((a, b) => {
    if (a === 'no-year') return 1
    if (b === 'no-year') return -1
    return (a as number) - (b as number)
  })

  const years: YearGroup[] = yearKeys.map((yKey) => {
    const semMap = yearMap.get(yKey)!
    const semesters: SemesterBucket[] = []
    for (const s of semOrder) {
      const list = semMap.get(s)
      if (!list || list.length === 0) continue
      semesters.push({
        key: `${yKey === 'no-year' ? 'ny' : `y${yKey}`}-${s}`,
        label:
          s === 'no-sem' ? 'ללא סמסטר' :
          s === 'קיץ'    ? 'קיץ' :
                           `סמסטר ${s}׳`,
        semester: s === 'no-sem' ? null : s,
        courses: list,
        isUnclassified: false,
      })
    }
    return {
      yearOfStudy: yKey === 'no-year' ? null : (yKey as 1|2|3|4),
      yearKey: yKey === 'no-year' ? 'no-year' : `y${yKey}`,
      label: yKey === 'no-year' ? 'ללא שנה' : (YEAR_LABEL[yKey as number] ?? `שנה ${yKey}`),
      semesters,
      courseCount: semesters.reduce((n, s) => n + s.courses.length, 0),
    }
  })

  return {
    years,
    unclassified: unclassifiedCourses.length > 0
      ? {
          key: 'unclassified',
          label: 'לא מסווגים',
          semester: null,
          courses: unclassifiedCourses,
          isUnclassified: true,
        }
      : null,
  }
}
