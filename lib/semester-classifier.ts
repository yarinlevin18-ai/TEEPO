/**
 * Semester classifier — derive (academic_year, semester, year_of_study) from
 * Moodle metadata for each imported course.
 *
 * BGU academic calendar (standard):
 *   Semester א:  ~Oct–Feb  (months 10, 11, 12, 1, 2)
 *   Semester ב:  ~Mar–Jun  (months 3, 4, 5, 6)
 *   Semester קיץ: ~Jul–Sep (months 7, 8, 9)
 *
 * Academic year rolls over in September: a course starting in Oct 2024 is
 * academic year "2024" (= תשפ"ה, Oct 2024–Sep 2025).
 *
 * Primary signal: Moodle's `startdate` (UNIX timestamp seconds).
 * Fallback:       parse semester hints out of course shortname / title
 *                 (e.g. "201-1-3301-25" → year 25 → 2025, semester digit).
 */

export type Semester = 'א' | 'ב' | 'קיץ'

export interface ClassificationInput {
  title?: string
  shortname?: string
  moodle_startdate?: number | null
  moodle_enddate?: number | null
}

export interface Classification {
  semester?: Semester
  academic_year?: string   // "2024" = תשפ"ה
  /** Confidence hint for UI — 'high' means we trusted startdate; 'low' means we guessed from text */
  confidence: 'high' | 'medium' | 'low' | 'none'
}

/** User setting — when the user started their degree (the month counts for rollover timing) */
export interface DegreeStart {
  year: number   // 2023
  month: number  // 1-12 (normally 10 for October)
}

// ── Primary classifier: from startdate ────────────────────────────────────

function classifyFromDate(tsSeconds: number): { semester: Semester; academic_year: string } {
  const d = new Date(tsSeconds * 1000)
  const month = d.getUTCMonth() + 1 // 1-12
  const year = d.getUTCFullYear()

  let semester: Semester
  let academicYear: number

  if (month >= 10 || month <= 2) {
    semester = 'א'
    // Oct–Dec: academic year = current year. Jan–Feb: previous year.
    academicYear = month >= 10 ? year : year - 1
  } else if (month >= 3 && month <= 6) {
    semester = 'ב'
    // Spring semester belongs to the academic year that started previous Oct.
    academicYear = year - 1
  } else {
    // Jul–Sep
    semester = 'קיץ'
    // Summer still belongs to previous academic year (תשפ"ה קיץ runs Jul-Sep 2025).
    academicYear = year - 1
  }

  return { semester, academic_year: String(academicYear) }
}

// ── Fallback: scrape hints from text ──────────────────────────────────────

/** Extract academic year from a BGU shortname like "201-1-3301-25" → 2025 */
function yearFromShortname(shortname: string): number | null {
  // BGU shortnames often end with "-NN" where NN is the last two digits of the academic year.
  const m = shortname.match(/-(\d{2})$/)
  if (!m) return null
  const two = parseInt(m[1], 10)
  // Anything 50-99 is 1950+, 00-49 is 2000+
  return two >= 50 ? 1900 + two : 2000 + two
}

/** Extract semester digit from shortname like "201-1-3301-25" where the 2nd segment is semester (1/2/3) */
function semesterFromShortname(shortname: string): Semester | null {
  // Pattern: NNN-S-NNNN-YY where S is 1|2|3 (1=א, 2=ב, 3=קיץ)
  const m = shortname.match(/^\d+-(\d)-\d+-\d+/)
  if (!m) return null
  switch (m[1]) {
    case '1': return 'א'
    case '2': return 'ב'
    case '3': return 'קיץ'
    default: return null
  }
}

/** Try to extract "סמ 1|2|ק" or "סמסטר א|ב|קיץ" hints from free text */
function semesterFromText(text: string): Semester | null {
  const t = text.replace(/\s+/g, ' ')
  if (/סמ(?:סטר)?\s*ק(?:יץ)?/i.test(t) || /\bקיץ\b/.test(t)) return 'קיץ'
  if (/סמ(?:סטר)?\s*[בb2]\b/i.test(t)) return 'ב'
  if (/סמ(?:סטר)?\s*[אa1]\b/i.test(t)) return 'א'
  return null
}

// ── Public API ────────────────────────────────────────────────────────────

/** Pick the best classification from all available signals. */
export function classifyCourse(input: ClassificationInput): Classification {
  // High confidence: Moodle startdate
  if (input.moodle_startdate && input.moodle_startdate > 0) {
    const c = classifyFromDate(input.moodle_startdate)
    return { ...c, confidence: 'high' }
  }

  // Medium confidence: parse from shortname
  if (input.shortname) {
    const sem = semesterFromShortname(input.shortname)
    const year = yearFromShortname(input.shortname)
    if (sem && year) {
      return { semester: sem, academic_year: String(year), confidence: 'medium' }
    }
    if (sem || year) {
      return {
        semester: sem || undefined,
        academic_year: year ? String(year) : undefined,
        confidence: 'medium',
      }
    }
  }

  // Low confidence: parse Hebrew semester hint from title
  if (input.title) {
    const sem = semesterFromText(input.title)
    if (sem) return { semester: sem, confidence: 'low' }
  }

  return { confidence: 'none' }
}

/**
 * Given the user's degree start date + a course's academic year + semester,
 * compute which year-of-study (1-4) the course belongs to.
 *
 * Rules:
 *   - Year-of-study increments every Oct (academic_year rollover)
 *   - Summer semester stays in the same year-of-study as the preceding year
 */
export function computeYearOfStudy(
  degreeStart: DegreeStart,
  academicYear: number,
): 1 | 2 | 3 | 4 | undefined {
  // degreeStart.month tells us if they started in Oct (regular) or mid-year
  // The academic year of their first semester:
  const firstAY = degreeStart.month >= 10
    ? degreeStart.year
    : degreeStart.year - 1
  const diff = academicYear - firstAY + 1
  if (diff < 1 || diff > 4) return undefined
  return diff as 1 | 2 | 3 | 4
}

/** Human label: "שנה א' סמסטר א'", "שנה ב' קיץ", etc. */
export function semesterLabel(
  yearOfStudy?: number,
  semester?: Semester,
): string {
  if (!yearOfStudy && !semester) return 'לא מסווג'
  const yearLabels = ['', 'א׳', 'ב׳', 'ג׳', 'ד׳']
  const parts: string[] = []
  if (yearOfStudy && yearOfStudy >= 1 && yearOfStudy <= 4) {
    parts.push(`שנה ${yearLabels[yearOfStudy]}`)
  }
  if (semester) {
    parts.push(semester === 'קיץ' ? 'קיץ' : `סמסטר ${semester}`)
  }
  return parts.join(' · ')
}

/** Sort key for grouping — earlier years first, then semester order א→ב→קיץ */
export function sortKey(
  yearOfStudy?: number,
  semester?: Semester,
): string {
  const y = yearOfStudy ?? 9  // unclassified sinks to the bottom
  const s = semester === 'א' ? 1 : semester === 'ב' ? 2 : semester === 'קיץ' ? 3 : 9
  return `${y}-${s}`
}
