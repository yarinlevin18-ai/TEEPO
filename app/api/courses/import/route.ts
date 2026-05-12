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
  [k: string]: unknown
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
      }
    }

    const nextDB = {
      ...db,
      courses,
      updated_at: new Date().toISOString(),
    }
    await uploadDB(token, dbFileId, nextDB)

    return NextResponse.json(
      {
        added,
        updated,
        skipped,
        total: courses.length,
        folderId,
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

async function loadDriveDB(token: string): Promise<{ folderId: string; dbFileId: string; db: any }> {
  const rootQ = "name = 'TEEPO' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
  const rootRes = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(rootQ)}&spaces=drive&fields=files(id)`,
  )
  const rootData = await rootRes.json()
  const folderId = rootData.files?.[0]?.id
  if (!folderId) throw new Error('drive_404: TEEPO root missing')

  const dbQ = `'${folderId}' in parents and name = 'db.json' and trashed = false`
  const metaRes = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(dbQ)}&spaces=drive&fields=files(id)`,
  )
  const meta = await metaRes.json()
  const dbFileId = meta.files?.[0]?.id
  if (!dbFileId) throw new Error('drive_404: db.json missing')

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

async function driveFetch(token: string, url: string): Promise<Response> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new Error(`drive_401: ${url.slice(0, 80)}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`drive_${res.status}: ${body.slice(0, 160)}`)
  }
  return res
}
