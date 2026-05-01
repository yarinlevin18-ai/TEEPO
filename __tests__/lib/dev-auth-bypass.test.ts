/**
 * Dev-only auth bypass guard.
 *
 * Critical safety property: even if NEXT_PUBLIC_DEV_BYPASS_AUTH leaks into
 * a production build, the bypass MUST refuse to activate when
 * NODE_ENV === 'production'. A regression here would silently disable auth
 * in deployed environments — catastrophic.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { isDevAuthBypassEnabled, FAKE_USER, FAKE_SESSION } from '@/lib/dev-auth-bypass'

describe('isDevAuthBypassEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('refuses to activate in production even when flag is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('NEXT_PUBLIC_DEV_BYPASS_AUTH', 'true')
    expect(isDevAuthBypassEnabled()).toBe(false)
  })

  it('activates in development when flag is "true"', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_DEV_BYPASS_AUTH', 'true')
    expect(isDevAuthBypassEnabled()).toBe(true)
  })

  it('does NOT activate in development without the flag', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('NEXT_PUBLIC_DEV_BYPASS_AUTH', '')
    expect(isDevAuthBypassEnabled()).toBe(false)
  })

  it('does NOT activate when flag is anything other than "true"', () => {
    vi.stubEnv('NODE_ENV', 'development')
    for (const v of ['1', 'yes', 'TRUE', 'on', '']) {
      vi.stubEnv('NEXT_PUBLIC_DEV_BYPASS_AUTH', v)
      expect(isDevAuthBypassEnabled()).toBe(false)
    }
  })
})

describe('FAKE_USER / FAKE_SESSION', () => {
  it('FAKE_USER has the obvious-dev UUID format', () => {
    // The id is intentionally a non-real UUID so logs make it easy to
    // tell when something was created by the bypass.
    expect(FAKE_USER.id).toMatch(/0000.*dev/)
    expect(FAKE_USER.email).toContain('localhost')
  })

  it('FAKE_SESSION wraps FAKE_USER and has placeholder tokens', () => {
    expect(FAKE_SESSION.user).toBe(FAKE_USER)
    expect(FAKE_SESSION.access_token).toContain('dev-bypass')
    expect(FAKE_SESSION.provider_token).toContain('dev-bypass')
  })
})
