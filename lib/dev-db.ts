/**
 * Dev-bypass local database.
 *
 * When the dev auth bypass is on (see lib/dev-auth-bypass.ts) there is no
 * real Google token, so the Drive db.json is unreachable. Instead of every
 * page dead-ending on "Drive לא מחובר", the DB context loads this
 * localStorage-backed DriveDB seeded with realistic demo data — so the whole
 * app is browsable and CRUD actually works (and persists across reloads)
 * without signing in.
 *
 * Prod-safe by construction: only reached behind isDevAuthBypassEnabled(),
 * which is a hard no-op when NODE_ENV === 'production'.
 */

import { DriveDB, EMPTY_DB, CURRENT_DB_VERSION } from './drive-db'
import type { Assignment, Course, StudentCourse, StudyTask } from '@/types'

const KEY = 'teepo_dev_db_v1'
const DEV_USER = '00000000-0000-0000-0000-000000000dev'

/** ISO date string N days from now (date-only, local midnight). */
function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  d.setHours(12, 0, 0, 0)
  return d.toISOString()
}

function nowIso(): string {
  return new Date().toISOString()
}

/** Build the seeded demo DB. Dates are relative to "today" so the todo
 *  buckets (היום / השבוע / בהמשך) and assignment deadlines always look alive. */
export function seedDevDB(): DriveDB {
  const courses: Course[] = [
    {
      id: 'dev-course-linalg', user_id: DEV_USER, title: 'אלגברה לינארית 1',
      source: 'bgu', progress_percentage: 45, status: 'active', created_at: nowIso(),
      semester: 'א', academic_year: '2025', year_of_study: 2,
      lecturer_name: 'פרופ׳ רות כהן', credits: 5,
    },
    {
      id: 'dev-course-intro-cs', user_id: DEV_USER, title: 'מבוא למדעי המחשב',
      source: 'bgu', progress_percentage: 70, status: 'active', created_at: nowIso(),
      semester: 'א', academic_year: '2025', year_of_study: 2,
      lecturer_name: 'ד״ר יואב לוי', credits: 5,
    },
    {
      id: 'dev-course-infi', user_id: DEV_USER, title: 'חשבון אינפיניטסימלי 1',
      source: 'bgu', progress_percentage: 30, status: 'active', created_at: nowIso(),
      semester: 'א', academic_year: '2025', year_of_study: 2,
      lecturer_name: 'ד״ר מיכל ברק', credits: 6,
    },
    {
      id: 'dev-course-datastruct', user_id: DEV_USER, title: 'מבני נתונים',
      source: 'bgu', progress_percentage: 15, status: 'active', created_at: nowIso(),
      semester: 'ב', academic_year: '2025', year_of_study: 2,
      lecturer_name: 'פרופ׳ אבי שמיר', credits: 5,
    },
  ]

  const tasks: StudyTask[] = [
    {
      id: 'dev-task-1', user_id: DEV_USER, title: 'לסכם הרצאה 7 באלגברה',
      course_id: 'dev-course-linalg', scheduled_date: daysFromNow(0),
      category: 'study', is_completed: false, created_at: nowIso(),
    },
    {
      id: 'dev-task-2', user_id: DEV_USER, title: 'לפתור 5 תרגילים באינפי',
      course_id: 'dev-course-infi', scheduled_date: daysFromNow(0),
      category: 'practice', is_completed: false, created_at: nowIso(),
    },
    {
      id: 'dev-task-3', user_id: DEV_USER, title: 'לחזור על מיונים לקראת הבוחן',
      course_id: 'dev-course-datastruct', scheduled_date: daysFromNow(3),
      category: 'review', is_completed: false, created_at: nowIso(),
    },
    {
      id: 'dev-task-4', user_id: DEV_USER, title: 'להירשם למועד א׳',
      scheduled_date: daysFromNow(5), category: 'study',
      is_completed: false, created_at: nowIso(),
    },
    {
      id: 'dev-task-5', user_id: DEV_USER, title: 'לקרוא את פרק 4 בספר הקורס',
      course_id: 'dev-course-intro-cs', scheduled_date: daysFromNow(10),
      category: 'study', is_completed: false, created_at: nowIso(),
    },
    {
      id: 'dev-task-6', user_id: DEV_USER, title: 'להגיש דו״ח מעבדה',
      course_id: 'dev-course-intro-cs', scheduled_date: daysFromNow(0),
      category: 'project', is_completed: true, completed_at: nowIso(), created_at: nowIso(),
    },
  ]

  const assignments: Assignment[] = [
    {
      id: 'dev-asn-1', user_id: DEV_USER, course_id: 'dev-course-datastruct',
      title: 'תרגיל בית 3 — רשימות מקושרות', status: 'in_progress', priority: 'high',
      deadline: daysFromNow(2),
      description: 'מימוש רשימה מקושרת כפולה + ניתוח סיבוכיות.',
      assignment_tasks: [
        { id: 'dev-asn-1-t1', assignment_id: 'dev-asn-1', title: 'מימוש insert/delete', order_index: 0, is_completed: true },
        { id: 'dev-asn-1-t2', assignment_id: 'dev-asn-1', title: 'ניתוח סיבוכיות', order_index: 1, is_completed: false },
      ],
    },
    {
      id: 'dev-asn-2', user_id: DEV_USER, course_id: 'dev-course-linalg',
      title: 'גיליון תרגילים 6 — מרחבים וקטוריים', status: 'todo', priority: 'medium',
      deadline: daysFromNow(5),
    },
    {
      id: 'dev-asn-3', user_id: DEV_USER, course_id: 'dev-course-infi',
      title: 'עבודה להגשה — גבולות ורציפות', status: 'todo', priority: 'low',
      deadline: daysFromNow(12),
    },
    {
      id: 'dev-asn-4', user_id: DEV_USER, course_id: 'dev-course-intro-cs',
      title: 'פרויקט סיום — משחק חיים', status: 'submitted', priority: 'high',
      deadline: daysFromNow(-3),
    },
  ]

  const student_courses: StudentCourse[] = [
    { id: 'dev-sc-1', course_id: 'manual_1', course_name: 'מבוא ללוגיקה', credits: 4, status: 'completed', grade: 92, semester: 'א', academic_year: '2024', source: 'manual', updated_at: nowIso() },
    { id: 'dev-sc-2', course_id: 'manual_2', course_name: 'מתמטיקה דיסקרטית', credits: 5, status: 'completed', grade: 85, semester: 'א', academic_year: '2024', source: 'manual', updated_at: nowIso() },
    { id: 'dev-sc-3', course_id: 'manual_3', course_name: 'מבוא לתכנות', credits: 5, status: 'completed', grade: 88, semester: 'ב', academic_year: '2024', source: 'manual', updated_at: nowIso() },
    { id: 'dev-sc-4', course_id: 'manual_4', course_name: 'אלגברה לינארית 1', credits: 5, status: 'in_progress', semester: 'א', academic_year: '2025', source: 'manual', updated_at: nowIso() },
    { id: 'dev-sc-5', course_id: 'manual_5', course_name: 'חשבון אינפיניטסימלי 1', credits: 6, status: 'in_progress', semester: 'א', academic_year: '2025', source: 'manual', updated_at: nowIso() },
  ]

  return {
    ...EMPTY_DB,
    version: CURRENT_DB_VERSION,
    updated_at: nowIso(),
    courses,
    tasks,
    assignments,
    student_courses,
    settings: {
      university: 'bgu',
      setup_seen: true,
      display_name: 'דניאל',
      degree_name: 'מדעי המחשב',
      degree_start_year: 2024,
      degree_start_month: 10,
      theme: 'light',
    },
  }
}

/** Load the dev DB from localStorage; seed it on first run (or corrupt data). */
export function loadDevDB(): DriveDB {
  if (typeof window === 'undefined') return seedDevDB()
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as DriveDB
      if (parsed && Array.isArray(parsed.courses)) {
        return { ...EMPTY_DB, ...parsed }
      }
    }
  } catch { /* corrupt → reseed */ }
  const seeded = seedDevDB()
  saveDevDB(seeded)
  return seeded
}

export function saveDevDB(db: DriveDB): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...db, updated_at: nowIso() }))
  } catch { /* quota — non-fatal in dev */ }
}

/** Reset = wipe + fresh seed. Used by resetAccountData under the bypass. */
export function resetDevDB(): DriveDB {
  if (typeof window !== 'undefined') {
    try { window.localStorage.removeItem(KEY) } catch {}
  }
  const seeded = seedDevDB()
  saveDevDB(seeded)
  return seeded
}
