/**
 * HTTP helpers for the server-side Google-token endpoints. Pure fetch
 * logic — no React, no Supabase client — so it's trivially unit-testable
 * (inject fetchImpl).
 *
 * Two endpoints (both Next API routes on Vercel):
 *   POST /api/auth/store-google-refresh  — upload the refresh token for
 *     encrypted server-side storage (JWT-gated). Best-effort.
 *   POST /api/auth/refresh-google        — mint a fresh access token.
 *     JWT-first (server-stored refresh token), body fallback (local copy).
 */

type FetchImpl = typeof fetch

export interface RefreshOptions {
  /** Supabase access token (JWT). Enables the server-lookup path. */
  jwt?: string | null
  /** Local refresh token (from localStorage). Enables the body path. */
  localRefreshToken?: string | null
  fetchImpl?: FetchImpl
  timeoutMs?: number
}

export type RefreshResult =
  | { ok: true; accessToken: string; expiresIn?: number }
  | { ok: false; revoked: true }
  | { ok: false; revoked?: false }

/**
 * Best-effort upload of the refresh token for server-side storage.
 * Returns true when stored; never throws.
 */
export async function storeGoogleRefreshToken(
  refreshToken: string,
  jwt: string,
  opts: { fetchImpl?: FetchImpl; timeoutMs?: number } = {},
): Promise<boolean> {
  const f = opts.fetchImpl ?? fetch
  try {
    const res = await f('/api/auth/store-google-refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
    })
    return res.ok
  } catch {
    return false
  }
}

async function callRefresh(
  f: FetchImpl,
  timeoutMs: number,
  init: { jwt?: string | null; refreshToken?: string | null },
): Promise<{ status: number; accessToken?: string; expiresIn?: number } | null> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (init.jwt) headers.Authorization = `Bearer ${init.jwt}`
  try {
    const res = await f('/api/auth/refresh-google', {
      method: 'POST',
      headers,
      body: JSON.stringify(init.refreshToken ? { refresh_token: init.refreshToken } : {}),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return { status: res.status }
    let data: any
    try {
      data = await res.json()
    } catch {
      return null // malformed response → transient
    }
    if (!data?.access_token) return null
    return { status: res.status, accessToken: data.access_token, expiresIn: data.expires_in }
  } catch {
    return null // network error → transient
  }
}

/**
 * The refresh ladder:
 *   1. JWT path (server-stored token) when a JWT is available.
 *   2. Body path (local refresh token) when the JWT path failed or no JWT.
 *
 * `revoked: true` means the user must re-run OAuth: every credential we
 * could try was rejected with 401. Transient failures (network, 5xx,
 * malformed responses, or simply nothing to try yet on a cold start)
 * return `{ok: false}` without the revoked flag.
 */
export async function refreshGoogleAccessToken(opts: RefreshOptions): Promise<RefreshResult> {
  const f = opts.fetchImpl ?? fetch
  const timeoutMs = opts.timeoutMs ?? 10_000
  const jwt = opts.jwt ?? null
  const local = opts.localRefreshToken ?? null

  let jwtRejected = false
  if (jwt) {
    const r = await callRefresh(f, timeoutMs, { jwt })
    if (r?.accessToken) return { ok: true, accessToken: r.accessToken, expiresIn: r.expiresIn }
    // 400 = no server-stored token; 401 = stored token rejected by Google.
    if (r && (r.status === 401 || r.status === 400)) jwtRejected = r.status === 401
    // Fall through to the body path in every failure case — the local
    // copy might be newer than (or exist instead of) the stored one.
  }

  if (local) {
    const r = await callRefresh(f, timeoutMs, { refreshToken: local })
    if (r?.accessToken) return { ok: true, accessToken: r.accessToken, expiresIn: r.expiresIn }
    if (r && r.status === 401) return { ok: false, revoked: true }
    return { ok: false }
  }

  // Nothing local to try. If the server-stored token was explicitly
  // rejected, that's a revocation; otherwise treat as transient (cold
  // start with no credentials shouldn't force a re-OAuth prompt).
  if (jwtRejected) return { ok: false, revoked: true }
  return { ok: false }
}
