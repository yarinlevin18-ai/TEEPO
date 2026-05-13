/**
 * POST /api/auth/refresh-google
 *
 * Exchange a Google OAuth refresh_token for a fresh access_token.
 *
 * Why this lives on Vercel (not the Python backend on Render):
 *   Supabase hands us a `provider_token` + `provider_refresh_token` on
 *   sign-in but never rotates the provider token itself. When it expires
 *   (~1h) every Drive call returns 401. The website's auth-context.tsx
 *   used to call the Flask backend (`/api/auth/refresh-google` on Render)
 *   to do the rotation — but Render free-tier was down/unreachable, so
 *   refresh silently failed and the stored token went stale, causing
 *   the extension's uploads + imports to 401 against Drive.
 *
 *   Vercel functions run as long as the Next.js deploy is up. Moving the
 *   exchange here removes the Render dependency for the most user-facing
 *   path (Drive auth) so the app keeps working even when the Python
 *   backend is offline.
 *
 * Body:    { refresh_token: string }
 * Returns: { access_token, expires_in, scope, token_type }
 * Errors:
 *   400 { error: 'missing_refresh_token' }
 *   401 { error: 'refresh_failed', detail }      ← refresh token revoked
 *   500 { error: 'server_not_configured' }       ← env vars missing
 *   502 { error: 'upstream_unreachable', detail }
 *
 * Required env vars (set in Vercel project settings):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *
 * These are server-only (NOT prefixed NEXT_PUBLIC_). The client_id must
 * match the OAuth client Supabase uses for the Google provider — that's
 * how the refresh_token was minted.
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

function cors(): Record<string, string> {
  // The extension hits this from a chrome-extension:// origin and the
  // website hits it same-origin; allow all since the refresh_token itself
  // is the only credential and is already in the caller's possession.
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() })
}

/**
 * GET — diagnostic. Reports presence + a sanitized fingerprint of the
 * configured env vars so we can verify they match the Supabase OAuth
 * client without exposing the full secret. Returns the first 12 + last 15
 * chars of the client_id (the full thing is public anyway — it ends up
 * in every OAuth redirect URL) and only the length of the secret.
 */
export async function GET() {
  const rawId = process.env.GOOGLE_CLIENT_ID ?? ''
  const rawSecret = process.env.GOOGLE_CLIENT_SECRET ?? ''
  const id = rawId.trim()
  const secret = rawSecret.trim()
  return NextResponse.json(
    {
      configured: !!id && !!secret,
      clientIdPresent: !!id,
      clientIdLen: id.length,
      clientIdHasWhitespace: rawId !== id,
      clientIdPrefix: id.slice(0, 12),
      clientIdSuffix: id.slice(-15),
      clientSecretPresent: !!secret,
      clientSecretLen: secret.length,
      clientSecretHasWhitespace: rawSecret !== secret,
      clientSecretPrefix: secret.slice(0, 7), // GOCSPX- is public-knowledge prefix
    },
    { headers: cors() },
  )
}

export async function POST(req: NextRequest) {
  // Trim — Vercel's env-var editor preserves trailing newlines when you
  // paste, which Google treats as part of the credential and rejects with
  // invalid_client. Cheap to defend.
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: 'server_not_configured',
        message: 'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing in Vercel env',
      },
      { status: 500, headers: cors() },
    )
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

  // Exchange the refresh token for a fresh access token.
  let resp: Response
  try {
    resp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
      // 10s — Google's token endpoint is usually <500ms but the upstream
      // could be flaky.
      signal: AbortSignal.timeout(10_000),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[auth/refresh-google] upstream fetch failed:', msg)
    return NextResponse.json(
      { error: 'upstream_unreachable', detail: msg.slice(0, 200) },
      { status: 502, headers: cors() },
    )
  }

  const text = await resp.text()
  let data: any
  try { data = JSON.parse(text) } catch { data = { raw: text.slice(0, 200) } }

  if (!resp.ok) {
    // Most likely: the refresh token was revoked (user signed out of
    // Google, changed password, or it sat unused too long). The website
    // should treat this as "force re-sign-in".
    console.warn('[auth/refresh-google] Google returned', resp.status, JSON.stringify(data).slice(0, 200))
    return NextResponse.json(
      { error: 'refresh_failed', status: resp.status, detail: data },
      { status: 401, headers: cors() },
    )
  }

  return NextResponse.json(
    {
      access_token: data.access_token,
      expires_in: data.expires_in ?? 3600,
      scope: data.scope ?? '',
      token_type: data.token_type ?? 'Bearer',
    },
    { headers: cors() },
  )
}
