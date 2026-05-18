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

  academic: {
    /** Claude-powered "should I take this course?" advisor. v2.1 picks BGU/TAU variant. */
    advise: (
      courseName: string,
      major?: string,
      yourCourses?: string[],
      university?: string,
    ) =>
      request<any>('/api/academic/advise', {
        method: 'POST',
        body: JSON.stringify({ course_name: courseName, major, your_courses: yourCourses, university }),
      }),
  },

  lessons: {
    /**
     * Upload a recording of a class → Whisper transcription → Claude summary.
     * Multipart/form-data, so we bypass the JSON `request()` helper.
     */
    transcribe: async (
      lessonId: string,
      audio: Blob,
      filename = 'recording.webm',
    ): Promise<{ transcript: string; summary: string; lesson: any }> => {
      const authHeaders = await getAuthHeaders()
      const form = new FormData()
      form.append('audio', audio, filename)
      const res = await fetch(`${BACKEND}/api/lessons/${lessonId}/transcribe`, {
        method: 'POST',
        headers: { ...authHeaders }, // Do NOT set Content-Type — browser adds boundary
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }))
        throw new Error(err.error || `שגיאת תמלול: ${res.status}`)
      }
      return res.json()
    },
    /**
     * Async large-recording pipeline. Uploads audio/video up to 500 MB,
     * returns a `job_id`, then poll `transcribeJob(jobId)` every ~2 s
     * until stage === 'done' or 'error'.
     */
    startTranscribe: async (
      lessonId: string,
      audio: Blob,
      filename: string,
      onUploadProgress?: (pct: number) => void,
    ): Promise<{ job_id: string; size_bytes: number; filename: string }> => {
      const authHeaders = await getAuthHeaders()
      const form = new FormData()
      form.append('audio', audio, filename)

      // Use XHR so we get real upload progress — fetch() doesn't expose it.
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', `${BACKEND}/api/lessons/${lessonId}/transcribe/start`)
        for (const [k, v] of Object.entries(authHeaders)) xhr.setRequestHeader(k, v)
        xhr.upload.onprogress = (e) => {
          if (onUploadProgress && e.lengthComputable) {
            onUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText)) }
            catch { reject(new Error('תגובת שרת לא תקינה.')) }
          } else {
            let msg = `שגיאת העלאה (${xhr.status}).`
            try {
              const j = JSON.parse(xhr.responseText)
              if (j?.error) msg = j.error
            } catch { /* keep default */ }
            reject(new Error(msg))
          }
        }
        xhr.onerror = () => reject(new Error('חיבור לרשת נכשל.'))
        xhr.send(form)
      })
    },
    transcribeJob: (jobId: string) =>
      request<{
        stage: 'queued' | 'chunking' | 'transcribing' | 'summarizing' | 'saving' | 'done' | 'error'
        progress: number
        total: number
        error: string | null
        transcript: string
        summary: string
        filename: string
        size_bytes: number
      }>(`/api/transcribe/jobs/${jobId}`),
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
