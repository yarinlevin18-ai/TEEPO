/**
 * The JWT-first → body-fallback refresh ladder and the best-effort
 * storage upload (lib/auth-backend.ts). All network is mocked via
 * fetchImpl injection.
 */
import { describe, it, expect, vi } from 'vitest'
import { refreshGoogleAccessToken, storeGoogleRefreshToken } from '@/lib/auth-backend'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const OK_BODY = { access_token: 'fresh-at', expires_in: 3599 }

describe('refreshGoogleAccessToken', () => {
  it('JWT path success: one call, Authorization header, empty body', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, OK_BODY))
    const r = await refreshGoogleAccessToken({ jwt: 'jwt-1', localRefreshToken: 'local-rt', fetchImpl: f })
    expect(r).toEqual({ ok: true, accessToken: 'fresh-at', expiresIn: 3599 })
    expect(f).toHaveBeenCalledTimes(1)
    const [, init] = f.mock.calls[0]
    expect(init.headers.Authorization).toBe('Bearer jwt-1')
    expect(JSON.parse(init.body)).toEqual({})
  })

  it('JWT 5xx: falls back to body path and succeeds', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(jsonResponse(502, { error: 'upstream_unreachable' }))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY))
    const r = await refreshGoogleAccessToken({ jwt: 'jwt-1', localRefreshToken: 'local-rt', fetchImpl: f })
    expect(r.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ refresh_token: 'local-rt' })
  })

  it('JWT 401 + local token present: falls through to body path', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, { error: 'refresh_failed' }))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY))
    const r = await refreshGoogleAccessToken({ jwt: 'jwt-1', localRefreshToken: 'local-rt', fetchImpl: f })
    expect(r.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('JWT 401 + no local token: revoked (force re-OAuth)', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'refresh_failed' }))
    const r = await refreshGoogleAccessToken({ jwt: 'jwt-1', fetchImpl: f })
    expect(r).toEqual({ ok: false, revoked: true })
  })

  it('JWT 400 (no server-stored token) + no local token: transient, not revoked', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(400, { error: 'missing_refresh_token' }))
    const r = await refreshGoogleAccessToken({ jwt: 'jwt-1', fetchImpl: f })
    expect(r.ok).toBe(false)
    expect((r as { revoked?: boolean }).revoked).toBeFalsy()
  })

  it('no JWT, local token present: body path used directly', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, OK_BODY))
    const r = await refreshGoogleAccessToken({ localRefreshToken: 'local-rt', fetchImpl: f })
    expect(r.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0][1].headers.Authorization).toBeUndefined()
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ refresh_token: 'local-rt' })
  })

  it('no JWT, no local token: transient — not revoked', async () => {
    const f = vi.fn()
    const r = await refreshGoogleAccessToken({ fetchImpl: f })
    expect(r.ok).toBe(false)
    expect((r as { revoked?: boolean }).revoked).toBeFalsy()
    expect(f).not.toHaveBeenCalled()
  })

  it('body 401: revoked', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(401, { error: 'refresh_failed' }))
    const r = await refreshGoogleAccessToken({ localRefreshToken: 'local-rt', fetchImpl: f })
    expect(r).toEqual({ ok: false, revoked: true })
  })

  it('network error on JWT path: falls through to body', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200, OK_BODY))
    const r = await refreshGoogleAccessToken({ jwt: 'jwt-1', localRefreshToken: 'local-rt', fetchImpl: f })
    expect(r.ok).toBe(true)
  })

  it('malformed JSON response: transient', async () => {
    const f = vi.fn().mockResolvedValue(new Response('not json{', { status: 200 }))
    const r = await refreshGoogleAccessToken({ localRefreshToken: 'local-rt', fetchImpl: f })
    expect(r.ok).toBe(false)
    expect((r as { revoked?: boolean }).revoked).toBeFalsy()
  })
})

describe('storeGoogleRefreshToken', () => {
  it('200: returns true and sends JWT + token', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, { stored: true }))
    const ok = await storeGoogleRefreshToken('rt-1', 'jwt-1', { fetchImpl: f })
    expect(ok).toBe(true)
    const [url, init] = f.mock.calls[0]
    expect(url).toBe('/api/auth/store-google-refresh')
    expect(init.headers.Authorization).toBe('Bearer jwt-1')
    expect(JSON.parse(init.body)).toEqual({ refresh_token: 'rt-1' })
  })

  it('non-2xx: returns false without throwing', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(502, { error: 'storage_failed' }))
    await expect(storeGoogleRefreshToken('rt-1', 'jwt-1', { fetchImpl: f })).resolves.toBe(false)
  })

  it('network error: returns false without throwing', async () => {
    const f = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(storeGoogleRefreshToken('rt-1', 'jwt-1', { fetchImpl: f })).resolves.toBe(false)
  })
})
