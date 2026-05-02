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
  DriveDB, DriveDBHandle, EMPTY_DB, loadDB, newId, saveDB,
  saveDBDebounced, flushPendingSave, hasPendingSave, probeTokenScopes,
  StudentProfile, StudentCourse,
} from './drive-db'
import { ensureCourseFolders, pathForCourse } from './drive-folders'
import type {
  Course, Lesson, StudyTask, Assignment, CourseNote, UserSettings,
  Exam, StudyPlan, PracticeSession, Flashcard, Simulation,
} from '@/types'
import type { PointEvent } from '@/lib/exam/points'

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

  // Settings
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>
  /** Replace all courses at once (used by re-classifier to apply bulk updates efficiently) */
  replaceCourses: (courses: Course[]) => Promise<void>

  // Student catalog (credits tracking)
  setStudentProfile: (patch: Partial<StudentProfile> & { track_id: string; start_year: number; current_year: number }) => Promise<void>
  upsertStudentCourse: (input: Partial<StudentCourse> & { course_id: string; course_name: string; credits: number }) => Promise<void>
  upsertStudentCoursesBulk: (rows: Array<Partial<StudentCourse> & { course_id: string; course_name: string; credits: number }>) => Promise<void>
  removeStudentCourse: (courseId: string) => Promise<void>

  // Drive folders (user-facing course hierarchy under TEEPO/)
  /** Ensure one course has its Drive folder hierarchy; persists IDs back onto the course. */
  syncCourseFolders: (courseId: string) => Promise<void>
  /** Ensure every course has its Drive folders. Accepts optional progress callback. */
  syncAllCourseFolders: (
    onProgress?: (done: number, total: number, title: string) => void,
  ) => Promise<{ created: number; skipped: number; failed: number }>

  // ── TEEPO Exam (spec §7.2) ────────────────────────────────────
  upsertExam: (exam: Exam) => Promise<void>
  removeExam: (id: string) => Promise<void>
  upsertStudyPlan: (plan: StudyPlan) => Promise<void>
  removeStudyPlan: (id: string) => Promise<void>
  upsertPracticeSession: (session: PracticeSession) => Promise<void>
  upsertFlashcards: (cards: Flashcard[]) => Promise<void>
  upsertSimulation: (sim: Simulation) => Promise<void>
  appendPointEvent: (event: PointEvent) => Promise<void>
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

  // Pending-save state lives in `lib/drive-db` (see `saveDBDebounced`). We
  // don't keep a timer or pending DB here anymore — that was duplicated state.

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
            message = 'הטוקן מ-Google לא כולל את הרשאת drive.file. צא והתחבר מחדש — חשוב לאשר את תיבת "רואה, מעלה ומוריד קבצים שנוצרו ע"י TEEPO".'
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

  // Schedule a debounced save. The actual 30-second timer + batching live in
  // `lib/drive-db` so writes from any context (workers, signOut handlers) share
  // the same queue. We just kick it and react to the eventual settled Promise.
  const scheduleSave = useCallback((next: DriveDB) => {
    if (!handle) return
    withToken(t => saveDBDebounced(t, handle, next))
      .then(saved => setDb(prev => ({ ...prev, updated_at: saved.updated_at })))
      .catch(e => setError(e?.message || 'שמירה ל-Drive נכשלה'))
  }, [handle, withToken])

  // Flush any pending save on unmount or tab close — the 30s window means a
  // user closing the tab mid-edit would otherwise lose their last changes.
  useEffect(() => {
    const onBeforeUnload = () => {
      // Synchronous best-effort. We can't await here; the request may or may
      // not get through before the tab dies. Better than dropping the write.
      if (hasPendingSave()) {
        void withToken(t => flushPendingSave(t)).catch(() => {})
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      // Component unmount: fire any pending save (e.g. user signing out, route
      // change) so we don't discard the last 30 seconds of edits.
      if (hasPendingSave()) {
        void withToken(t => flushPendingSave(t)).catch(() => {})
      }
    }
  }, [withToken])

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

  // ── Settings ───────────────────────────────────────────────
  const updateSettings = useCallback(async (patch: Partial<UserSettings>) => {
    mutate(d => ({ ...d, settings: { ...(d.settings || {}), ...patch } }))
  }, [mutate])

  const replaceCourses = useCallback(async (courses: Course[]) => {
    mutate(d => ({ ...d, courses }))
  }, [mutate])

  // ── Student catalog ────────────────────────────────────────
  const setStudentProfile = useCallback(async (
    patch: Partial<StudentProfile> & { track_id: string; start_year: number; current_year: number },
  ) => {
    const now = new Date().toISOString()
    mutate(d => ({
      ...d,
      student_profile: {
        ...(d.student_profile || {}),
        ...patch,
        updated_at: now,
      } as StudentProfile,
    }))
  }, [mutate])

  const upsertStudentCourse = useCallback(async (
    input: Partial<StudentCourse> & { course_id: string; course_name: string; credits: number },
  ) => {
    const now = new Date().toISOString()
    mutate(d => {
      const existing = d.student_courses || []
      const idx = existing.findIndex(c => c.course_id === input.course_id)
      const row: StudentCourse = {
        id: existing[idx]?.id || newId('scourse'),
        course_id: input.course_id,
        course_name: input.course_name,
        credits: input.credits,
        status: input.status || 'completed',
        grade: input.grade,
        semester: input.semester,
        academic_year: input.academic_year,
        source: input.source || 'manual',
        updated_at: now,
      }
      const next = idx >= 0
        ? existing.map((c, i) => i === idx ? row : c)
        : [...existing, row]
      return { ...d, student_courses: next }
    })
  }, [mutate])

  const upsertStudentCoursesBulk = useCallback(async (
    rows: Array<Partial<StudentCourse> & { course_id: string; course_name: string; credits: number }>,
  ) => {
    const now = new Date().toISOString()
    mutate(d => {
      const existing = d.student_courses || []
      const byCourseId = new Map(existing.map(c => [c.course_id, c]))
      for (const r of rows) {
        const prev = byCourseId.get(r.course_id)
        byCourseId.set(r.course_id, {
          id: prev?.id || newId('scourse'),
          course_id: r.course_id,
          course_name: r.course_name,
          credits: r.credits,
          status: r.status || 'completed',
          grade: r.grade ?? prev?.grade,
          semester: r.semester ?? prev?.semester,
          academic_year: r.academic_year ?? prev?.academic_year,
          source: r.source || 'catalog',
          updated_at: now,
        })
      }
      return { ...d, student_courses: Array.from(byCourseId.values()) }
    })
  }, [mutate])

  const removeStudentCourse = useCallback(async (courseId: string) => {
    mutate(d => ({
      ...d,
      student_courses: (d.student_courses || []).filter(c => c.course_id !== courseId),
    }))
  }, [mutate])

  // ── Drive folders ──────────────────────────────────────────
  const syncCourseFolders = useCallback(async (courseId: string) => {
    if (!handle) throw new Error('מסד הנתונים טרם נטען.')
    const course = db.courses.find(c => c.id === courseId)
    if (!course) throw new Error('קורס לא נמצא.')
    const ids = await withToken(t => ensureCourseFolders(t, handle.folderId, course))
    const pathStr = pathForCourse(course).join('/')
    mutate(d => ({
      ...d,
      courses: d.courses.map(c =>
        c.id === courseId
          ? { ...c, drive_folder_ids: ids, drive_folder_path: pathStr }
          : c,
      ),
    }))
  }, [handle, db.courses, withToken, mutate])

  const syncAllCourseFolders = useCallback(async (
    onProgress?: (done: number, total: number, title: string) => void,
  ) => {
    if (!handle) throw new Error('מסד הנתונים טרם נטען. רענן את הדף ונסה שוב.')
    const smartDeskId = handle.folderId
    const current = db.courses
    const total = current.length
    if (total === 0) throw new Error('אין קורסים ליצור להם תיקיות.')

    console.info('[syncAllCourseFolders] starting for', total, 'courses; TEEPO folder id:', smartDeskId)

    let done = 0
    let created = 0
    let skipped = 0
    let failed = 0
    let firstError: Error | null = null

    const updates = new Map<string, { ids: ReturnType<typeof Object>; path: string }>()
    const cache = new Map<string, string>()

    for (const course of current) {
      const currentPath = pathForCourse(course).join('/')
      if (course.drive_folder_ids && course.drive_folder_path === currentPath) {
        skipped++
        done++
        onProgress?.(done, total, course.title)
        continue
      }
      try {
        const ids = await withToken(t =>
          ensureCourseFolders(t, smartDeskId, course, cache),
        )
        updates.set(course.id, { ids, path: currentPath })
        created++
        console.info(`[syncAllCourseFolders] ✓ ${course.title} → ${currentPath}`)
      } catch (e: any) {
        console.error(`[syncAllCourseFolders] ✗ ${course.title}:`, e)
        if (!firstError) firstError = e instanceof Error ? e : new Error(String(e))
        failed++
      }
      done++
      onProgress?.(done, total, course.title)
    }

    if (updates.size > 0) {
      mutate(d => ({
        ...d,
        courses: d.courses.map(c => {
          const u = updates.get(c.id)
          if (!u) return c
          return { ...c, drive_folder_ids: u.ids as Course['drive_folder_ids'], drive_folder_path: u.path }
        }),
      }))
    }

    // If nothing worked at all, surface the real error so the UI can show it.
    if (created === 0 && failed > 0 && firstError) {
      throw new Error(
        `כל יצירות התיקיות נכשלו (${failed}/${total}). שגיאה ראשונה: ${firstError.message}`,
      )
    }

    return { created, skipped, failed }
  }, [handle, db.courses, withToken, mutate])

  // ── TEEPO Exam ─────────────────────────────────────────────
  const upsertExam = useCallback(async (exam: Exam) => {
    mutate(d => {
      const existing = d.exams ?? []
      const without = existing.filter(e => e.id !== exam.id)
      return { ...d, exams: [exam, ...without] }
    })
  }, [mutate])

  const removeExam = useCallback(async (id: string) => {
    mutate(d => ({
      ...d,
      exams: (d.exams ?? []).filter(e => e.id !== id),
      study_plans: (d.study_plans ?? []).filter(p => p.exam_id !== id),
    }))
  }, [mutate])

  const upsertStudyPlan = useCallback(async (plan: StudyPlan) => {
    mutate(d => {
      const existing = d.study_plans ?? []
      const without = existing.filter(p => p.id !== plan.id)
      return { ...d, study_plans: [plan, ...without] }
    })
  }, [mutate])

  const removeStudyPlan = useCallback(async (id: string) => {
    mutate(d => ({
      ...d,
      study_plans: (d.study_plans ?? []).filter(p => p.id !== id),
    }))
  }, [mutate])

  const upsertPracticeSession = useCallback(async (session: PracticeSession) => {
    mutate(d => {
      const existing = d.practice_sessions ?? []
      const without = existing.filter(s => s.id !== session.id)
      return { ...d, practice_sessions: [session, ...without] }
    })
  }, [mutate])

  const upsertFlashcardsImpl = useCallback(async (cards: Flashcard[]) => {
    mutate(d => {
      const byId = new Map<string, Flashcard>()
      for (const c of d.flashcards ?? []) byId.set(c.id, c)
      for (const c of cards) byId.set(c.id, c)
      return { ...d, flashcards: Array.from(byId.values()) }
    })
  }, [mutate])

  const upsertSimulation = useCallback(async (sim: Simulation) => {
    mutate(d => {
      const existing = d.simulations ?? []
      const without = existing.filter(s => s.id !== sim.id)
      return { ...d, simulations: [sim, ...without] }
    })
  }, [mutate])

  const appendPointEvent = useCallback(async (event: PointEvent) => {
    mutate(d => ({ ...d, point_events: [event, ...(d.point_events ?? [])] }))
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
    updateSettings, replaceCourses,
    setStudentProfile, upsertStudentCourse, upsertStudentCoursesBulk, removeStudentCourse,
    syncCourseFolders, syncAllCourseFolders,
    upsertExam, removeExam,
    upsertStudyPlan, removeStudyPlan,
    upsertPracticeSession,
    upsertFlashcards: upsertFlashcardsImpl,
    upsertSimulation,
    appendPointEvent,
  }), [
    db, ready, loading, error, driveConnected, driveMissing, reload,
    createCourse, updateCourse, deleteCourse,
    createLesson, updateLesson, deleteLesson,
    createTask, updateTask, deleteTask,
    createAssignment, updateAssignment, deleteAssignment,
    createNote, updateNote, deleteNote,
    updateSettings, replaceCourses,
    setStudentProfile, upsertStudentCourse, upsertStudentCoursesBulk, removeStudentCourse,
    syncCourseFolders, syncAllCourseFolders,
    upsertExam, removeExam,
    upsertStudyPlan, removeStudyPlan,
    upsertPracticeSession, upsertFlashcardsImpl, upsertSimulation,
    appendPointEvent,
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
