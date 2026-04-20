/**
 * University branding helper.
 *
 * The platform is school-agnostic: each deploy sets NEXT_PUBLIC_UNIVERSITY_NAME
 * to its institution's Hebrew name (e.g. "אוניברסיטת חיפה"). When unset we
 * fall back to "האוניברסיטה שלך" so the UI reads naturally for any student.
 */

export const DEFAULT_UNIVERSITY_NAME = 'האוניברסיטה שלך'

export function universityName(): string {
  const raw = process.env.NEXT_PUBLIC_UNIVERSITY_NAME
  if (typeof raw !== 'string') return DEFAULT_UNIVERSITY_NAME
  const trimmed = raw.trim()
  return trimmed || DEFAULT_UNIVERSITY_NAME
}
