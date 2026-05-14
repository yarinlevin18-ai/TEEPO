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
import { ensureCourseFolders, ensurePath, moveFolder, pathForCourse, sanitizeFolderName } from './drive-folders'
import type {
  Course, Lesson, StudyTask, Assignment, CourseNote, UserSettings,
} from '@/types'

interface DBContextType {
  db: DriveDB
  /** Drive DB handle (folder + file ids). Null until the DB has loaded. Exposed
   *  so feature code that needs to write sibling files (backup snapshots, etc.)
   *  can do so without re-resolving the handle. */
  handle: DriveDBHandle | null
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
  /** Set classification (year_of_study/semester) on a course and MOVE its
   *  Drive folder to the new path (instead of creating a duplicate at the
   *  new path while orphaning the old). If the course has no existing
   *  folder, this falls back to a fresh provision. Marks classified_manually. */
  reclassifyCourse: (
    courseId: string,
    patch: { semester?: Course['semester']; year_of_study?: Course['year_of_study']; academic_year?: string },
  ) => Promise<void>
  /** Force any pending debounced save to flush to Drive RIGHT NOW.
   *  Useful after explicit save actions ("save" buttons) so the user
   *  doesn't lose their change to a tab close inside the 30s window.
   *  No-op if there's nothing pending. */
  flushSave: () => Promise<void>
  /** Destructive: wipe all app-managed state.
   *  - Replaces TEEPO/db.json with an EMPTY_DB.
   *  - If wipeDriveFolders=true, trashes every subfolder inside TEEPO/
   *    (תואר ראשון/, לא מסווגים/, etc.). The folders go to Drive's trash,
   *    so the user can restore for 30 days if they panic. db.json itself
   *    is preserved (only its content is reset).
   *  Returns the count of trashed folders. */
  resetAccountData: (opts?: { wipeDriveFolders?: boolean }) => Promise<{ trashedFolders: number }>
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
      // Optional fields the form might pass through
      ...(input.year_of_study  ? { year_of_study:  input.year_of_study  } : {}),
      ...(input.semester       ? { semester:       input.semester       } : {}),
      ...(input.academic_year  ? { academic_year:  input.academic_year  } : {}),
    } as Course
    mutate(d => ({ ...d, courses: [course, ...d.courses] }))

    // Fire-and-forget: provision the Drive folder hierarchy so the Chrome
    // extension can upload to it without the user clicking "Sync Drive"
    // manually. Errors are swallowed — the user can retry from /courses.
    if (handle) {
      const smartDeskId = handle.folderId
      const path = pathForCourse(course).join('/')
      withToken(t => ensureCourseFolders(t, smartDeskId, course))
        .then(ids => {
          mutate(d => ({
            ...d,
            courses: d.courses.map(c =>
              c.id === course.id ? { ...c, drive_folder_ids: ids, drive_folder_path: path } : c,
            ),
          }))
          console.info('[createCourse] folders ready:', course.title)
        })
        .catch(e => {
          console.warn('[createCourse] folder provision failed for', course.title, e)
        })
    }

    return course
  }, [mutate, user, handle, withToken])

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

  // Forces any debounced save to flush to Drive right now. Returns a Promise
  // that resolves when the write actually lands, so callers can chain UI
  // feedback ("saved!") on real persistence instead of in-memory mutation.
  const flushSave = useCallback(async (): Promise<void> => {
    if (!handle || !hasPendingSave()) return
    try {
      await withToken(t => flushPendingSave(t))
    } catch (e) {
      // Surface to error state so callers can react, but don't throw — the
      // in-memory state is already correct, only the Drive sync failed.
      setError((e as Error)?.message || 'שמירה ל-Drive נכשלה')
    }
  }, [handle, withToken])

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

  const reclassifyCourse = useCallback(async (
    courseId: string,
    patch: { semester?: Course['semester']; year_of_study?: Course['year_of_study']; academic_year?: string },
  ) => {
    if (!handle) throw new Error('מסד הנתונים טרם נטען.')
    const existing = db.courses.find(c => c.id === courseId)
    if (!existing) throw new Error('קורס לא נמצא.')

    // Compose the updated course locally (don't rely on React state catch-up).
    const next: Course = {
      ...existing,
      ...patch,
      classified_manually: true,
    }
    const oldPath = pathForCourse(existing)
    const newPath = pathForCourse(next)
    const samePath = oldPath.join('/') === newPath.join('/')
    const teepoFolderId = handle.folderId
    const existingCourseFolderId = existing.drive_folder_ids?.course

    // Path didn't change AND we already have folders — just persist the
    // classification (no Drive work needed).
    if (samePath && existingCourseFolderId) {
      await mutate(d => ({
        ...d,
        courses: d.courses.map(c => (c.id === courseId ? next : c)),
      }))
      return
    }

    // No existing folder at all → fresh provision at the new path.
    if (!existingCourseFolderId) {
      await mutate(d => ({
        ...d,
        courses: d.courses.map(c => (c.id === courseId ? next : c)),
      }))
      // syncCourseFolders reads from db state, which we just updated.
      await syncCourseFolders(courseId)
      return
    }

    // Existing folder + path changed → MOVE it. This avoids the duplicate
    // empty-folder problem we'd get from just calling ensureCourseFolders
    // again at the new path.
    const cache = new Map<string, string>()
    const parentSegments = newPath.slice(0, -1) // all but the course title
    const courseFolderName = newPath[newPath.length - 1] // sanitized title
    const newParentId = await withToken(t => ensurePath(t, teepoFolderId, parentSegments, cache))
    await withToken(t => moveFolder(t, existingCourseFolderId, newParentId, courseFolderName))

    const newPathStr = newPath.join('/')
    await mutate(d => ({
      ...d,
      courses: d.courses.map(c =>
        c.id === courseId
          ? { ...next, drive_folder_path: newPathStr }
          : c,
      ),
    }))
  }, [handle, db.courses, withToken, mutate, syncCourseFolders])

  // ── Destructive: wipe app data so the user can start fresh ──────────────
  const resetAccountData = useCallback(async (
    opts: { wipeDriveFolders?: boolean } = {},
  ): Promise<{ trashedFolders: number }> => {
    if (!handle) throw new Error('מסד הנתונים טרם נטען.')
    const teepoFolderId = handle.folderId
    let trashed = 0

    // 1. Optionally trash every subfolder inside TEEPO/. We DON'T touch
    //    files (like db.json itself, or user-uploaded stuff sitting at the
    //    TEEPO/ root if any). Drive's trashed=true is soft delete — 30 days
    //    to restore from the trash UI.
    if (opts.wipeDriveFolders) {
      const FOLDER_MIME = 'application/vnd.google-apps.folder'
      const q = [
        `'${teepoFolderId}' in parents`,
        `mimeType = '${FOLDER_MIME}'`,
        'trashed = false',
      ].join(' and ')
      const listUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`
      const listRes = await withToken(t =>
        fetch(listUrl, { headers: { Authorization: `Bearer ${t}` } }),
      )
      if (!listRes.ok) {
        const body = await listRes.text().catch(() => '')
        throw new Error(`רענון תיקיות ב-Drive נכשל (${listRes.status}): ${body.slice(0, 160)}`)
      }
      const { files } = await listRes.json() as { files?: Array<{ id: string; name: string }> }
      for (const f of files ?? []) {
        try {
          const patchRes = await withToken(t =>
            fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
              method: 'PATCH',
              headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ trashed: true }),
            }),
          )
          if (patchRes.ok) trashed++
          else console.warn('[reset] trash failed for', f.name, patchRes.status)
        } catch (e) {
          console.warn('[reset] trash threw for', f.name, e)
        }
      }
    }

    // 2. Overwrite db.json with EMPTY_DB. We flush any pending debounced
    //    save FIRST so it doesn't overwrite us a second later.
    await withToken(t => flushPendingSave(t))
    const fresh: DriveDB = { ...EMPTY_DB, updated_at: new Date().toISOString() }
    await withToken(t => saveDB(t, handle, fresh))

    // 3. Reset in-memory state so the UI shows the wipe immediately,
    //    without waiting for a page reload.
    setDb(fresh)

    return { trashedFolders: trashed }
  }, [handle, withToken])

  const driveConnected = !!googleToken && ready && !error
  const driveMissing = !!user && !googleToken

  const value = useMemo<DBContextType>(() => ({
    db, handle, ready, loading, error, driveConnected, driveMissing, reload,
    createCourse, updateCourse, deleteCourse,
    createLesson, updateLesson, deleteLesson,
    createTask, updateTask, deleteTask,
    createAssignment, updateAssignment, deleteAssignment,
    createNote, updateNote, deleteNote,
    updateSettings, replaceCourses,
    setStudentProfile, upsertStudentCourse, upsertStudentCoursesBulk, removeStudentCourse,
    syncCourseFolders, syncAllCourseFolders, reclassifyCourse, resetAccountData, flushSave,
  }), [
    db, handle, ready, loading, error, driveConnected, driveMissing, reload,
    createCourse, updateCourse, deleteCourse,
    createLesson, updateLesson, deleteLesson,
    createTask, updateTask, deleteTask,
    createAssignment, updateAssignment, deleteAssignment,
    createNote, updateNote, deleteNote,
    updateSettings, replaceCourses,
    setStudentProfile, upsertStudentCourse, upsertStudentCoursesBulk, removeStudentCourse,
    syncCourseFolders, syncAllCourseFolders, reclassifyCourse, resetAccountData, flushSave,
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
