/**
 * Course Catalog — client-side loader.
 *
 * Static reference data (tracks, departments, courses) bundled with the
 * frontend and loaded lazily from /public/catalog.json. The operator swaps
 * the JSON contents per-deploy to match their university's shnaton.
 *
 * Matches the project migration direction: Supabase is auth-only, per-user
 * data lives in Drive, and static reference data lives with the frontend.
 */

export type CatalogTrack = {
  id: string
  name: string
  name_en?: string
  departments: string[]
  total_credits: number
  type: string
  details: Record<string, any>
  [k: string]: any
}

export type CatalogDepartment = {
  id: string
  name: string
  name_en?: string
  [k: string]: any
}

export type CatalogCourse = {
  course_id: string
  name: string
  name_he?: string
  name_en?: string
  credits: number
  department: string
  year?: number
  semester?: string
  type: string
  tracks: string[]
  prerequisites: string[]
  category?: string
  [k: string]: any
}

type CatalogFile = {
  metadata?: Record<string, any>
  departments: CatalogDepartment[]
  tracks: CatalogTrack[]
  courses: CatalogCourse[]
}

let _cache: Promise<CatalogFile> | null = null

async function loadCatalog(): Promise<CatalogFile> {
  if (!_cache) {
    _cache = (async () => {
      const res = await fetch('/catalog.json', { cache: 'force-cache' })
      if (!res.ok) throw new Error(`לא הצלחנו לטעון את קטלוג הקורסים (${res.status})`)
      const raw = await res.json()
      // Normalize: ensure every track has `details`, every course has `prerequisites`.
      const tracks: CatalogTrack[] = (raw.tracks || []).map((t: any) => ({
        ...t,
        details: t.details ?? {},
      }))
      const courses: CatalogCourse[] = (raw.courses || []).map((c: any) => ({
        ...c,
        prerequisites: c.prerequisites ?? [],
        tracks: c.tracks ?? [],
      }))
      return {
        metadata: raw.metadata,
        departments: raw.departments || [],
        tracks,
        courses,
      }
    })()
    // If loading fails, clear cache so subsequent retries can succeed.
    _cache.catch(() => { _cache = null })
  }
  return _cache
}

export async function getTracks(): Promise<CatalogTrack[]> {
  const c = await loadCatalog()
  return c.tracks
}

export async function getTrackWithCourses(trackId: string): Promise<{ track: CatalogTrack; courses: CatalogCourse[] }> {
  const c = await loadCatalog()
  const track = c.tracks.find(t => t.id === trackId)
  if (!track) throw new Error('מסלול לא נמצא')
  const courses = c.courses.filter(co => co.tracks?.includes(trackId))
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0) || String(a.semester).localeCompare(String(b.semester)))
  // Normalize to the shape the UI expects — `name` in Hebrew preferred
  const uiCourses = courses.map(co => ({
    ...co,
    name: co.name_he || co.name,
    name_en: co.name_en || (co.name && /^[A-Za-z]/.test(co.name) ? co.name : undefined),
  }))
  return { track, courses: uiCourses }
}

export async function getDepartments(): Promise<CatalogDepartment[]> {
  const c = await loadCatalog()
  return c.departments
}

export async function searchCatalogCourses(query: string, dept?: string, trackId?: string): Promise<CatalogCourse[]> {
  const c = await loadCatalog()
  const q = query.trim().toLowerCase()
  const results = c.courses.filter(co => {
    if (dept && co.department !== dept) return false
    if (trackId && !co.tracks?.includes(trackId)) return false
    if (!q) return true
    const hay = [co.course_id, co.name, co.name_he, co.name_en].filter(Boolean).join(' ').toLowerCase()
    return hay.includes(q)
  }).slice(0, 50)
  return results.map(co => ({
    ...co,
    name: co.name_he || co.name,
  }))
}

/**
 * Compute credit summary client-side. Backend `/credits` relies on the empty
 * catalog tables so we compute it here instead, combining local track data
 * with the student's course list.
 */
export async function computeCreditSummary(
  trackId: string,
  myCourses: Array<{ credits: number; status: string; grade?: number }>,
  currentYear?: number,
) {
  const { track } = await getTrackWithCourses(trackId)
  const completed = myCourses.filter(c => c.status === 'completed')
  const inProgress = myCourses.filter(c => c.status === 'in_progress')
  const completedCredits = completed.reduce((s, c) => s + (c.credits || 0), 0)
  const inProgressCredits = inProgress.reduce((s, c) => s + (c.credits || 0), 0)
  const totalRequired = track.total_credits || 0
  const remaining = Math.max(0, totalRequired - completedCredits)

  // Grade average (weighted by credits)
  const graded = completed.filter(c => typeof c.grade === 'number')
  let average: number | null = null
  if (graded.length > 0) {
    const totalWeighted = graded.reduce((s, c) => s + (c.grade! * (c.credits || 1)), 0)
    const totalWeight = graded.reduce((s, c) => s + (c.credits || 1), 0)
    average = totalWeight > 0 ? Math.round((totalWeighted / totalWeight) * 100) / 100 : null
  }

  // Recommended per semester: assume 6 semesters total
  const totalSemesters = track.type === 'dual' ? 6 : 6
  const semestersUsed = Math.max(0, ((currentYear ?? 1) - 1) * 2)
  const remainingSemesters = Math.max(1, totalSemesters - semestersUsed)
  const recommendedPerSemester = Math.ceil(remaining / remainingSemesters)

  return {
    status: 'success' as const,
    total_required: totalRequired,
    completed_credits: completedCredits,
    in_progress_credits: inProgressCredits,
    remaining,
    remaining_semesters: remainingSemesters,
    recommended_per_semester: recommendedPerSemester,
    average,
    courses_completed: completed.length,
    courses_in_progress: inProgress.length,
  }
}
