/**
 * Fuzzy match a Google Calendar event title to one of the user's TEEPO
 * courses. Used by the dashboard "היום בלוח" widget so each calendar slot
 * becomes a clickable link into /summaries for the right course.
 *
 * Why fuzzy: calendar titles are typed by hand or come from the
 * university scheduling system with prefixes/suffixes ("הרצאה: מבוא
 * למדמ״ח", "מבוא למדמ״ח - תרגול 5"), while course titles are normalized
 * Moodle names. A naive equality check misses everything.
 *
 * Strategy: normalize both sides (strip Hebrew geresh/gershayim variants,
 * collapse whitespace, lowercase Latin chars), then look for substring
 * containment in either direction. Score by overlap length so the most
 * specific matching course wins when several courses share a prefix
 * ("מבוא לפיזיקה" vs "מבוא לפיזיקה 2").
 */

import type { Course } from '@/types'

/** Minimum normalized-overlap length to count as a match. 4 chars filters
 *  out junk hits on short connector words like "של" or "the". */
const MIN_OVERLAP = 4

/** Normalize a title for comparison.
 *  - Lower-case Latin letters (Hebrew is unaffected).
 *  - Collapse whitespace.
 *  - Strip quote variants (', ", ׳, ״, ’, “, ”, `).
 *  - Replace various dashes with a single space (so "מבוא — פיזיקה" matches "מבוא פיזיקה").
 *  - Trim. */
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’׳'`ʼ]/g, '')      // single quotes / geresh
    .replace(/[“”״"]/g, '')             // double quotes / gershayim
    .replace(/[\-–—_:|\/\\]+/g, ' ')         // dashes + separators → space
    .replace(/\s+/g, ' ')
    .trim()
}

/** Containment score — how much of the shorter normalized string lies
 *  inside the longer one. Returns 0 if there's no substring containment,
 *  otherwise the length of the contained string. */
function containmentScore(a: string, b: string): number {
  if (!a || !b) return 0
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return longer.includes(shorter) ? shorter.length : 0
}

/**
 * Pick the best-matching course for a calendar event title.
 * Returns null when nothing crosses the MIN_OVERLAP threshold.
 */
export function matchCourseForEvent(
  eventTitle: string,
  courses: Course[],
): Course | null {
  if (!eventTitle || courses.length === 0) return null
  const evNorm = normalizeTitle(eventTitle)
  if (evNorm.length < MIN_OVERLAP) return null

  let best: { course: Course; score: number } | null = null
  for (const c of courses) {
    const courseNorm = normalizeTitle(c.title)
    if (courseNorm.length < MIN_OVERLAP) continue
    const score = containmentScore(evNorm, courseNorm)
    if (score >= MIN_OVERLAP && (!best || score > best.score)) {
      best = { course: c, score }
    }
  }
  return best?.course ?? null
}
