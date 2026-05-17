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

import type { Course, Degree } from '@/types'
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

export interface YearGroupColumn {
  /** 'y1'..'y4' for real years, 'no-year' for the synthetic, or
   *  'unclassified' for the catch-all bucket. */
  yearKey: string
  /** "שנה א'", "ללא שנה", "לא מסווגים" — what the year-level node shows. */
  yearLabel: string
  /** Semester chips that belong to this year. Already chronologically
   *  ordered (semester order: א → ב → קיץ → null) with palette colors
   *  derived from the parent flat ordering. */
  chips: SemesterChip[]
}

export interface DegreeColumn {
  id: string
  /** Display name (e.g. 'תואר ראשון - מנע"ס'); falls back to a default.
   *  When empty/falsy the /summaries page hides the degree-level node so
   *  the tree reads TEEPO → year → semester without a redundant
   *  "אוניברסיטת X" pill the user already sees in the topnav. */
  name: string
  /** Chips grouped by year-of-study (the layout the user sees in v3).
   *  Ordered: y1, y2, y3, y4, no-year, unclassified at the very end. */
  yearGroups: YearGroupColumn[]
  /** Flat list of all chips in chronological order. Kept so the page's
   *  activeChipKey lookup + the auto-select-current-chip effect still
   *  work without needing to flatten yearGroups on every render. */
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
 * Build the multi-degree column view for /summaries.
 *
 * Splits the user's courses by `course.degree_id` (with unassigned ones
 * folded into the first degree as a sensible default) and runs the same
 * chip-building pipeline per degree. The mockup shows two columns side
 * by side for dual-degree users (דו-חוגי); single-degree users get one
 * centered column.
 *
 * @param courses  all the user's courses (from db.courses)
 * @param degrees  the user's degrees (from resolveDegrees(settings)) —
 *                 always at least one element per that helper's contract
 */
export function buildDegreeColumns(
  courses: Course[],
  degrees: Degree[],
  now: Date = new Date(),
): { degrees: DegreeColumn[]; total: number } {
  if (degrees.length === 0) {
    // Defensive — callers should use resolveDegrees() which guarantees ≥1.
    return { degrees: [], total: 0 }
  }
  // Group courses by degree_id. Unassigned (or referencing a deleted
  // degree) fall into the first degree so they remain visible to the user.
  const validDegreeIds = new Set(degrees.map(d => d.id))
  const fallbackId = degrees[0].id
  const coursesByDegree = new Map<string, Course[]>()
  for (const d of degrees) coursesByDegree.set(d.id, [])
  for (const c of courses) {
    const did = c.degree_id && validDegreeIds.has(c.degree_id) ? c.degree_id : fallbackId
    coursesByDegree.get(did)!.push(c)
  }

  const columns: DegreeColumn[] = []
  let total = 0
  for (const d of degrees) {
    const col = buildSingleDegreeColumn(d, coursesByDegree.get(d.id) ?? [], now)
    columns.push(col)
    total += col.totalCourses
  }
  return { degrees: columns, total }
}

/** Build the chips + yearGroups for a single degree's course list. */
function buildSingleDegreeColumn(
  degree: Degree,
  courses: Course[],
  now: Date,
): DegreeColumn {
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

  // Re-bucket the now-colored flat chips list by year-of-study so the page
  // can render TEEPO → year → semester. We use the underlying tree's year
  // metadata (yearOfStudy 1..4, null for the synthetic 'no-year') as the
  // grouping key — buildTree already partitions courses correctly.
  const yearGroupsMap = new Map<string, YearGroupColumn>()
  for (const yg of tree.years) {
    const yk = yg.yearOfStudy === null ? 'no-year' : `y${yg.yearOfStudy}`
    yearGroupsMap.set(yk, { yearKey: yk, yearLabel: yg.label, chips: [] })
  }
  for (const c of chips) {
    if (c.isUnclassified) continue   // unclassified handled below
    // Recover the yearKey from the bucket.key prefix (set in summaries-tree).
    // Bucket keys look like 'y1-א' or 'ny-ב' / 'y3-קיץ'.
    const prefix = c.bucket.key.split('-')[0]
    const yk = prefix === 'ny' ? 'no-year' : prefix
    const grp = yearGroupsMap.get(yk)
    if (grp) grp.chips.push(c)
  }
  const yearGroups: YearGroupColumn[] = []
  // Stable visible order: y1, y2, y3, y4, no-year
  for (const order of ['y1', 'y2', 'y3', 'y4', 'no-year']) {
    const g = yearGroupsMap.get(order)
    if (g && g.chips.length > 0) yearGroups.push(g)
  }
  // Append the catch-all 'לא מסווגים' bucket as its own pseudo-year so it
  // still has a slot in the tree (the user can drill into it to classify).
  const unclassifiedChip = chips.find(c => c.isUnclassified)
  if (unclassifiedChip) {
    yearGroups.push({
      yearKey: 'unclassified',
      yearLabel: 'לא מסווגים',
      chips: [unclassifiedChip],
    })
  }

  return {
    id: degree.id,
    name: degree.name,
    yearGroups,
    chips,
    totalCourses,
  }
}

/** Public access to the palette for the page to apply chip styling. */
export function semesterChipColor(colorIdx: number): string {
  return SEMESTER_PALETTE[colorIdx % SEMESTER_PALETTE.length]
}
