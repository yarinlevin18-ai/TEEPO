/**
 * Network helpers for the encrypted Google-refresh-token storage flow.
 *
 * Backend contract is defined in `backend/routes/auth.py`:
 *   POST /api/auth/store-google-refresh
 *     Headers: Authorization: Bearer <jwt>
 *     Body:    { "refresh_token": "..." }
 *     → 200 { stored: true } | 400 missing | 401 unauthorized | 500
 *
 *   POST /api/auth/refresh-google
 *     Headers: Authorization: Bearer <jwt>          (preferred)
 *     Body:    {} | { refresh_token: "..." }        (legacy)
 *     → 200 { access_token, expires_in } | 401 revoked | 400 | 500
 *
 * Extracted from `auth-context.tsx` so the JWT-first / body-fallback ladder
 * can be unit-tested without spinning up Supabase or React.
 */

const DEFAULT_TIMEOUT_MS = 10_000

export type RefreshResult =
  | { ok: true; accessToken: string; expiresIn?: number }
  | { ok: false; revoked: true }
  | { ok: false; revoked?: false }

interface RefreshOpts {
  jwt?: string | null
  refreshToken?: string | null
  backendUrl: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/**
 * Idempotently upload a Google refresh token to encrypted backend storage.
 * Best-effort: callers should not block sign-in on this. The backend upserts
 * by user_id, so re-calling with the same token is a no-op.
 *
 * Returns true on 2xx, false on any other outcome (network, non-2xx, abort).
 */
export async function storeGoogleRefreshToken(
  refreshToken: string,
  jwt: string,
  opts: { backendUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<boolean> {
  const f = opts.fetchImpl ?? fetch
  try {
    const res = await f(`${opts.backendUrl}/api/auth/store-google-refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Run one POST /api/auth/refresh-google attempt. Internal helper — callers
 * should use `refreshGoogleAccessToken` which sequences the JWT and
 * body-based attempts.
 */
async function attemptRefresh(
  headers: Record<string, string>,
  body: Record<string, unknown>,
  opts: { backendUrl: string; timeoutMs?: number; fetchImpl?: typeof fetch }
): Promise<RefreshResult> {
  const f = opts.fetchImpl ?? fetch
  try {
    const res = await f(`${opts.backendUrl}/api/auth/refresh-google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    })
    if (res.status === 401) return { ok: false, revoked: true }
    if (!res.ok) return { ok: false }
    const data = await res.json().catch(() => null)
    if (data?.access_token) {
      return {
        ok: true,
        accessToken: data.access_token as string,
        expiresIn: typeof data.expires_in === 'number' ? data.expires_in : undefined,
      }
    }
    return { ok: false }
  } catch {
    return { ok: false }
  }
}

/**
 * Refresh ladder:
 *   1. JWT-only call (server reads encrypted refresh token from
 *      `user_google_tokens`). Works on any device with a valid Supabase
 *      session, even with no localStorage refresh token.
 *   2. Legacy body call with the local refresh token. Kept as fallback for
 *      cases where the JWT lookup couldn't reach the backend's DB but the
 *      local copy is still valid.
 *
 * Returns:
 *   { ok: true, accessToken, expiresIn? } — refresh succeeded, store these
 *   { ok: false, revoked: true }          — backend reported the refresh token
 *                                           is revoked. Caller MUST trigger a
 *                                           reconnect/re-OAuth. Local copy is
 *                                           NOT touched here — caller decides.
 *   { ok: false }                         — transient (network / 4xx / 5xx).
 *                                           Caller can fall back to Supabase
 *                                           refreshSession() etc.
 */
export async function refreshGoogleAccessToken(opts: RefreshOpts): Promise<RefreshResult> {
  // Path 1: JWT-only.
  if (opts.jwt) {
    const result = await attemptRefresh(
      { Authorization: `Bearer ${opts.jwt}` },
      {},
      opts
    )
    if (result.ok) return result
    // 401 from JWT path means the *server-stored* token is revoked. If we
    // also have a local copy, give the body path a chance — it could be
    // newer (e.g. user just signed in but `store-google-refresh` hasn't
    // round-tripped yet). Otherwise propagate revoked up.
    if (result.revoked && !opts.refreshToken) return result
  }

  // Path 2: legacy body call.
  if (!opts.refreshToken) {
    // No JWT path attempted (no session) AND no local token → caller has
    // nothing to retry with. Surface as transient so we don't force a
    // re-OAuth on what might just be a cold-start.
    return { ok: false }
  }
  return attemptRefresh({}, { refresh_token: opts.refreshToken }, opts)
}
