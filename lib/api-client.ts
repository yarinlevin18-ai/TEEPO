/**
 * API Client — Flask backend wrapper.
 *
 * Trimmed to the live surface after the Drive-DB migration. CRUD for
 * courses/tasks/assignments/notes/lessons now goes through `useDB()` (see
 * lib/db-context.tsx). What remains here are the backend-only endpoints:
 * AI helpers, audio transcription, grades scrape, and the static catalog.
 *
 * If you're adding a new method, ask first: does this belong in Drive DB
 * instead? The general rule is: per-user user data → Drive DB, AI/scrape
 * work that needs the server → here.
 */
import { supabase } from './supabase'
import {
  getTracks as _catalogTracks,
  getTrackWithCourses as _catalogTrack,
  searchCatalogCourses as _catalogSearch,
} from './catalog'
import { BACKEND_URL as BACKEND } from './backend-url'

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` }
  }
  return {}
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = await getAuthHeaders()

  const res = await fetch(`${BACKEND}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `שגיאת שרת: ${res.status}`)
  }

  return res.json()
}

export const api = {
  assignments: {
    /** Claude breakdown of an assignment into checklist sub-tasks. */
    breakdown: (title: string, description: string, deadline: string) =>
      request<any>('/api/assignments/breakdown', {
        method: 'POST',
        body: JSON.stringify({ title, description, deadline }),
      }),
  },

  grades: {
    /** GET /api/university/grades — saved grades from DB merged with live Moodle/Portal scrape. */
    list: () => request<{ grades: any[]; average: number | null }>('/api/university/grades'),
    /**
     * POST /api/grades/manual — create or update a manually-entered grade.
     * Coexists with scraped grades; uniqueness is on (course_name, semester, component).
     */
    createManual: (input: {
      course_name: string
      grade?: number
      grade_text?: string
      credits?: number
      semester?: string
      academic_year?: string
      component?: string
    }) =>
      request<any>('/api/grades/manual', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  },

  catalog: {
    // Static catalog data only — per-user data lives in Drive DB now.
    // Served from /public/catalog.<uni>.json (v2.1) with /catalog.json
    // legacy fallback. Optional `university` param picks the file.
    tracks: (university?: 'bgu' | 'tau') => _catalogTracks(university),
    track: (id: string, university?: 'bgu' | 'tau') => _catalogTrack(id, university),
    searchCourses: (q: string, dept?: string, track?: string, university?: 'bgu' | 'tau') =>
      _catalogSearch(q, dept, track, university),
  },
}
