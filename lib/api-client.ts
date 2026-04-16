/**
 * API Client - תקשורת עם שרת ה-Flask Backend
 */
import { supabase } from './supabase'

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000'

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

// ---- Courses ----
export const api = {
  courses: {
    list: () => request<any[]>('/api/courses'),
    get: (id: string) => request<any>(`/api/courses/${id}`),
    update: (id: string, data: Record<string, any>) =>
      request<any>(`/api/courses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    extract: (url: string) =>
      request<any>('/api/courses/extract', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),
  },

  tasks: {
    list: (date?: string) =>
      request<any[]>(`/api/tasks${date ? `?date=${date}` : ''}`),
    create: (data: Record<string, any>) =>
      request<any>('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, any>) =>
      request<any>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete: (id: string) =>
      request<any>(`/api/tasks/${id}`, { method: 'DELETE' }),
  },

  assignments: {
    list: () => request<any[]>('/api/assignments'),
    breakdown: (title: string, description: string, deadline: string) =>
      request<any>('/api/assignments/breakdown', {
        method: 'POST',
        body: JSON.stringify({ title, description, deadline }),
      }),
  },

  academic: {
    advise: (courseName: string, major?: string, yourCourses?: string[]) =>
      request<any>('/api/academic/advise', {
        method: 'POST',
        body: JSON.stringify({ course_name: courseName, major, your_courses: yourCourses }),
      }),
  },

  notes: {
    list: (courseId: string) =>
      request<any[]>(`/api/courses/${courseId}/notes`),
    create: (courseId: string, data: { title: string; content: string; note_type?: string; file_name?: string }) =>
      request<any>(`/api/courses/${courseId}/notes`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (courseId: string, noteId: string, data: { title?: string; content?: string }) =>
      request<any>(`/api/courses/${courseId}/notes/${noteId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (courseId: string, noteId: string) =>
      request<any>(`/api/courses/${courseId}/notes/${noteId}`, {
        method: 'DELETE',
      }),
    summarize: (courseId: string, content: string, title?: string, fileName?: string) =>
      request<any>(`/api/courses/${courseId}/notes/summarize`, {
        method: 'POST',
        body: JSON.stringify({ content, title, file_name: fileName }),
      }),
  },

  gdocs: {
    fetch: (url: string) =>
      request<{ content: string; title: string; char_count: number }>('/api/gdocs/fetch', {
        method: 'POST',
        body: JSON.stringify({ url }),
      }),
  },

  lessons: {
    update: (id: string, data: Record<string, any>) =>
      request<any>(`/api/lessons/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    summarize: (content: string, title?: string) =>
      request<any>('/api/lessons/summarize', {
        method: 'POST',
        body: JSON.stringify({ content, title }),
      }),
    generateQuiz: (content: string, numQuestions = 10) =>
      request<any>('/api/lessons/quiz', {
        method: 'POST',
        body: JSON.stringify({ content, num_questions: numQuestions }),
      }),
  },

  bgu: {
    status: () => request<any>('/api/bgu/status'),
    grades: () => request<any>('/api/bgu/grades'),
    courses: () => request<any>('/api/bgu/courses'),
    assignmentsAll: () => request<any>('/api/bgu/assignments/all'),
    schedule: () => request<any>('/api/bgu/schedule'),
    degree: () => request<any>('/api/bgu/degree'),
    saveDegree: (data: Record<string, any>) =>
      request<any>('/api/bgu/degree', { method: 'POST', body: JSON.stringify(data) }),
  },
}
