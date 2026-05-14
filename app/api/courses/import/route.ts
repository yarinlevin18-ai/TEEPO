/**
 * POST /api/courses/import
 *
 * Called by the Chrome extension after it scans Moodle's "my courses" page.
 * Body: { courses: [{ title, url, moodle_id, shortname? }, ...] }
 * Auth: Bearer <google_access_token> (same drive.file scope as the rest of
 *       the Drive endpoints).
 *
 * Round-trip:
 *   1. Find TEEPO/db.json in the user's Drive.
 *   2. Download + parse.
 *   3. For each incoming course:
 *        - Match against existing by url || moodle_id || title.
 *        - If new → push with classified_manually=false so the next sync
 *          can refine its semester/year metadata.
 *        - If existing → only overwrite metadata that's not user-edited
 *          (don't clobber a manual semester/year set in /courses).
 *   4. Upload the merged db.json back.
 *
 * Response: { added, updated, skipped, total }
 *
 * Why server-side: writing to db.json from the extension would require
 * the extension to know the file ID + handle Drive's PATCH semantics.
 * Doing the merge here lets the extension stay dumb (POST a list, get a
 * count) and reuses the same Drive request shape we already use for
 * folder-for-course.
 */

import { NextRequest, NextResponse } from 'next/server'
// classifyCourse / computeYearOfStudy were used here for auto-classification
// during import. They were removed at user request — every course now lands
// raw and the user classifies manually on /summaries. The helpers still
// live in lib/semester-classifier for /courses' explicit 'Reclassify all'
// button, just not invoked here anymore.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

interface IncomingCourse {
  title?: string
  url?: string
  moodle_id?: string
  shortname?: string
}

interface CourseRecord {
  id: string
  title: string
  source?: string
  source_url?: string
  shortname?: string
  classified_manually?: boolean
  created_at?: string
  status?: string
  year_of_study?: number
  semester?: 'א' | 'ב' | 'קיץ'
  academic_year?: string
  drive_folder_ids?: { course: string; lessons: string; assignments: string; notes: string }
  drive_folder_path?: string
  [k: string]: unknown
}

// ── Folder-path helpers (mirror lib/drive-folders.ts) ────────────────────
// We inline these so the route doesn't pull in client-typed modules. The
// shape MUST match lib/drive-folders.ts or the same course will end up at
// two different paths depending on which code created it.

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const DEGREE_FOLDER_NAME = 'תואר ראשון'
const UNCLASSIFIED_FOLDER = 'לא מסווגים'
const COURSE_SUBFOLDERS = ['שיעורים', 'מטלות', 'סיכומים'] as const

const YEAR_LABEL: Record<number, string> = {
  1: 'שנה א׳', 2: 'שנה ב׳', 3: 'שנה ג׳', 4: 'שנה ד׳',
}
const SEM_LABEL: Record<'א' | 'ב' | 'קיץ', string> = {
  'א': 'סמסטר א׳', 'ב': 'סמסטר ב׳', 'קיץ': 'קיץ',
}

function sanitizeFolderName(name: string): string {
  return name.replace(/[/\\]/g, '-').trim().slice(0, 200) || 'קורס ללא שם'
}

function pathForCourseRecord(c: CourseRecord): string[] {
  const title = sanitizeFolderName(c.title)
  if (!c.year_of_study && !c.semester) return [UNCLASSIFIED_FOLDER, title]
  const parts = [DEGREE_FOLDER_NAME]
  parts.push(c.year_of_study && YEAR_LABEL[c.year_of_study] ? YEAR_LABEL[c.year_of_study] : 'ללא שנה')
  parts.push(c.semester && SEM_LABEL[c.semester] ? SEM_LABEL[c.semester] : 'ללא סמסטר')
  parts.push(title)
  return parts
}

async function findChildFolder(token: string, name: string, parentId: string): Promise<string | null> {
  const safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const q = `name = '${safe}' and mimeType = '${FOLDER_MIME}' and '${parentId}' in parents and trashed = false`
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive`
  const res = await driveFetch(token, url)
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

async function createChildFolder(token: string, name: string, parentId: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`drive_${res.status}: ${body.slice(0, 160)}`)
  }
  const data = await res.json()
  if (!data.id) throw new Error('drive_500: createChildFolder returned no id')
  return data.id as string
}

async function ensureChildFolder(
  token: string, name: string, parentId: string, cache: Map<string, string>,
): Promise<string> {
  const key = `${parentId}::${name}`
  const hit = cache.get(key)
  if (hit) return hit
  let id = await findChildFolder(token, name, parentId)
  if (!id) id = await createChildFolder(token, name, parentId)
  cache.set(key, id)
  return id
}

async function ensureCourseFolders(
  token: string, teepoFolderId: string, course: CourseRecord, cache: Map<string, string>,
): Promise<{ course: string; lessons: string; assignments: string; notes: string }> {
  let parent = teepoFolderId
  for (const segment of pathForCourseRecord(course)) {
    parent = await ensureChildFolder(token, segment, parent, cache)
  }
  const courseFolder = parent
  const [lessons, assignments, notes] = await Promise.all(
    COURSE_SUBFOLDERS.map((s) => ensureChildFolder(token, s, courseFolder, cache)),
  )
  return { course: courseFolder, lessons, assignments, notes }
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders() })
  }
  const token = authHeader.slice(7).trim()
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders() })
  }

  let body: { courses?: IncomingCourse[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400, headers: corsHeaders() })
  }
  const incoming = Array.isArray(body?.courses) ? body!.courses! : []
  if (incoming.length === 0) {
    return NextResponse.json(
      { added: 0, updated: 0, skipped: 0, total: 0 },
      { headers: corsHeaders() },
    )
  }

  try {
    const { folderId, dbFileId, db } = await loadDriveDB(token)

    const courses: CourseRecord[] = Array.isArray(db.courses) ? db.courses : []
    let added = 0
    let updated = 0
    let skipped = 0
    const needsFolders: CourseRecord[] = []

    // Auto-classification on import was removed per user request: every
    // course now lands raw, and the user assigns שנה / סמסטר manually on
    // /summaries (single-course widget or bulk classify). The classifier
    // function (classifyCourse) is still imported by /courses for the
    // explicit 'Reclassify all' button — just not run silently here.

    for (const inc of incoming) {
      const title = (inc.title ?? '').trim()
      if (!title) { skipped++; continue }

      // Match preference: source_url > moodle_id > exact title.
      const idx = courses.findIndex((c) => {
        if (inc.url && c.source_url === inc.url) return true
        if (inc.moodle_id && (c as any).moodle_id === inc.moodle_id) return true
        return c.title?.trim() === title
      })

      if (idx === -1) {
        // New course. ID format mirrors the client's newId('course') so
        // the rest of the app can't tell whether it came from here or the
        // /courses page.
        //
        // IMPORTANT: we no longer pre-create Drive folders here. The user's
        // mental model is "import gives me a list, I classify it, THEN
        // folders get made" — eager creation produced a pile of folders
        // under לא מסווגים/ that the user then had to manually clean up.
        // /summaries now exposes a 'צור תיקיות ב-Drive' button to do this
        // explicitly once classification is done.
        const newCourse: CourseRecord = {
          id: `course_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
          title,
          source: 'bgu',
          source_url: inc.url,
          shortname: inc.shortname,
          status: 'active',
          classified_manually: false,
          created_at: new Date().toISOString(),
          ...(inc.moodle_id ? { moodle_id: inc.moodle_id } : {}),
        }
        courses.unshift(newCourse)
        added++
      } else {
        // Existing — merge metadata without overwriting user edits.
        const existing = courses[idx]
        const merged: CourseRecord = { ...existing }
        if (!existing.source_url && inc.url) merged.source_url = inc.url
        if (!existing.shortname && inc.shortname) merged.shortname = inc.shortname
        if (inc.moodle_id && !(existing as any).moodle_id) (merged as any).moodle_id = inc.moodle_id
        if (!existing.source) merged.source = 'bgu'
        // Only count as updated if at least one field actually changed.
        if (JSON.stringify(merged) !== JSON.stringify(existing)) {
          courses[idx] = merged
          updated++
        } else {
          skipped++
        }
        // ONLY case where we re-provision during import: the course already
        // had folders at some path, and either (a) classification just moved
        // the target path so the old folders are now orphans, or (b) the
        // folders went missing in Drive (caught by the existence check below).
        // Folder-less courses are left alone — the /summaries button handles
        // initial creation now.
        if (existing.drive_folder_ids) {
          const currentPath = pathForCourseRecord(courses[idx]).join('/')
          const stalePath = existing.drive_folder_path && existing.drive_folder_path !== currentPath
          if (stalePath) needsFolders.push(courses[idx])
        }
      }
    }

    // Defensive existence check: any course that *thinks* it has Drive
    // folders gets a quick HEAD-style check. If the course folder id is
    // 404 or trashed, treat it as missing and re-provision. Common cause
    // is the user wiping folders via /settings → reset, or manually
    // dragging them to trash in Drive.
    const folderExistsCache = new Map<string, boolean>()
    const checkFolderLive = async (folderId: string): Promise<boolean> => {
      const cached = folderExistsCache.get(folderId)
      if (cached !== undefined) return cached
      try {
        const res = await fetch(
          `${DRIVE_API}/files/${folderId}?fields=id,trashed`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
        if (res.status === 404) { folderExistsCache.set(folderId, false); return false }
        if (!res.ok) {
          // Inconclusive — treat as live so we don't churn a reprovision on
          // a transient 5xx. Worst case the user retries.
          folderExistsCache.set(folderId, true)
          return true
        }
        const data = await res.json().catch(() => ({} as any))
        const alive = data.id && !data.trashed
        folderExistsCache.set(folderId, alive)
        return alive
      } catch {
        // Same reasoning as the non-ok branch above.
        folderExistsCache.set(folderId, true)
        return true
      }
    }
    for (const c of courses) {
      const id = c.drive_folder_ids?.course
      if (!id) continue
      if (needsFolders.includes(c)) continue // already queued
      const alive = await checkFolderLive(id)
      if (!alive) {
        console.info('[courses/import] reprovisioning', c.title, '— Drive folder', id, 'gone')
        // Clear stale ids so the provision step below creates fresh ones.
        delete c.drive_folder_ids
        c.drive_folder_path = undefined
        needsFolders.push(c)
      }
    }

    // Provision the Drive folder hierarchy for any course that doesn't have
    // one yet. Without this, the user imports → no folders appear → they get
    // confused. Doing it inline (instead of "you'll get them when you visit
    // /summaries") keeps the import atomic from the user's perspective.
    //
    // Failures are isolated per-course: one bad folder doesn't sink the
    // whole import. The course just stays unprovisioned and the user can
    // retry from /courses.
    let foldersCreated = 0
    let foldersFailed = 0
    const folderCache = new Map<string, string>()
    for (const c of needsFolders) {
      try {
        const ids = await ensureCourseFolders(token, folderId, c, folderCache)
        const path = pathForCourseRecord(c).join('/')
        c.drive_folder_ids = ids
        c.drive_folder_path = path
        foldersCreated++
      } catch (e) {
        console.warn('[courses/import] folder provision failed for', c.title, e)
        foldersFailed++
      }
    }

    const nextDB = {
      ...db,
      courses,
      updated_at: new Date().toISOString(),
    }
    await uploadDB(token, dbFileId, nextDB)

    // Count courses that don't have Drive folders yet — the popup uses this
    // to tell the user how many need classification + folder creation.
    const needFoldersCount = courses.filter(
      (c) => !c.drive_folder_ids?.course,
    ).length

    return NextResponse.json(
      {
        added,
        updated,
        skipped,
        total: courses.length,
        folderId,
        // folders_created/folders_failed will normally both be 0 now — we
        // only re-provision existing courses whose path changed or whose
        // folder disappeared from Drive. New-course provisioning happens
        // on /summaries after the user classifies. Kept in the response
        // for the rare reprovision path so the popup can still surface it.
        folders_created: foldersCreated,
        folders_failed: foldersFailed,
        need_folders: needFoldersCount,
      },
      { headers: corsHeaders() },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.startsWith('drive_401')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders() })
    }
    if (msg.startsWith('drive_404')) {
      return NextResponse.json(
        { error: 'no_db', detail: 'TEEPO/db.json לא נמצא. פתח את האתר ל-DBProvider שייצור אותו, ואז נסה שוב.' },
        { status: 404, headers: corsHeaders() },
      )
    }
    console.error('[courses/import] failed:', msg)
    return NextResponse.json(
      { error: 'drive_error', detail: msg.slice(0, 200) },
      { status: 502, headers: corsHeaders() },
    )
  }
}

// ── Drive helpers ────────────────────────────────────────────────────────

/**
 * Initial shape for a freshly-created db.json. Mirrors EMPTY_DB in
 * lib/drive-db.ts but inlined so this route doesn't depend on a client
 * module (drive-db.ts is 'use client' adjacent and pulls in browser-only
 * Drive helpers via the existing imports).
 */
const EMPTY_DB = {
  version: 2,
  updated_at: new Date(0).toISOString(),
  courses: [],
  lessons: [],
  tasks: [],
  assignments: [],
  notes: [],
  settings: {},
  student_courses: [],
}

/**
 * Load (or bootstrap) the user's TEEPO/db.json.
 *
 * Previously this threw drive_404 when either the TEEPO/ folder or db.json
 * was missing, forcing the user to "open the website first so DBProvider
 * creates it". That's a leaky abstraction — the extension's import flow
 * should be self-contained. So now, if either is missing we create it
 * inline using the same Drive API surface the web app uses.
 */
async function loadDriveDB(token: string): Promise<{ folderId: string; dbFileId: string; db: any }> {
  // 1. TEEPO/ folder — find or create.
  const rootQ = "name = 'TEEPO' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
  const rootRes = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(rootQ)}&spaces=drive&fields=files(id)`,
  )
  const rootData = await rootRes.json()
  let folderId: string | undefined = rootData.files?.[0]?.id
  if (!folderId) {
    folderId = await createFolder(token, 'TEEPO')
  }

  // 2. db.json — find or create with EMPTY_DB.
  const dbQ = `'${folderId}' in parents and name = 'db.json' and trashed = false`
  const metaRes = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(dbQ)}&spaces=drive&fields=files(id)`,
  )
  const meta = await metaRes.json()
  let dbFileId: string | undefined = meta.files?.[0]?.id
  if (!dbFileId) {
    dbFileId = await createDBFile(token, folderId)
    return { folderId, dbFileId, db: { ...EMPTY_DB } }
  }

  // 3. Download existing content.
  const contentRes = await driveFetch(token, `${DRIVE_API}/files/${dbFileId}?alt=media`)
  const db = await contentRes.json()
  return { folderId, dbFileId, db }
}

async function uploadDB(token: string, fileId: string, db: any): Promise<void> {
  const res = await fetch(`${DRIVE_UPLOAD}/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(db),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`drive_${res.status}: ${t.slice(0, 160)}`)
  }
}

/** Create a new folder at the Drive root and return its id. */
async function createFolder(token: string, name: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`drive_${res.status}: ${t.slice(0, 160)}`)
  }
  const data = await res.json()
  if (!data.id) throw new Error('drive_500: createFolder returned no id')
  return data.id as string
}

/** Create db.json inside the given folder, seeded with EMPTY_DB. */
async function createDBFile(token: string, folderId: string): Promise<string> {
  const boundary = `teepo-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const meta = { name: 'db.json', mimeType: 'application/json', parents: [folderId] }
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(meta) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify({ ...EMPTY_DB, updated_at: new Date().toISOString() }) +
    `\r\n--${boundary}--`
  const res = await fetch(`${DRIVE_UPLOAD}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    throw new Error(`drive_${res.status}: ${t.slice(0, 160)}`)
  }
  const data = await res.json()
  if (!data.id) throw new Error('drive_500: createDBFile returned no id')
  return data.id as string
}

async function driveFetch(token: string, url: string): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new Error(`drive_401: ${url.slice(0, 80)}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`drive_${res.status}: ${body.slice(0, 160)}`)
  }
  return res
}
