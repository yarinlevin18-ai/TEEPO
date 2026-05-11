/**
 * GET /api/drive/folder-for-course?course=<id>&kind=<lessons|assignments|notes>
 *
 * Called by the Chrome extension after the user picks a course in the
 * popup. We need to translate a TEEPO courseId → the Drive folder ID
 * that the extension should multipart-upload into.
 *
 * The extension carries its own Google access token (chrome.identity with
 * the same OAuth client_id as the web app — see chrome-extension/README.md).
 * We forward that token straight to Drive to read the user's TEEPO/db.json
 * and look up the matching course record.
 *
 * NO authentication beyond the bearer token: the only thing we trust is
 * Drive's verdict that the token is valid + scoped. The web app's Supabase
 * session is irrelevant here — we never touch user-PII.
 *
 * Response shape:
 *   200 { folderId: string, courseTitle?: string }
 *   400 { error: 'missing_course' }
 *   401 { error: 'unauthorized' }
 *   404 { error: 'course_not_found' | 'folder_not_provisioned' }
 *   502 { error: 'drive_error', detail }
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

interface CourseRecord {
  id: string
  title?: string
  name?: string
  drive_folder_ids?: {
    course?: string
    lessons?: string
    assignments?: string
    notes?: string
  }
}

type Kind = 'lessons' | 'assignments' | 'notes' | 'course'

function corsHeaders(): Record<string, string> {
  return {
    // Extensions issue requests from a chrome-extension:// origin which
    // CORS treats as `null`. Allow any origin since the bearer token is
    // the real auth; there's no cookie-based privilege here to forge.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const courseId = url.searchParams.get('course')?.trim()
  const kindParam = (url.searchParams.get('kind') ?? 'lessons').trim() as Kind
  const kind: Kind = (['lessons', 'assignments', 'notes', 'course'] as const).includes(kindParam)
    ? kindParam
    : 'lessons'

  if (!courseId) {
    return NextResponse.json({ error: 'missing_course' }, { status: 400, headers: corsHeaders() })
  }
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders() })
  }
  const token = authHeader.slice(7).trim()
  if (!token) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders() })
  }

  try {
    const db = await loadDriveDB(token)
    const course = db.courses?.find((c) => c.id === courseId)
    if (!course) {
      return NextResponse.json({ error: 'course_not_found' }, { status: 404, headers: corsHeaders() })
    }
    const folderId = course.drive_folder_ids?.[kind]
    if (!folderId) {
      return NextResponse.json(
        { error: 'folder_not_provisioned', courseTitle: course.title ?? course.name },
        { status: 404, headers: corsHeaders() },
      )
    }
    return NextResponse.json(
      { folderId, courseTitle: course.title ?? course.name ?? null },
      { headers: corsHeaders() },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Drive returned 401 → propagate so the extension can refresh and retry.
    if (msg.startsWith('drive_401')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders() })
    }
    console.error('[folder-for-course] failed:', msg)
    return NextResponse.json(
      { error: 'drive_error', detail: msg.slice(0, 200) },
      { status: 502, headers: corsHeaders() },
    )
  }
}

/**
 * Find the user's TEEPO/db.json and parse it. Mirrors the loader logic
 * in lib/drive-db.ts but stripped down — we only need to read.
 *
 * Throws an error like `drive_xxx: ...` so the caller can pattern-match
 * status codes.
 */
async function loadDriveDB(token: string): Promise<{ courses: CourseRecord[] }> {
  // 1. Find the TEEPO root folder by name in the user's Drive.
  const rootQuery = [
    "name = 'TEEPO'",
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')
  const rootRes = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(rootQuery)}&spaces=drive&fields=files(id,name)`,
  )
  const rootData = await rootRes.json()
  const rootId = rootData.files?.[0]?.id
  if (!rootId) throw new Error('drive_404: TEEPO root folder missing')

  // 2. Find db.json inside that folder.
  const dbQuery = [
    `'${rootId}' in parents`,
    "name = 'db.json'",
    'trashed = false',
  ].join(' and ')
  const dbMetaRes = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(dbQuery)}&spaces=drive&fields=files(id,name)`,
  )
  const dbMeta = await dbMetaRes.json()
  const dbId = dbMeta.files?.[0]?.id
  if (!dbId) throw new Error('drive_404: db.json missing')

  // 3. Download the JSON content.
  const contentRes = await driveFetch(token, `${DRIVE_API}/files/${dbId}?alt=media`)
  const text = await contentRes.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('drive_parse: db.json is malformed')
  }
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
