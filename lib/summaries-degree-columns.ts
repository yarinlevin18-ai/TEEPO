/**
 * Flatten the YearGroup/SemesterBucket tree (lib/summaries-tree) into the
 * mockup's "degree column" layout: one column per degree, each column is a
 * grid of semester chips ordered chronologically across the full degree
 * timeline.
 *
 * This sits alongside buildTree (it doesn't replace it) because the
 * `/summaries` redesign drops the explicit year level in favor of a flat
 * semester grid — but bulk classify and the inline classify widget still
 * benefit from the year-aware data shape that buildTree produces. So we
 * keep both and pick the right view per consumer.
 */

import type { Course } from '@/types'
import { buildTree, type HebSemester, type SemesterBucket } from './summaries-tree'

/** One slot in the degree column's semester grid. */
export interface SemesterChip {
  /** Stable key for React + the activeKey state. Matches the underlying
   *  SemesterBucket.key from buildTree, OR 'unclassified' / 'no-year-<sem>'
   *  for the synthetic buckets. */
  key: string
  label: string
  /** Used to derive the chronological sort order + the chip color. */
  academicYear: number | null
  semester: HebSemester | null
  /** Underlying bucket — passed straight to SemesterCoursesPanel + bulk
   *  classify so they get an unchanged data shape. */
  bucket: SemesterBucket
  /** Index into SEMESTER_PALETTE — rotates as the chips advance through
   *  the timeline so each adjacent chip is a distinct color. */
  colorIdx: number
  /** True when (academicYear, semester) matches the current calendar.
   *  The chip gets a "(נוכחי)" marker so the user can immediately spot
   *  where their active semester sits in the timeline. */
  isCurrent: boolean
  /** True for the catch-all 'לא מסווגים' bucket (no year + no semester). */
  isUnclassified: boolean
  /** True for semesters with a year but no academic_year — these come
   *  from the buildTree's 'no-year' synthetic year. */
  isMissingYear: boolean
}

export interface DegreeColumn {
  id: string
  /** Display name (e.g. 'תואר ראשון - מנע"ס'); falls back to a default. */
  name: string
  chips: SemesterChip[]
  /** Total course count across all chips. */
  totalCourses: number
}

/** Mockup's palette for the rotating chip colors. Indexed by colorIdx. */
const SEMESTER_PALETTE = [
  '#8b5cf6', // violet
  '#d97706', // amber
  '#0d9488', // teal
  '#16a34a', // green (matches --lp-accent)
  '#a21caf', // plum
  '#e11d48', // rose
] as const

/** Hebrew year labels for common Gregorian years. Covers 2019..2030 —
 *  enough for any current student's career window. */
const HEBREW_YEAR: Record<number, string> = {
  2019: 'תש״פ',
  2020: 'תשפ״א',
  2021: 'תשפ״ב',
  2022: 'תשפ״ג',
  2023: 'תשפ״ד',
  2024: 'תשפ״ה',
  2025: 'תשפ״ו',
  2026: 'תשפ״ז',
  2027: 'תשפ״ח',
  2028: 'תשפ״ט',
  2029: 'תש״צ',
  2030: 'תשצ״א',
}

/** Semester sort order (within a year): א → ב → קיץ → null. */
const SEM_ORD: Record<string, number> = { 'א': 1, 'ב': 2, 'קיץ': 3 }
function semOrd(s: HebSemester | null): number {
  return s ? SEM_ORD[s] : 9
}

/** Today's (academic_year, semester) for the "(נוכחי)" marker.
 *  Israeli academic year rolls in October. */
function currentAcademicSlot(now = new Date()): { year: number; semester: HebSemester } {
  const m = now.getUTCMonth() + 1
  const y = now.getUTCFullYear()
  if (m >= 10) return { year: y, semester: 'א' }     // Oct–Dec → אבtw of THIS year
  if (m <= 2)  return { year: y - 1, semester: 'א' } // Jan–Feb → still semester א of LAST academic year
  if (m <= 6)  return { year: y - 1, semester: 'ב' } // Mar–Jun
  return { year: y - 1, semester: 'קיץ' }            // Jul–Sep
}

/** Convert a SemesterBucket from buildTree into the mockup-style label.
 *  Examples: "סמסטר א' תשפ״ה" / "ב' תשפ״ו" / "קיץ" / "ללא סמסטר". */
function chipLabel(opts: {
  semester: HebSemester | null
  academicYear: number | null
  isUnclassified: boolean
}): string {
  if (opts.isUnclassified) return 'לא מסווגים'
  const semLabel =
    opts.semester === 'קיץ' ? 'קיץ' :
    opts.semester === 'א'   ? "סמסטר א'" :
    opts.semester === 'ב'   ? "סמסטר ב'" :
                              'ללא סמסטר'
  if (!opts.academicYear) return semLabel
  const heb = HEBREW_YEAR[opts.academicYear]
  return heb ? `${semLabel} ${heb}` : `${semLabel} ${opts.academicYear}`
}

/**
 * Build the degree-column view for the /summaries mockup layout.
 *
 * @param courses     all the user's courses (from db.courses)
 * @param degreeName  human-readable degree label (from settings.degree_name,
 *                    falling back to universityName). The mockup design
 *                    branches on multi-degree but we only have one for now;
 *                    multi-degree extension is a follow-up.
 */
export function buildDegreeColumns(
  courses: Course[],
  degreeName: string,
  now: Date = new Date(),
): { degrees: DegreeColumn[]; total: number } {
  const tree = buildTree(courses)
  const current = currentAcademicSlot(now)

  // Flatten every (year, semester) bucket from the tree into chips. Each
  // course ends up in exactly one chip — buildTree already handled the
  // partition logic + the 'unclassified' / 'no-year' / 'no-sem' synthetics.
  const chips: SemesterChip[] = []
  for (const yg of tree.years) {
    const yos = yg.yearOfStudy // 1..4 or null for the 'no-year' synthetic
    for (const bucket of yg.semesters) {
      // Derive academic_year from any course in the bucket (they share it).
      const acadStr = bucket.courses.find(c => c.academic_year)?.academic_year
      const acadNum = acadStr ? parseInt(acadStr, 10) : null
      const isMissingYear = yos === null && acadNum === null

      chips.push({
        key: bucket.key,
        label: chipLabel({
          semester: bucket.semester,
          academicYear: acadNum,
          isUnclassified: false,
        }),
        academicYear: acadNum,
        semester: bucket.semester,
        bucket,
        // colorIdx filled in after sorting
        colorIdx: 0,
        isCurrent:
          !!bucket.semester &&
          acadNum === current.year &&
          bucket.semester === current.semester,
        isUnclassified: false,
        isMissingYear,
      })
    }
  }

  // Sort chronologically: real academic_year ascending, then semester order.
  // Chips with no academic_year sink below the real ones but stay grouped.
  chips.sort((a, b) => {
    const ay = a.academicYear ?? Infinity
    const by = b.academicYear ?? Infinity
    if (ay !== by) return ay - by
    return semOrd(a.semester) - semOrd(b.semester)
  })

  // Assign rotating colors so adjacent chips are visually distinct.
  chips.forEach((c, i) => {
    c.colorIdx = i % SEMESTER_PALETTE.length
  })

  // 'לא מסווגים' (truly unclassified — no year + no semester) sits at the
  // end of the grid. Get its own chip slot with a neutral color (last in
  // palette) so it doesn't visually compete with real semesters.
  if (tree.unclassified) {
    chips.push({
      key: tree.unclassified.key,
      label: 'לא מסווגים',
      academicYear: null,
      semester: null,
      bucket: tree.unclassified,
      colorIdx: SEMESTER_PALETTE.length - 1,
      isCurrent: false,
      isUnclassified: true,
      isMissingYear: false,
    })
  }

  const totalCourses = chips.reduce((n, c) => n + c.bucket.courses.length, 0)
  return {
    degrees: [{
      id: 'main',
      name: degreeName,
      chips,
      totalCourses,
    }],
    total: totalCourses,
  }
}

/** Public access to the palette for the page to apply chip styling. */
export function semesterChipColor(colorIdx: number): string {
  return SEMESTER_PALETTE[colorIdx % SEMESTER_PALETTE.length]
}
