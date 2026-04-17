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

/** Try to extract "סמ 1|2|ק" or "סמסטר א|ב|קיץ" hints from free text.
 *  Works for patterns seen in real BGU Moodle titles:
 *    "סכנות גלובליות לדמוקרטיה סמ 1"
 *    "שיווק ואסטרטגיה סמ 2"
 *    "ניתוח נתונים למנהלים סמסטר ב' תשפ"ה"
 *    "- א סמ 1" / "- ב סמ 2"
 *  Note: ASCII `\b` doesn't work next to Hebrew letters (both sides non-word),
 *  so we use explicit non-letter/non-digit lookaheads instead. */
function semesterFromText(text: string): Semester | null {
  const t = text.replace(/\s+/g, ' ')
  // Summer: "סמ ק", "סמסטר ק", "סמ קיץ", or standalone "קיץ"
  if (/סמ(?:סטר)?\s*ק(?:יץ)?(?![א-ת])/i.test(t) || /(?:^|[^א-ת])קיץ(?![א-ת])/.test(t)) return 'קיץ'
  // Semester ב: "סמ 2", "סמ ב", "סמסטר ב", "סמסטר ב'"
  // After the letter/digit, require a non-letter & non-digit (end, space, quote, apostrophe, gershayim)
  if (/סמ(?:סטר)?\s*(?:ב|2)(?![א-תa-z0-9])/i.test(t)) return 'ב'
  // Semester א: "סמ 1", "סמ א", "סמסטר א", "סמסטר א'"
  if (/סמ(?:סטר)?\s*(?:א|1)(?![א-תa-z0-9])/i.test(t)) return 'א'
  return null
}

/**
 * Extract academic year from Hebrew year codes.
 * Hebrew year 5780+N (תש + פ + letter) corresponds to academic year 2019+N.
 *   תשפ"א = 5781 = AY 2020 (Oct 2020 – Sep 2021)
 *   תשפ"ב = 5782 = AY 2021
 *   תשפ"ג = 5783 = AY 2022
 *   תשפ"ד = 5784 = AY 2023
 *   תשפ"ה = 5785 = AY 2024  ← current-ish year in BGU sync
 *   תשפ"ו = 5786 = AY 2025
 *   תשפ"ז = 5787 = AY 2026
 *   תש"פ  = 5780 = AY 2019
 * Supports optional gershayim (״), straight quote ("), apostrophe (') or none between decade & unit.
 */
function academicYearFromHebrew(text: string): number | null {
  // Try the תש + decade-letter + unit-letter form first (5700-range)
  // Decade letters (after ת×ש): 0=none (תש"פ only has unit), פ=80, ע=70, ק=100
  // Matches תשפ"X, תשפX, תשפ״X
  const decadeUnit = text.match(/תש([פעקרש])\s*["״']?\s*([א-ט])/)
  if (decadeUnit) {
    const decadeMap: Record<string, number> = { 'פ': 80, 'ע': 70, 'ק': 100, 'ר': 200, 'ש': 300 }
    const unitMap: Record<string, number> = {
      'א': 1, 'ב': 2, 'ג': 3, 'ד': 4, 'ה': 5, 'ו': 6, 'ז': 7, 'ח': 8, 'ט': 9,
    }
    const decade = decadeMap[decadeUnit[1]]
    const unit = unitMap[decadeUnit[2]]
    if (decade && unit) {
      const hebrewYear = 5700 + decade + unit
      return hebrewYear - 3761
    }
  }
  // תש"פ / תש״פ = 5780 (no decade letter, just unit פ=80)
  const shortForm = text.match(/תש\s*["״']?\s*פ(?![א-ת])/)
  if (shortForm) {
    return 5780 - 3761 // 2019
  }
  return null
}

// ── Public API ────────────────────────────────────────────────────────────

/** Pick the best classification from all available signals.
 *  Priority order (most trustworthy first):
 *    1. Explicit Hebrew text in the title — "סמסטר ב' תשפ"ה" is a human label
 *       typed by the department secretary, so it beats any numeric encoding.
 *    2. Moodle startdate — reliable when populated, but Moodle sometimes
 *       inherits a default startdate from a parent category.
 *    3. BGU shortname ("201-1-3301-25") — the digit is often wrong/default
 *       when the same course runs in both semesters (reused shortname).
 *    4. Partial fallback: combine whatever we got. */
export function classifyCourse(input: ClassificationInput): Classification {
  // Gather each independent signal
  const titleSem = input.title ? semesterFromText(input.title) : null
  const titleYear = input.title ? academicYearFromHebrew(input.title) : null
  const dateCls = (input.moodle_startdate && input.moodle_startdate > 0)
    ? classifyFromDate(input.moodle_startdate)
    : null
  const shortSem = input.shortname ? semesterFromShortname(input.shortname) : null
  const shortYear = input.shortname ? yearFromShortname(input.shortname) : null

  // (1) Explicit title hints are king — if we have both sem+year spelled out
  //     in Hebrew, trust the title even over startdate/shortname.
  if (titleSem && titleYear) {
    return { semester: titleSem, academic_year: String(titleYear), confidence: 'high' }
  }

  // Build the result by layering: title > date > shortname
  let semester: Semester | undefined = titleSem ?? undefined
  let academicYear: string | undefined = titleYear ? String(titleYear) : undefined
  let confidence: Classification['confidence'] =
    (titleSem || titleYear) ? 'medium' : 'none'

  if (dateCls) {
    if (!semester) semester = dateCls.semester
    if (!academicYear) academicYear = dateCls.academic_year
    if (confidence === 'none') confidence = 'high'
  }

  if (shortSem && !semester) { semester = shortSem; if (confidence === 'none') confidence = 'medium' }
  if (shortYear && !academicYear) { academicYear = String(shortYear); if (confidence === 'none') confidence = 'medium' }

  if (semester || academicYear) {
    return { semester, academic_year: academicYear, confidence }
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
