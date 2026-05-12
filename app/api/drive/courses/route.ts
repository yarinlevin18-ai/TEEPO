/**
 * GET /api/drive/courses — returns a thin list of the user's courses for
 * the Chrome extension's "which course is this file for?" picker.
 *
 * Same auth model as /api/drive/folder-for-course: the bearer token is
 * a Drive access token (with drive.file scope) that we forward to Drive
 * to read TEEPO/db.json. No Supabase session involvement.
 *
 * Response:
 *   200 [{ id, title, year_of_study?, semester?, provisioned: boolean }, ...]
 *   401 unauthorized
 *   502 drive_error
 *
 * `provisioned` flags whether drive_folder_ids exists — so the extension
 * can grey out courses whose folder hierarchy hasn't been generated yet
 * and steer the user to the web app.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DRIVE_API = 'https://www.googleapis.com/drive/v3'

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function GET(req: NextRequest) {
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
    // Surface only what the picker needs — keeps the response small + avoids
    // leaking lecturer emails, TA lists, etc. to the extension's storage.
    const out = (db.courses ?? []).map((c: any) => ({
      id: c.id,
      title: c.title ?? c.name ?? '(ללא שם)',
      year_of_study: c.year_of_study ?? null,
      semester: c.semester ?? null,
      shortname: c.shortname ?? null,
      provisioned: Boolean(c.drive_folder_ids?.course),
    }))
    return NextResponse.json(out, { headers: corsHeaders() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.startsWith('drive_401')) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders() })
    }
    console.error('[courses] failed:', msg)
    return NextResponse.json(
      { error: 'drive_error', detail: msg.slice(0, 200) },
      { status: 502, headers: corsHeaders() },
    )
  }
}

// ── shared loader (small duplicate of folder-for-course; keeping the
// two routes independent so removing one doesn't accidentally break the
// other — they evolve at different rates) ──────────────────────────────

async function loadDriveDB(token: string): Promise<{ courses: any[] }> {
  const rootQuery = [
    "name = 'TEEPO'",
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ')
  const rootRes = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(rootQuery)}&spaces=drive&fields=files(id)`,
  )
  const rootData = await rootRes.json()
  const rootId = rootData.files?.[0]?.id
  if (!rootId) throw new Error('drive_404: TEEPO root missing')

  const dbQuery = [`'${rootId}' in parents`, "name = 'db.json'", 'trashed = false'].join(' and ')
  const metaRes = await driveFetch(
    token,
    `${DRIVE_API}/files?q=${encodeURIComponent(dbQuery)}&spaces=drive&fields=files(id)`,
  )
  const meta = await metaRes.json()
  const dbId = meta.files?.[0]?.id
  if (!dbId) throw new Error('drive_404: db.json missing')

  const contentRes = await driveFetch(token, `${DRIVE_API}/files/${dbId}?alt=media`)
  return contentRes.json()
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
