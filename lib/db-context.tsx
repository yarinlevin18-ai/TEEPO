'use client'

/**
 * DB Context — React wrapper around the Drive-based per-user database.
 *
 * Holds the whole DB in memory, exposes optimistic CRUD helpers for each
 * entity type, and debounce-saves back to the user's Google Drive.
 *
 * Consumers:
 *   const { db, ready, createCourse, updateLesson, ... } = useDB()
 */

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react'
import { useAuth } from './auth-context'
import {
  DriveDB, DriveDBHandle, EMPTY_DB, loadDB, newId, saveDB, probeTokenScopes,
} from './drive-db'
import type { Course, Lesson, StudyTask, Assignment, CourseNote } from '@/types'

interface DBContextType {
  db: DriveDB
  ready: boolean
  loading: boolean
  error: string | null
  /** True when we have a Google token AND have successfully loaded the DB at least once. */
  driveConnected: boolean
  /** True when the user is signed in but we have no Google token at all. */
  driveMissing: boolean
  reload: () => Promise<void>

  // Courses
  createCourse: (input: Partial<Course> & { title: string }) => Promise<Course>
  updateCourse: (id: string, patch: Partial<Course>) => Promise<void>
  deleteCourse: (id: string) => Promise<void>

  // Lessons
  createLesson: (courseId: string, input: Partial<Lesson> & { title: string }) => Promise<Lesson>
  updateLesson: (id: string, patch: Partial<Lesson>) => Promise<void>
  deleteLesson: (id: string) => Promise<void>

  // Tasks
  createTask: (input: Partial<StudyTask> & { title: string }) => Promise<StudyTask>
  updateTask: (id: string, patch: Partial<StudyTask>) => Promise<void>
  deleteTask: (id: string) => Promise<void>

  // Assignments
  createAssignment: (input: Partial<Assignment> & { title: string }) => Promise<Assignment>
  updateAssignment: (id: string, patch: Partial<Assignment>) => Promise<void>
  deleteAssignment: (id: string) => Promise<void>

  // Notes
  createNote: (courseId: string, input: Partial<CourseNote> & { title: string; content: string }) => Promise<CourseNote>
  updateNote: (id: string, patch: Partial<CourseNote>) => Promise<void>
  deleteNote: (id: string) => Promise<void>
}

const DBContext = createContext<DBContextType | undefined>(undefined)

function calcCourseProgress(lessons: Lesson[], courseId: string): number {
  const courseLessons = lessons.filter(l => l.course_id === courseId)
  if (courseLessons.length === 0) return 0
  const completed = courseLessons.filter(l => l.is_completed).length
  return Math.round((completed / courseLessons.length) * 100)
}

export function DBProvider({ children }: { children: React.ReactNode }) {
  const { user, googleToken, refreshGoogleToken } = useAuth()
  const [db, setDb] = useState<DriveDB>(EMPTY_DB)
  const [handle, setHandle] = useState<DriveDBHandle | null>(null)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pending save scheduler
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<DriveDB | null>(null)

  // Run a Drive operation, retrying once with a refreshed token on 401.
  const withToken = useCallback(async <T,>(
    op: (t: string) => Promise<T>,
  ): Promise<T> => {
    let token = googleToken
    if (!token) token = await refreshGoogleToken()
    if (!token) throw new Error('לא מחובר ל-Google Drive. התחבר דרך Google כדי להפעיל את מסד הנתונים.')
    try {
      return await op(token)
    } catch (e: any) {
      if (typeof e?.message === 'string' && /401|403/.test(e.message)) {
        const fresh = await refreshGoogleToken()
        if (fresh) return await op(fresh)
      }
      throw e
    }
  }, [googleToken, refreshGoogleToken])

  // Load DB on mount / when token becomes available
  const reload = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const { db: loaded, handle: h } = await withToken(t => loadDB(t))
      setDb(loaded)
      setHandle(h)
      setReady(true)
    } catch (e: any) {
      // If Drive rejected us, probe the token to give the user an accurate
      // cause (scope missing vs API disabled vs expired) instead of a raw 403.
      let message = e?.message || 'טעינת מסד הנתונים נכשלה'
      try {
        const token = googleToken || (await refreshGoogleToken())
        if (token) {
          const info = await probeTokenScopes(token)
          console.info('[drive-db] token scopes:', info)
          if (!info.hasDriveFile && !info.error) {
            message = 'הטוקן מ-Google לא כולל את הרשאת drive.file. צא והתחבר מחדש — חשוב לאשר את תיבת "רואה, מעלה ומוריד קבצים שנוצרו ע"י SmartDesk".'
          } else if (info.error) {
            message = `הטוקן מ-Google לא תקף (${info.error}). לחץ "התחבר מחדש ל-Google".`
          }
        }
      } catch {}
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [user, withToken, googleToken, refreshGoogleToken])

  // Load once per (user, token) pair — don't retry in a loop on failure.
  const attemptedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!user) {
      setDb(EMPTY_DB)
      setHandle(null)
      setReady(false)
      setError(null)
      attemptedRef.current = null
      return
    }
    if (!googleToken) return
    const key = `${user.id}::${googleToken.slice(0, 12)}`
    if (attemptedRef.current === key) return
    attemptedRef.current = key
    reload()
  }, [user, googleToken, reload])

  // Schedule a save (debounced ~600ms so rapid edits batch into one write)
  const scheduleSave = useCallback((next: DriveDB) => {
    pendingRef.current = next
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const snapshot = pendingRef.current
      if (!snapshot || !handle) return
      try {
        const saved = await withToken(t => saveDB(t, handle, snapshot))
        setDb(prev => ({ ...prev, updated_at: saved.updated_at }))
      } catch (e: any) {
        setError(e?.message || 'שמירה ל-Drive נכשלה')
      }
    }, 600)
  }, [handle, withToken])

  // Flush pending save on unmount
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
  }, [])

  // Generic mutator: applies `fn` to the current DB, updates state, schedules save
  const mutate = useCallback((fn: (db: DriveDB) => DriveDB) => {
    setDb(prev => {
      const next = fn(prev)
      scheduleSave(next)
      return next
    })
  }, [scheduleSave])

  // ── Courses ────────────────────────────────────────────────
  const createCourse = useCallback(async (input: Partial<Course> & { title: string }): Promise<Course> => {
    const course: Course = {
      id: newId('course'),
      user_id: user?.id || 'local',
      title: input.title,
      source: input.source || 'custom_url',
      source_url: input.source_url,
      thumbnail_url: input.thumbnail_url,
      description: input.description,
      progress_percentage: 0,
      status: 'active',
      started_at: input.started_at,
      completed_at: input.completed_at,
      created_at: new Date().toISOString(),
    }
    mutate(d => ({ ...d, courses: [course, ...d.courses] }))
    return course
  }, [mutate, user])

  const updateCourse = useCallback(async (id: string, patch: Partial<Course>) => {
    mutate(d => ({
      ...d,
      courses: d.courses.map(c => (c.id === id ? { ...c, ...patch } : c)),
    }))
  }, [mutate])

  const deleteCourse = useCallback(async (id: string) => {
    mutate(d => ({
      ...d,
      courses: d.courses.filter(c => c.id !== id),
      lessons: d.lessons.filter(l => l.course_id !== id),
      notes: d.notes.filter(n => n.course_id !== id),
    }))
  }, [mutate])

  // ── Lessons ────────────────────────────────────────────────
  const createLesson = useCallback(async (
    courseId: string,
    input: Partial<Lesson> & { title: string },
  ): Promise<Lesson> => {
    const lesson: Lesson = {
      id: newId('lesson'),
      course_id: courseId,
      title: input.title,
      content: input.content,
      ai_summary: input.ai_summary,
      duration_minutes: input.duration_minutes,
      order_index: input.order_index ?? 0,
      is_completed: false,
      files: input.files || [],
    }
    mutate(d => {
      const siblings = d.lessons.filter(l => l.course_id === courseId)
      const nextOrder = input.order_index ?? siblings.length
      const withNew = [...d.lessons, { ...lesson, order_index: nextOrder }]
      const progress = calcCourseProgress(withNew, courseId)
      return {
        ...d,
        lessons: withNew,
        courses: d.courses.map(c => c.id === courseId ? { ...c, progress_percentage: progress } : c),
      }
    })
    return lesson
  }, [mutate])

  const updateLesson = useCallback(async (id: string, patch: Partial<Lesson>) => {
    mutate(d => {
      const lessons = d.lessons.map(l => l.id === id ? { ...l, ...patch } : l)
      const target = lessons.find(l => l.id === id)
      const courseId = target?.course_id
      const courses = courseId
        ? d.courses.map(c => c.id === courseId
            ? { ...c, progress_percentage: calcCourseProgress(lessons, courseId) }
            : c)
        : d.courses
      return { ...d, lessons, courses }
    })
  }, [mutate])

  const deleteLesson = useCallback(async (id: string) => {
    mutate(d => {
      const target = d.lessons.find(l => l.id === id)
      const lessons = d.lessons.filter(l => l.id !== id)
      const courseId = target?.course_id
      const courses = courseId
        ? d.courses.map(c => c.id === courseId
            ? { ...c, progress_percentage: calcCourseProgress(lessons, courseId) }
            : c)
        : d.courses
      return { ...d, lessons, courses }
    })
  }, [mutate])

  // ── Tasks ──────────────────────────────────────────────────
  const createTask = useCallback(async (input: Partial<StudyTask> & { title: string }): Promise<StudyTask> => {
    const task: StudyTask = {
      id: newId('task'),
      user_id: user?.id || 'local',
      course_id: input.course_id,
      title: input.title,
      description: input.description,
      scheduled_date: input.scheduled_date,
      time_slot: input.time_slot,
      duration_minutes: input.duration_minutes,
      category: input.category || 'study',
      is_completed: false,
      created_at: new Date().toISOString(),
    }
    mutate(d => ({ ...d, tasks: [task, ...d.tasks] }))
    return task
  }, [mutate, user])

  const updateTask = useCallback(async (id: string, patch: Partial<StudyTask>) => {
    mutate(d => ({
      ...d,
      tasks: d.tasks.map(t => t.id === id ? { ...t, ...patch } : t),
    }))
  }, [mutate])

  const deleteTask = useCallback(async (id: string) => {
    mutate(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== id) }))
  }, [mutate])

  // ── Assignments ────────────────────────────────────────────
  const createAssignment = useCallback(async (input: Partial<Assignment> & { title: string }): Promise<Assignment> => {
    const a: Assignment = {
      id: newId('assn'),
      user_id: user?.id || 'local',
      course_id: input.course_id,
      title: input.title,
      description: input.description,
      deadline: input.deadline,
      status: input.status || 'todo',
      priority: input.priority || 'medium',
      assignment_tasks: input.assignment_tasks || [],
    }
    mutate(d => ({ ...d, assignments: [a, ...d.assignments] }))
    return a
  }, [mutate, user])

  const updateAssignment = useCallback(async (id: string, patch: Partial<Assignment>) => {
    mutate(d => ({
      ...d,
      assignments: d.assignments.map(a => a.id === id ? { ...a, ...patch } : a),
    }))
  }, [mutate])

  const deleteAssignment = useCallback(async (id: string) => {
    mutate(d => ({ ...d, assignments: d.assignments.filter(a => a.id !== id) }))
  }, [mutate])

  // ── Notes ──────────────────────────────────────────────────
  const createNote = useCallback(async (
    courseId: string,
    input: Partial<CourseNote> & { title: string; content: string },
  ): Promise<CourseNote> => {
    const now = new Date().toISOString()
    const note: CourseNote = {
      id: newId('note'),
      course_id: courseId,
      user_id: user?.id || 'local',
      title: input.title,
      content: input.content,
      note_type: input.note_type || 'manual',
      file_name: input.file_name,
      created_at: now,
      updated_at: now,
    }
    mutate(d => ({ ...d, notes: [note, ...d.notes] }))
    return note
  }, [mutate, user])

  const updateNote = useCallback(async (id: string, patch: Partial<CourseNote>) => {
    mutate(d => ({
      ...d,
      notes: d.notes.map(n => n.id === id ? { ...n, ...patch, updated_at: new Date().toISOString() } : n),
    }))
  }, [mutate])

  const deleteNote = useCallback(async (id: string) => {
    mutate(d => ({ ...d, notes: d.notes.filter(n => n.id !== id) }))
  }, [mutate])

  const driveConnected = !!googleToken && ready && !error
  const driveMissing = !!user && !googleToken

  const value = useMemo<DBContextType>(() => ({
    db, ready, loading, error, driveConnected, driveMissing, reload,
    createCourse, updateCourse, deleteCourse,
    createLesson, updateLesson, deleteLesson,
    createTask, updateTask, deleteTask,
    createAssignment, updateAssignment, deleteAssignment,
    createNote, updateNote, deleteNote,
  }), [
    db, ready, loading, error, driveConnected, driveMissing, reload,
    createCourse, updateCourse, deleteCourse,
    createLesson, updateLesson, deleteLesson,
    createTask, updateTask, deleteTask,
    createAssignment, updateAssignment, deleteAssignment,
    createNote, updateNote, deleteNote,
  ])

  return <DBContext.Provider value={value}>{children}</DBContext.Provider>
}

export function useDB() {
  const ctx = useContext(DBContext)
  if (!ctx) throw new Error('useDB must be used within a DBProvider')
  return ctx
}

/** Convenience selector hooks */
export function useCourses() {
  const { db } = useDB()
  return db.courses
}

export function useCourse(id: string | undefined) {
  const { db } = useDB()
  return id ? db.courses.find(c => c.id === id) ?? null : null
}

export function useLessons(courseId: string | undefined) {
  const { db } = useDB()
  if (!courseId) return []
  return db.lessons
    .filter(l => l.course_id === courseId)
    .sort((a, b) => a.order_index - b.order_index)
}
