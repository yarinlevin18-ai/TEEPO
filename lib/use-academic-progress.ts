'use client'

/**
 * useAcademicProgress — aggregates everything the dashboard
 * <AcademicSummary /> card needs into a single hook, derived from data
 * we already have in the Drive DB.
 *
 *   - earnedCredits / totalCreditsForDegree → computeCreditSummary (catalog)
 *   - currentGPA (overall weighted)         → computeCreditSummary
 *   - semesterGPA (this semester only)      → derived inline from
 *                                             student_courses + the
 *                                             student_profile's current
 *                                             year/term
 *   - lastSemesterGPA + delta               → same derivation, previous
 *                                             semester
 *   - earnedThisSemester                    → sum of credits for courses
 *                                             completed in current semester
 *   - honorsBadge                           → derived from currentGPA
 *                                             (≥85 Cum Laude, ≥90 Magna,
 *                                             ≥95 Summa, else null)
 *
 * Current-semester resolution:
 *   - If student_profile.current_semester is set explicitly, it wins: we
 *     anchor on the latest academic_year that has course rows matching
 *     that semester (matched by rank, so explicit 'א' matches scraped 'a').
 *   - If it's unset — or no course rows match it — we fall back to the
 *     derivation via student_courses[].status === 'in_progress'. If
 *     multiple semesters appear under in-progress (e.g. summer + fall),
 *     we pick the one whose academic_year + semester sorts latest.
 *
 * No fake data: when a value can't be derived (no profile, no track, no
 * grades yet) we return `null` for that field. The card renders a clean
 * empty state for each null instead of inventing a number.
 */

import { useEffect, useMemo, useState } from 'react'
import { useDB } from './db-context'
import { computeCreditSummary } from './catalog'
import type { SemesterCode, StudentCourse, StudentProfile, UniversityCode } from '@/types'

export type HonorsBadge = 'Cum Laude' | 'Magna Cum Laude' | 'Summa Cum Laude' | null

export interface AcademicProgress {
  /** Whether the credit summary has finished loading. While true the
   *  hook returns the last computed snapshot (or nulls on first run). */
  loading: boolean
  /** Surface-level error, if any. */
  error: string | null

  /** Total credits the student has completed. null = not yet known. */
  earnedCredits: number | null
  /** Total credits required for the degree. null = no track configured. */
  totalCreditsForDegree: number | null
  /** Percentage of the way through the degree (0–100). */
  percentComplete: number | null
  /** Credits still needed to graduate. */
  remainingCredits: number | null

  /** Overall weighted average across all completed graded courses. */
  currentGPA: number | null
  /** Average for the most recent in-progress / current semester. */
  semesterGPA: number | null
  /** Average for the semester immediately before the current one. */
  lastSemesterGPA: number | null
  /** Delta = semesterGPA - lastSemesterGPA. null if either is null. */
  semesterDelta: number | null
  /** Credits the student earned during the current semester. */
  earnedThisSemester: number | null

  /** Honors band derived from currentGPA. null if GPA missing or <85. */
  honors: HonorsBadge
  /** Count of courses with status='completed' (drives "מתוך X קורסים"). */
  coursesCompletedCount: number | null

  /** Track display name (e.g. "מדעי המחשב"). Used by the section badge. */
  trackName: string | null
  /** University code from settings (BGU / TAU). */
  university: UniversityCode | null
}

/** Parse "תשפ"ה / 2024-25" + "א'/ב'/קיץ" into a sortable string so the
 *  most-recent semester sorts last lexicographically. We pad academic
 *  year to 7 chars and assign semester rank a=1, b=2, summer=3. */
/** Map a free-form semester string ('א', "סמסטר ב'", 'summer', 'a'…) to a
 *  sortable rank: a=1, b=2, summer=3, unknown=4. Shared by semesterSortKey
 *  and the explicit-semester matcher so both use identical semantics. */
export function semesterRank(sem: string): '1' | '2' | '3' | '4' {
  return sem.includes("א") || sem.toLowerCase() === 'a' ? '1'
    : sem.includes("ב") || sem.toLowerCase() === 'b' ? '2'
    : (sem.includes('קיץ') || sem.toLowerCase().includes('summer')) ? '3'
    : '4'
}

export function semesterSortKey(c: { academic_year?: string; semester?: string }): string {
  const year = (c.academic_year ?? '').padStart(7, '0')
  return `${year}-${semesterRank(c.semester ?? '')}`
}

/** Pick the "current" semester key. Prefer in_progress courses; fall
 *  back to the most-recent completed semester. Returns null if there's
 *  nothing to anchor on. */
export function pickCurrentSemester(courses: StudentCourse[]): string | null {
  const inProgress = courses.filter(c => c.status === 'in_progress' && c.semester)
  const pool = inProgress.length > 0
    ? inProgress
    : courses.filter(c => c.status === 'completed' && c.semester)
  if (pool.length === 0) return null
  let best = pool[0]
  for (const c of pool) {
    if (semesterSortKey(c) > semesterSortKey(best)) best = c
  }
  return semesterSortKey(best)
}

/** Resolve the current-semester key, honoring an explicit
 *  StudentProfile.current_semester when it can anchor to data:
 *  courses matching the explicit semester (by rank) are found and the
 *  latest academic_year among them wins. When nothing matches — or no
 *  explicit value is set — falls back to pickCurrentSemester(). */
export function resolveCurrentSemesterKey(
  courses: StudentCourse[],
  explicit: SemesterCode | null | undefined,
): string | null {
  if (explicit) {
    const rank = semesterRank(explicit)
    const matching = courses.filter(
      c => c.semester && semesterRank(c.semester) === rank,
    )
    if (matching.length > 0) {
      let best = matching[0]
      for (const c of matching) {
        if (semesterSortKey(c) > semesterSortKey(best)) best = c
      }
      return semesterSortKey(best)
    }
  }
  return pickCurrentSemester(courses)
}

/** Compute the credit-weighted average across a list of graded courses.
 *  Returns null when the list has no grades. */
function weightedAverage(rows: StudentCourse[]): number | null {
  const graded = rows.filter(c => typeof c.grade === 'number')
  if (graded.length === 0) return null
  let weighted = 0
  let weight = 0
  for (const c of graded) {
    const cr = c.credits || 1
    weighted += (c.grade as number) * cr
    weight += cr
  }
  if (weight === 0) return null
  return Math.round((weighted / weight) * 100) / 100
}

function honorsFor(gpa: number | null): HonorsBadge {
  if (gpa == null) return null
  if (gpa >= 95) return 'Summa Cum Laude'
  if (gpa >= 90) return 'Magna Cum Laude'
  if (gpa >= 85) return 'Cum Laude'
  return null
}

export function useAcademicProgress(): AcademicProgress {
  const { db, ready } = useDB() as any
  const profile = (db?.student_profile ?? null) as StudentProfile | null
  const courses = useMemo<StudentCourse[]>(
    () => (db?.student_courses ?? []) as StudentCourse[],
    [db?.student_courses],
  )
  const university = (db?.settings?.university ?? null) as UniversityCode | null
  const trackId = profile?.track_id ?? null
  const currentYear = profile?.current_year
  const explicitSemester = profile?.current_semester ?? null

  // ── Credits summary (async — uses the catalog) ────────────────────
  const [summary, setSummary] = useState<{
    completed_credits: number
    total_required: number
    remaining: number
    average: number | null
    courses_completed: number
  } | null>(null)
  const [trackName, setTrackName] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ready) return
    if (!trackId) { setSummary(null); return }
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([
      computeCreditSummary(trackId, courses, currentYear, university),
      import('./catalog').then(m => m.getTrackWithCourses(trackId, university))
        .then(r => r.track),
    ])
      .then(([res, track]) => {
        if (cancelled) return
        setSummary({
          completed_credits: res.completed_credits,
          total_required: res.total_required,
          remaining: res.remaining,
          average: res.average,
          courses_completed: res.courses_completed,
        })
        setTrackName(track?.name ?? null)
      })
      .catch((e) => { if (!cancelled) setError(e?.message ?? 'שגיאה בחישוב נק"ז') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ready, trackId, courses, currentYear, university])

  // ── Per-semester averages (derived inline, no async) ──────────────
  const { semesterGPA, lastSemesterGPA, earnedThisSemester } = useMemo(() => {
    const currentKey = resolveCurrentSemesterKey(courses, explicitSemester)
    if (!currentKey) {
      return { semesterGPA: null, lastSemesterGPA: null, earnedThisSemester: null }
    }
    const currentSem = courses.filter(c => semesterSortKey(c) === currentKey)
    const semGPA = weightedAverage(currentSem)
    const earned = currentSem
      .filter(c => c.status === 'completed')
      .reduce((s, c) => s + (c.credits || 0), 0)

    // Find the immediate predecessor — largest sortKey strictly less than current
    const previousKeys = Array.from(new Set(courses
      .filter(c => c.semester)
      .map(c => semesterSortKey(c))))
      .filter(k => k < currentKey)
      .sort()
    const prevKey = previousKeys[previousKeys.length - 1] ?? null
    const prevSem = prevKey ? courses.filter(c => semesterSortKey(c) === prevKey) : []
    const lastGPA = prevSem.length > 0 ? weightedAverage(prevSem) : null

    return {
      semesterGPA: semGPA,
      lastSemesterGPA: lastGPA,
      earnedThisSemester: earned > 0 ? earned : null,
    }
  }, [courses, explicitSemester])

  const semesterDelta = (semesterGPA != null && lastSemesterGPA != null)
    ? Math.round((semesterGPA - lastSemesterGPA) * 100) / 100
    : null

  const earnedCredits = summary?.completed_credits ?? null
  const totalCreditsForDegree = summary?.total_required ?? null
  const percentComplete = (earnedCredits != null && totalCreditsForDegree && totalCreditsForDegree > 0)
    ? Math.round((earnedCredits / totalCreditsForDegree) * 100)
    : null
  const remainingCredits = summary?.remaining ?? null
  const currentGPA = summary?.average ?? null
  const honors = honorsFor(currentGPA)

  return {
    loading,
    error,
    earnedCredits,
    totalCreditsForDegree,
    percentComplete,
    remainingCredits,
    currentGPA,
    semesterGPA,
    lastSemesterGPA,
    semesterDelta,
    earnedThisSemester,
    honors,
    coursesCompletedCount: summary?.courses_completed ?? null,
    trackName,
    university,
  }
}
