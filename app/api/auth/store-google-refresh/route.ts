/**
 * POST /api/auth/store-google-refresh
 *
 * Store the caller's Google refresh token encrypted at rest, keyed by
 * their Supabase user id, so any signed-in device can refresh Google
 * access tokens via /api/auth/refresh-google without re-OAuth.
 *
 * Auth: Supabase JWT in the Authorization header — the user id is taken
 * from the verified JWT, never from the body, so a caller can only ever
 * write their own row.
 *
 * Body:    { refresh_token: string }
 * Returns: 200 { stored: true }
 *   400 { error: 'missing_refresh_token' | 'bad_json' }
 *   401 { error: 'unauthorized' }
 *   500 { error: 'server_not_configured' }   ← env vars missing
 *   502 { error: 'storage_failed' }
 *
 * Required env (Vercel, server-side):
 *   TOKEN_ENCRYPTION_SECRET, SUPABASE_SERVICE_KEY
 */

import { NextRequest, NextResponse } from 'next/server'
import { encryptToken } from '@/lib/server/token-crypto'
import { supabaseAdmin, userIdFromJWT } from '@/lib/server/supabase-admin'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() })
}

export async function POST(req: NextRequest) {
  const admin = supabaseAdmin()
  if (!admin || !process.env.TOKEN_ENCRYPTION_SECRET?.trim()) {
    return NextResponse.json(
      { error: 'server_not_configured' },
      { status: 500, headers: cors() },
    )
  }

  const authHeader = req.headers.get('authorization')
  const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  const userId = await userIdFromJWT(jwt)
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: cors() })
  }

  let body: { refresh_token?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400, headers: cors() })
  }
  const refreshToken = body?.refresh_token?.trim()
  if (!refreshToken) {
    return NextResponse.json(
      { error: 'missing_refresh_token' },
      { status: 400, headers: cors() },
    )
  }

  try {
    const { ciphertext, iv } = encryptToken(refreshToken)
    const { error } = await admin
      .from('user_google_tokens')
      .upsert({ user_id: userId, ciphertext, iv }, { onConflict: 'user_id' })
    if (error) throw new Error(error.message)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[store-google-refresh] failed:', msg)
    return NextResponse.json(
      { error: 'storage_failed' },
      { status: 502, headers: cors() },
    )
  }

  return NextResponse.json({ stored: true }, { headers: cors() })
}
