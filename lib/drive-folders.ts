/**
 * Drive Folders — User-facing folder hierarchy inside TEEPO/
 *
 * Structure:
 *   TEEPO/
 *     db.json                          (the actual data — managed by drive-db.ts)
 *     תואר ראשון/
 *       שנה א׳/
 *         סמסטר א׳/
 *           <Course Title>/
 *             שיעורים/
 *             מטלות/
 *             סיכומים/
 *         סמסטר ב׳/
 *         קיץ/
 *       שנה ב׳/ …
 *     לא מסווגים/
 *       <Course Title>/ …
 *
 * We store folder IDs on the Course so we don't re-search every time. When a
 * course is re-classified we can detect the mismatch and move it in Drive.
 *
 * Scope: `drive.file` lets us see/modify only files we created, so all of this
 * is app-private. The user sees the folders in their Drive but other apps
 * can't touch them.
 */
import type { Course } from '@/types'
import type { Semester } from './semester-classifier'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const DEGREE_FOLDER_NAME = 'תואר ראשון'
const UNCLASSIFIED_FOLDER = 'לא מסווגים'
const SUBFOLDERS = ['שיעורים', 'מטלות', 'סיכומים'] as const

export interface CourseFolderIds {
  course: string
  lessons: string
  assignments: string
  notes: string
}

// ── Low-level helpers (share fetch pattern with drive-db) ────────────────

async function driveFetch(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  })
  return res
}

/** Read response body text once even when it's already consumed. */
async function readErrorBody(res: Response): Promise<string> {
  try { return await res.clone().text() } catch { return '' }
}

/** Find a folder by name within a specific parent. Returns first match. */
async function findFolder(
  token: string,
  name: string,
  parentId: string,
): Promise<string | null> {
  // Escape both single-quotes and backslashes for the Drive query DSL.
  const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const q = [
    `name = '${safeName}'`,
    `mimeType = '${FOLDER_MIME}'`,
    `'${parentId}' in parents`,
    'trashed = false',
  ].join(' and ')
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`
  const res = await driveFetch(token, url)
  if (!res.ok) {
    const body = await readErrorBody(res)
    console.error('[drive-folders] findFolder failed', res.status, name, body)
    throw new Error(`Drive search ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.files?.[0]?.id ?? null
}

async function createFolder(
  token: string,
  name: string,
  parentId: string,
): Promise<string> {
  const res = await driveFetch(token, `${DRIVE_API}/files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  })
  if (!res.ok) {
    const body = await readErrorBody(res)
    console.error('[drive-folders] createFolder failed', res.status, name, body)
    throw new Error(`Drive create ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  console.info('[drive-folders] created folder', { name, id: data.id, parent: parentId })
  return data.id
}

async function ensureFolder(
  token: string,
  name: string,
  parentId: string,
  cache: Map<string, string>,
): Promise<string> {
  const key = `${parentId}::${name}`
  const cached = cache.get(key)
  if (cached) return cached
  let id = await findFolder(token, name, parentId)
  if (!id) id = await createFolder(token, name, parentId)
  cache.set(key, id)
  return id
}

/** Rename or move a folder. Used when a course is reclassified. */
export async function moveFolder(
  token: string,
  fileId: string,
  newParentId: string,
  newName?: string,
): Promise<void> {
  // Fetch existing parents first so we know what to remove
  const infoRes = await driveFetch(
    token,
    `${DRIVE_API}/files/${fileId}?fields=parents,name`,
  )
  if (!infoRes.ok) throw new Error(`Folder info failed (${infoRes.status})`)
  const info = await infoRes.json()
  const oldParents: string[] = info.parents || []

  const params = new URLSearchParams()
  if (!oldParents.includes(newParentId)) {
    params.set('addParents', newParentId)
    params.set('removeParents', oldParents.join(','))
  }

  const body: Record<string, unknown> = {}
  if (newName && newName !== info.name) body.name = newName

  const res = await driveFetch(
    token,
    `${DRIVE_API}/files/${fileId}?${params.toString()}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  )
  if (!res.ok) throw new Error(`Folder move failed (${res.status})`)
}

// ── Path building ─────────────────────────────────────────────────────────

const YEAR_LABEL: Record<number, string> = {
  1: "שנה א׳",
  2: "שנה ב׳",
  3: "שנה ג׳",
  4: "שנה ד׳",
}

const SEM_LABEL: Record<Semester, string> = {
  'א': "סמסטר א׳",
  'ב': "סמסטר ב׳",
  'קיץ': "קיץ",
}

/** Sanitize a course title for use as a Drive folder name. */
export function sanitizeFolderName(name: string): string {
  // Drive tolerates most characters, but slashes are risky in UI. Replace them.
  return name.replace(/[/\\]/g, '-').trim().slice(0, 200) || 'קורס ללא שם'
}

/**
 * Compute the path of folder names from TEEPO/ down to the course folder.
 * e.g. ["תואר ראשון", "שנה א׳", "סמסטר א׳", "מבוא למדמ״ח"]
 * Unclassified courses go to TEEPO/לא מסווגים/<title>/.
 */
export function pathForCourse(course: Course): string[] {
  const title = sanitizeFolderName(course.title)
  if (!course.year_of_study && !course.semester) {
    return [UNCLASSIFIED_FOLDER, title]
  }
  const parts = [DEGREE_FOLDER_NAME]
  if (course.year_of_study && YEAR_LABEL[course.year_of_study]) {
    parts.push(YEAR_LABEL[course.year_of_study])
  } else {
    parts.push('ללא שנה')
  }
  if (course.semester && SEM_LABEL[course.semester]) {
    parts.push(SEM_LABEL[course.semester])
  } else {
    parts.push('ללא סמסטר')
  }
  parts.push(title)
  return parts
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Ensure the full folder hierarchy exists for a single course, creating
 * any missing folders. Returns the Drive IDs of the course folder + the 3
 * subfolders (שיעורים/מטלות/סיכומים).
 *
 * The `cache` argument lets you share a Map across many courses in one batch
 * so we don't re-search the same parent folders.
 */
export async function ensureCourseFolders(
  token: string,
  smartDeskFolderId: string,
  course: Course,
  cache: Map<string, string> = new Map(),
): Promise<CourseFolderIds> {
  const path = pathForCourse(course)
  let parent = smartDeskFolderId
  for (const segment of path) {
    parent = await ensureFolder(token, segment, parent, cache)
  }
  // parent is now the course folder
  const courseFolder = parent

  const [lessons, assignments, notes] = await Promise.all(
    SUBFOLDERS.map((s) => ensureFolder(token, s, courseFolder, cache)),
  )

  return { course: courseFolder, lessons, assignments, notes }
}

/**
 * Bulk: make sure every course in the DB has its folder hierarchy.
 * Returns a map of course.id → folder IDs so the caller can persist them.
 */
export async function ensureAllCourseFolders(
  token: string,
  smartDeskFolderId: string,
  courses: Course[],
  onProgress?: (done: number, total: number) => void,
): Promise<Record<string, CourseFolderIds>> {
  const cache = new Map<string, string>()
  const out: Record<string, CourseFolderIds> = {}
  let done = 0
  for (const c of courses) {
    try {
      out[c.id] = await ensureCourseFolders(token, smartDeskFolderId, c, cache)
    } catch (e) {
      console.error(`[drive-folders] failed for ${c.title}:`, e)
    }
    done++
    onProgress?.(done, courses.length)
  }
  return out
}
