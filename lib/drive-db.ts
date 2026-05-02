/**
 * Drive DB — Per-user database stored in the user's own Google Drive.
 *
 * Uses the `drive.file` OAuth scope (app-created files only), so TEEPO can
 * only see files it creates. All user data lives in a single JSON blob inside
 * a `TEEPO/` folder in the user's Drive — no shared backend database.
 *
 * Layout:
 *   TEEPO/
 *     db.json        ← single source of truth (courses, lessons, tasks, ...)
 *
 * The whole DB is small enough to round-trip as one JSON file. If it grows
 * huge later, we can shard per-course.
 */
import type {
  Course,
  Lesson,
  StudyTask,
  Assignment,
  CourseNote,
  UserSettings,
  StudentProfile,
  StudentCourse,
  Exam,
  StudyPlan,
  PracticeSession,
  Flashcard,
  Simulation,
} from '@/types'

// Re-export for backward compat — existing callers import these from
// `lib/drive-db`. The canonical home is now `types/index.ts`.
export type { StudentProfile, StudentCourse } from '@/types'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const FOLDER_NAME = 'TEEPO'
const DB_FILE_NAME = 'db.json'

/**
 * Drive DB schema version. Bump when we change the shape in a way that
 * needs a migration. `migrateDB()` knows how to upgrade older versions.
 *
 * v1 — initial release.
 * v2 — TEEPO v2.1 fields landed (Grade.source/component/updated_at,
 *      Course.lecturer_email/syllabus_url/teaching_assistants/course_links/
 *      portal_metadata, UserSettings.university/theme). All optional, so
 *      v1 data is structurally valid v2 — the migration just bumps the marker.
 *
 * v3 — TEEPO Exam additions (spec §7.2): exams, study_plans, practice_sessions,
 *      flashcards, simulations, exam_group_memberships. Pure additive — old
 *      data is structurally valid v3, the migration just initializes empty
 *      arrays for the new fields.
 */
export const CURRENT_DB_VERSION = 3

/** How long to wait after the last edit before persisting to Drive. */
export const SAVE_DEBOUNCE_MS = 30_000

// ── Student catalog (credits tracking) ────────────────────────────
// `StudentProfile` and `StudentCourse` live in `types/index.ts` now (v2.1).
// They're re-exported above so existing callers that import them from
// `lib/drive-db` keep working. New code should import from `@/types`.
//
// These live in the per-user Drive DB. The backend was supposed to host
// them in Supabase, but the FK to bgu_tracks (which is empty) made saves
// fail with 500. Keeping this in Drive aligns with "Supabase is auth-only"
// and makes the feature work offline too.

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
  // ── TEEPO Exam (spec §7.2). All optional so v1/v2 data is forward-compatible.
  exams?: Exam[]
  study_plans?: StudyPlan[]
  practice_sessions?: PracticeSession[]
  flashcards?: Flashcard[]
  simulations?: Simulation[]
  exam_group_memberships?: Array<{ group_id: string; joined_at: string }>
  /**
   * Append-only point ledger. Totals (global + per-exam) are derived from this
   * array. Adding optional — no version bump needed; absence means zero points.
   */
  point_events?: import('./exam/points').PointEvent[]
}

export const EMPTY_DB: DriveDB = {
  version: CURRENT_DB_VERSION,
  updated_at: new Date(0).toISOString(),
  courses: [],
  lessons: [],
  tasks: [],
  assignments: [],
  notes: [],
  settings: {},
  student_courses: [],
  exams: [],
  study_plans: [],
  practice_sessions: [],
  flashcards: [],
  simulations: [],
  exam_group_memberships: [],
  point_events: [],
}

// ── Migrations ────────────────────────────────────────────────

/**
 * Upgrade an older DriveDB to the current shape. Idempotent — calling on a
 * v2 DB returns the same DB (just spread, no mutation).
 *
 * Returning a NEW object (even when no fields change) lets callers compare
 * by reference to know whether to persist the migrated version.
 */
export function migrateDB(db: DriveDB): DriveDB {
  let next = db
  if ((next.version ?? 1) < 2) {
    next = migrateV1ToV2(next)
  }
  if ((next.version ?? 1) < 3) {
    next = migrateV2ToV3(next)
  }
  return next
}

/**
 * v1 → v2.
 *
 * v2 only added optional fields, so no existing data is reshaped. The job is
 * just to mark the DB as v2 so future code paths can rely on the version.
 */
function migrateV1ToV2(db: DriveDB): DriveDB {
  return { ...db, version: 2 }
}

/**
 * v2 → v3.
 *
 * v3 adds the TEEPO Exam fields. All new fields are optional arrays — initialize
 * them to empty so consumers don't have to check for undefined.
 */
function migrateV2ToV3(db: DriveDB): DriveDB {
  return {
    ...db,
    version: 3,
    exams: db.exams ?? [],
    study_plans: db.study_plans ?? [],
    practice_sessions: db.practice_sessions ?? [],
    flashcards: db.flashcards ?? [],
    simulations: db.simulations ?? [],
    exam_group_memberships: db.exam_group_memberships ?? [],
  }
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

/** Get or create the TEEPO/ folder in the user's Drive root. Returns folder id. */
export async function getOrCreateTEEPOFolder(token: string): Promise<string> {
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
  if (!res.ok) throw new Error(`Failed to create TEEPO folder: ${res.status}`)
  const data = await res.json()
  return data.id
}

/** Get the db.json fileId inside the TEEPO folder, or null if not yet created. */
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
 *
 * If the loaded DB is older than `CURRENT_DB_VERSION`, it runs the migrations
 * and persists the upgrade back to Drive (one extra write at first load).
 */
export async function loadDB(
  token: string,
): Promise<{ db: DriveDB; handle: DriveDBHandle; migrated: boolean }> {
  const folderId = await getOrCreateTEEPOFolder(token)
  let fileId = await findDBFile(token, folderId)
  let db: DriveDB
  let migrated = false

  if (!fileId) {
    db = { ...EMPTY_DB, updated_at: new Date().toISOString() }
    fileId = await createDBFile(token, folderId, db)
  } else {
    const raw = await readDBFile(token, fileId)
    const upgraded = migrateDB(raw)
    if ((upgraded.version ?? 1) !== (raw.version ?? 1)) {
      // Schema bumped — persist so future loads skip the migration.
      await updateDBFile(token, fileId, upgraded)
      migrated = true
    }
    db = upgraded
  }

  return { db, handle: { folderId, fileId }, migrated }
}

/**
 * Persist a new DB snapshot to Drive immediately.
 *
 * Most callers should prefer `saveDBDebounced` — it batches rapid edits into
 * one Drive write, which keeps us well clear of API quotas. Use this direct
 * version only when you need confirmed persistence right now (sign-out,
 * critical migrations, error recovery).
 */
export async function saveDB(
  token: string,
  handle: DriveDBHandle,
  db: DriveDB,
): Promise<DriveDB> {
  const next: DriveDB = { ...db, updated_at: new Date().toISOString() }
  await updateDBFile(token, handle.fileId, next)
  return next
}

// ── Debounced save ────────────────────────────────────────────
//
// We keep a single pending save in module-level state. Multiple `saveDBDebounced`
// calls in a 30-second window collapse into ONE Drive write — the latest DB
// snapshot wins, all callers' Promises resolve when that single write lands.
//
// Why module-level (not React) state: Drive writes are inherently global per
// user. Bouncing through React adds remount-flush bugs without buying anything.
// Code outside React (workers, signOut handlers) can also use the same queue.

interface PendingSave {
  handle: DriveDBHandle
  db: DriveDB
  /** All callers waiting for this batch to flush. */
  waiters: Array<{
    resolve: (v: DriveDB) => void
    reject: (e: unknown) => void
  }>
}

let pendingSave: PendingSave | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Schedule a save 30 seconds from now (sliding window). Calling again before
 * the timer fires updates the pending state and resets the timer. The returned
 * Promise resolves when the eventual single Drive write completes.
 *
 * The token is captured per-call. If the user signs out or the token expires
 * during the wait, the save fails — caller catches the rejection.
 */
export async function saveDBDebounced(
  token: string,
  handle: DriveDBHandle,
  db: DriveDB,
): Promise<DriveDB> {
  if (saveTimer) clearTimeout(saveTimer)

  return new Promise<DriveDB>((resolve, reject) => {
    if (pendingSave) {
      pendingSave.handle = handle
      pendingSave.db = db
      pendingSave.waiters.push({ resolve, reject })
    } else {
      pendingSave = { handle, db, waiters: [{ resolve, reject }] }
    }

    saveTimer = setTimeout(() => {
      void flushPendingSave(token).catch(() => {
        // Errors are forwarded to each waiter's reject inside flushPendingSave.
      })
    }, SAVE_DEBOUNCE_MS)
  })
}

/**
 * Write any pending save right now and clear the timer. Returns the saved DB,
 * or `null` if there was nothing to save.
 *
 * Call this in critical paths where the 30-second wait isn't acceptable:
 *   - tab close / `beforeunload`
 *   - sign-out
 *   - explicit "save now" UI
 */
export async function flushPendingSave(
  token: string,
): Promise<DriveDB | null> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  if (!pendingSave) return null

  const pending = pendingSave
  pendingSave = null

  try {
    const next = await saveDB(token, pending.handle, pending.db)
    pending.waiters.forEach((w) => w.resolve(next))
    return next
  } catch (e) {
    pending.waiters.forEach((w) => w.reject(e))
    throw e
  }
}

/** True if a debounced save is queued and hasn't fired yet. */
export function hasPendingSave(): boolean {
  return pendingSave !== null
}

/** Generate a stable-ish id for new records. */
export function newId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
