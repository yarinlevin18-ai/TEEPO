/**
 * Stage 2 OAuth — JWT-first refresh ladder + idempotent token-storage upload.
 *
 * The function under test is the gate between localStorage-only world (the
 * old, fragile behaviour) and encrypted-server-side-storage world. The
 * critical invariants:
 *
 *   1. JWT path is tried first when a JWT is available. It must NOT touch
 *      the local refresh token in the request body.
 *   2. Legacy body path is used when the JWT path fails transiently OR no
 *      JWT is provided.
 *   3. A 401 from the JWT path with NO local refresh token surfaces as
 *      `revoked: true` — caller must force a re-OAuth.
 *   4. A 401 from the JWT path WITH a local refresh token falls through to
 *      the body path (the local copy might be newer than what's stored).
 *   5. `storeGoogleRefreshToken` is best-effort: it never throws, returns
 *      false on any non-2xx or network error.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  refreshGoogleAccessToken,
  storeGoogleRefreshToken,
} from '@/lib/auth-backend'

const BACKEND = 'https://backend.test'

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeFetch(impls: Array<(url: string, init?: RequestInit) => Promise<Response>>) {
  let i = 0
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = impls[Math.min(i, impls.length - 1)]
    i += 1
    return handler(url, init)
  })
  return fetchImpl as unknown as typeof fetch
}

describe('refreshGoogleAccessToken — JWT-first ladder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses JWT path with empty body when JWT present and succeeds', async () => {
    const fetchImpl = makeFetch([
      async (url, init) => {
        expect(url).toBe(`${BACKEND}/api/auth/refresh-google`)
        const body = JSON.parse(String(init?.body ?? '{}'))
        // Body must be empty for the JWT path — server reads token from DB.
        expect(body).toEqual({})
        const headers = init?.headers as Record<string, string>
        expect(headers.Authorization).toBe('Bearer jwt-abc')
        return jsonResponse(200, { access_token: 'fresh-1', expires_in: 3600 })
      },
    ])
    const result = await refreshGoogleAccessToken({
      jwt: 'jwt-abc',
      refreshToken: 'should-not-be-sent',
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(result).toEqual({ ok: true, accessToken: 'fresh-1', expiresIn: 3600 })
    // Crucially: only ONE call. Body path must not be touched on JWT success.
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('falls back to body path when JWT path returns transient (5xx)', async () => {
    const fetchImpl = makeFetch([
      async () => jsonResponse(503),
      async (_url, init) => {
        const body = JSON.parse(String(init?.body ?? '{}'))
        expect(body).toEqual({ refresh_token: 'local-rt' })
        return jsonResponse(200, { access_token: 'fresh-2', expires_in: 3000 })
      },
    ])
    const result = await refreshGoogleAccessToken({
      jwt: 'jwt-abc',
      refreshToken: 'local-rt',
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(result).toEqual({ ok: true, accessToken: 'fresh-2', expiresIn: 3000 })
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  it('falls back to body path when JWT path returns 401 BUT a local token exists', async () => {
    // Local copy might be fresher than server-stored — give body path a shot.
    const fetchImpl = makeFetch([
      async () => jsonResponse(401, { error: 'unauthorized' }),
      async () => jsonResponse(200, { access_token: 'from-body', expires_in: 1800 }),
    ])
    const result = await refreshGoogleAccessToken({
      jwt: 'jwt-abc',
      refreshToken: 'local-rt',
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(result).toEqual({ ok: true, accessToken: 'from-body', expiresIn: 1800 })
  })

  it('returns revoked when JWT path 401s AND no local token exists', async () => {
    // Nothing left to try — caller must force a re-OAuth.
    const fetchImpl = makeFetch([
      async () => jsonResponse(401, { error: 'refresh_failed' }),
    ])
    const result = await refreshGoogleAccessToken({
      jwt: 'jwt-abc',
      refreshToken: null,
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(result).toEqual({ ok: false, revoked: true })
    expect((fetchImpl as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('uses body path directly when no JWT is provided', async () => {
    const fetchImpl = makeFetch([
      async (_url, init) => {
        const headers = init?.headers as Record<string, string>
        expect(headers.Authorization).toBeUndefined()
        const body = JSON.parse(String(init?.body ?? '{}'))
        expect(body).toEqual({ refresh_token: 'local-rt' })
        return jsonResponse(200, { access_token: 'no-jwt', expires_in: 600 })
      },
    ])
    const result = await refreshGoogleAccessToken({
      jwt: null,
      refreshToken: 'local-rt',
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(result).toEqual({ ok: true, accessToken: 'no-jwt', expiresIn: 600 })
  })

  it('returns transient (not revoked) when nothing is callable', async () => {
    // No JWT, no local refresh token — caller can fall back to Supabase
    // refreshSession() etc. We do NOT surface this as `revoked: true`
    // because there's no signal at all; pretending the user must re-OAuth
    // would be wrong (e.g. cold-start).
    const fetchImpl = makeFetch([])
    const result = await refreshGoogleAccessToken({
      jwt: null,
      refreshToken: null,
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(result).toEqual({ ok: false })
  })

  it('treats body 401 as revoked on the legacy path', async () => {
    const fetchImpl = makeFetch([
      async () => jsonResponse(401, { error: 'refresh_failed' }),
    ])
    const result = await refreshGoogleAccessToken({
      jwt: null,
      refreshToken: 'expired',
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(result).toEqual({ ok: false, revoked: true })
  })

  it('handles network errors as transient on the JWT path', async () => {
    const fetchImpl = makeFetch([
      async () => { throw new TypeError('network down') },
      async () => jsonResponse(200, { access_token: 'recovered' }),
    ])
    const result = await refreshGoogleAccessToken({
      jwt: 'jwt-abc',
      refreshToken: 'local-rt',
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(result.ok).toBe(true)
  })

  it('handles malformed JSON response as transient', async () => {
    const fetchImpl = makeFetch([
      async () => new Response('not-json', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    ])
    const result = await refreshGoogleAccessToken({
      jwt: null,
      refreshToken: 'local-rt',
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(result).toEqual({ ok: false })
  })
})

describe('storeGoogleRefreshToken — best-effort upload', () => {
  it('sends correct headers + body and returns true on 200', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(`${BACKEND}/api/auth/store-google-refresh`)
      const headers = init?.headers as Record<string, string>
      expect(headers.Authorization).toBe('Bearer jwt-1')
      expect(headers['Content-Type']).toBe('application/json')
      expect(JSON.parse(String(init?.body))).toEqual({ refresh_token: 'rt-1' })
      return jsonResponse(200, { stored: true })
    }) as unknown as typeof fetch

    const ok = await storeGoogleRefreshToken('rt-1', 'jwt-1', {
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(ok).toBe(true)
  })

  it('returns false on non-2xx without throwing', async () => {
    const fetchImpl = (async () => jsonResponse(401)) as unknown as typeof fetch
    const ok = await storeGoogleRefreshToken('rt', 'bad-jwt', {
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(ok).toBe(false)
  })

  it('returns false on network error without throwing', async () => {
    const fetchImpl = (async () => { throw new Error('boom') }) as unknown as typeof fetch
    const ok = await storeGoogleRefreshToken('rt', 'jwt', {
      backendUrl: BACKEND,
      fetchImpl,
    })
    expect(ok).toBe(false)
  })
})
