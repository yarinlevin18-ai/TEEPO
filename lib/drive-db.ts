/**
 * Drive DB — Per-user database stored in the user's own Google Drive.
 *
 * Uses the `drive.file` OAuth scope (app-created files only), so SmartDesk can
 * only see files it creates. All user data lives in a single JSON blob inside
 * a `SmartDesk/` folder in the user's Drive — no shared backend database.
 *
 * Layout:
 *   SmartDesk/
 *     db.json        ← single source of truth (courses, lessons, tasks, ...)
 *
 * The whole DB is small enough to round-trip as one JSON file. If it grows
 * huge later, we can shard per-course.
 */
import type { Course, Lesson, StudyTask, Assignment, CourseNote, UserSettings } from '@/types'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_NAME = 'SmartDesk'
const DB_FILE_NAME = 'db.json'

// ── Student catalog (credits tracking) ────────────────────────────
// These live in the per-user Drive DB now. The backend was supposed to
// host them in Supabase, but the FK to bgu_tracks (which is empty) makes
// saves fail with 500. Keeping this in Drive aligns with "Supabase is
// auth-only" and makes the feature work offline too.
export interface StudentProfile {
  track_id: string
  start_year: number
  current_year: number
  expected_end?: number
  updated_at: string
}

export interface StudentCourse {
  /** Internal row id — unique per DB entry */
  id: string
  /** Catalog course_id (e.g. "68110279") or synthesized "manual_<ts>" */
  course_id: string
  course_name: string
  credits: number
  status: 'completed' | 'in_progress' | 'planned'
  grade?: number
  semester?: string
  academic_year?: string
  source: 'manual' | 'catalog' | 'moodle'
  updated_at: string
}

export interface DriveDB {
  version: number
  updated_at: string
  courses: Course[]
  lessons: Lesson[]
  tasks: StudyTask[]
  assignments: Assignment[]
  notes: CourseNote[]
  settings?: UserSettings
  /** Student academic profile (track + year). Optional — missing = not onboarded. */
  student_profile?: StudentProfile
  /** Courses the student has taken / is taking / plans to take, for credits tracking. */
  student_courses?: StudentCourse[]
}

export const EMPTY_DB: DriveDB = {
  version: 1,
  updated_at: new Date(0).toISOString(),
  courses: [],
  lessons: [],
  tasks: [],
  assignments: [],
  notes: [],
  settings: {},
  student_courses: [],
}

// ── Drive REST helpers ────────────────────────────────────────

export class DriveScopeError extends Error {
  reason: 'scope_missing' | 'api_disabled' | 'token_invalid' | 'unknown'
  googleMessage?: string
  constructor(
    reason: 'scope_missing' | 'api_disabled' | 'token_invalid' | 'unknown',
    googleMessage?: string,
  ) {
    const hebrew =
      reason === 'api_disabled'
        ? 'Google Drive API לא מופעל בפרויקט Cloud המחובר. יש להפעיל אותו ב-Google Cloud Console.'
        : reason === 'token_invalid'
        ? 'ההתחברות ל-Google פגה. לחץ "התחבר מחדש ל-Google".'
        : reason === 'scope_missing'
        ? 'הרשאת drive.file לא ניתנה. לחץ "התחבר מחדש ל-Google" ואשר את ההרשאות בעת ההתחברות.'
        : 'הגישה ל-Google Drive נחסמה. לחץ "התחבר מחדש ל-Google".'
    super(hebrew)
    this.name = 'DriveScopeError'
    this.reason = reason
    this.googleMessage = googleMessage
  }
}

/** Classify a Google 401/403 body into something actionable. */
function classify403(status: number, body: string): DriveScopeError {
  const lower = body.toLowerCase()
  if (status === 401) {
    return new DriveScopeError('token_invalid', body)
  }
  if (/drive.*api.*(not|hasn).*(been )?used|drive api has not been enabled|accessnotconfigured/i.test(body)) {
    return new DriveScopeError('api_disabled', body)
  }
  if (/insufficient.*scope|access_token_scope_insufficient|insufficientpermissions|scope/i.test(lower)) {
    return new DriveScopeError('scope_missing', body)
  }
  return new DriveScopeError('unknown', body)
}

async function driveFetch(
  token: string,
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  })
  if (res.status === 401 || res.status === 403) {
    let body = ''
    try { body = await res.clone().text() } catch {}
    // Log the exact Google response so we can diagnose (scope vs API-disabled vs other)
    if (typeof console !== 'undefined') {
      console.error('[drive-db] Google returned', res.status, 'for', url, '\nbody:', body)
    }
    throw classify403(res.status, body)
  }
  return res
}

/**
 * Probe the current access token at Google's tokeninfo endpoint so we can see
 * exactly which scopes were granted. Useful for diagnosing 403s without
 * needing a real Drive call.
 */
export async function probeTokenScopes(token: string): Promise<{
  scopes: string[]
  hasDriveFile: boolean
  expiresIn: number | null
  error?: string
}> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
    )
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { scopes: [], hasDriveFile: false, expiresIn: null, error: data?.error_description || data?.error || `tokeninfo ${res.status}` }
    }
    const scopes: string[] = typeof data.scope === 'string' ? data.scope.split(' ') : []
    return {
      scopes,
      hasDriveFile: scopes.includes('https://www.googleapis.com/auth/drive.file'),
      expiresIn: data.expires_in ? Number(data.expires_in) : null,
    }
  } catch (e: any) {
    return { scopes: [], hasDriveFile: false, expiresIn: null, error: e?.message || 'probe failed' }
  }
}

/** Find a file/folder by exact name within an optional parent. Returns the first match. */
async function findByName(
  token: string,
  name: string,
  mimeType?: string,
  parentId?: string,
): Promise<{ id: string; name: string } | null> {
  const q: string[] = [`name = '${name.replace(/'/g, "\\'")}'`, 'trashed = false']
  if (mimeType) q.push(`mimeType = '${mimeType}'`)
  if (parentId) q.push(`'${parentId}' in parents`)

  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q.join(' and '))}&fields=files(id,name)&spaces=drive`
  const res = await driveFetch(token, url)
  if (!res.ok) throw new Error(`Drive search failed: ${res.status}`)
  const data = await res.json()
  return data.files?.[0] ?? null
}

/** Get or create the SmartDesk/ folder in the user's Drive root. Returns folder id. */
export async function getOrCreateSmartDeskFolder(token: string): Promise<string> {
  const existing = await findByName(token, FOLDER_NAME, 'application/vnd.google-apps.folder')
  if (existing) return existing.id

  const res = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  if (!res.ok) throw new Error(`Failed to create SmartDesk folder: ${res.status}`)
  const data = await res.json()
  return data.id
}

/** Get the db.json fileId inside the SmartDesk folder, or null if not yet created. */
async function findDBFile(token: string, folderId: string): Promise<string | null> {
  const file = await findByName(token, DB_FILE_NAME, 'application/json', folderId)
  return file?.id ?? null
}

/** Create db.json with an initial empty DB. Returns fileId. */
async function createDBFile(
  token: string,
  folderId: string,
  db: DriveDB,
): Promise<string> {
  // Use multipart upload: metadata + content in one request
  const boundary = 'smartdesk-' + Math.random().toString(36).slice(2)
  const metadata = {
    name: DB_FILE_NAME,
    mimeType: 'application/json',
    parents: [folderId],
  }
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${JSON.stringify(db)}\r\n` +
    `--${boundary}--`

  const res = await driveFetch(token, `${DRIVE_UPLOAD}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  })
  if (!res.ok) throw new Error(`Failed to create db.json: ${res.status}`)
  const data = await res.json()
  return data.id
}

/** Overwrite db.json contents. */
async function updateDBFile(
  token: string,
  fileId: string,
  db: DriveDB,
): Promise<void> {
  const res = await driveFetch(
    token,
    `${DRIVE_UPLOAD}/files/${fileId}?uploadType=media`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(db),
    },
  )
  if (!res.ok) throw new Error(`Failed to update db.json: ${res.status}`)
}

/** Read db.json contents. */
async function readDBFile(token: string, fileId: string): Promise<DriveDB> {
  const res = await driveFetch(
    token,
    `${DRIVE_API}/files/${fileId}?alt=media`,
  )
  if (!res.ok) throw new Error(`Failed to read db.json: ${res.status}`)
  const data = await res.json()
  return { ...EMPTY_DB, ...data }
}

// ── Public API ────────────────────────────────────────────────

export interface DriveDBHandle {
  folderId: string
  fileId: string
}

/**
 * Initialise the Drive DB: ensures the folder + db.json exist, and returns
 * both the current contents and a handle to update them.
 */
export async function loadDB(
  token: string,
): Promise<{ db: DriveDB; handle: DriveDBHandle }> {
  const folderId = await getOrCreateSmartDeskFolder(token)
  let fileId = await findDBFile(token, folderId)
  let db: DriveDB

  if (!fileId) {
    db = { ...EMPTY_DB, updated_at: new Date().toISOString() }
    fileId = await createDBFile(token, folderId, db)
  } else {
    db = await readDBFile(token, fileId)
  }

  return { db, handle: { folderId, fileId } }
}

/** Persist a new DB snapshot. */
export async function saveDB(
  token: string,
  handle: DriveDBHandle,
  db: DriveDB,
): Promise<DriveDB> {
  const next: DriveDB = { ...db, updated_at: new Date().toISOString() }
  await updateDBFile(token, handle.fileId, next)
  return next
}

/** Generate a stable-ish id for new records. */
export function newId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
