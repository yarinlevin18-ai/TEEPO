/**
 * Smoke: unauthenticated request to /dashboard redirects to /auth.
 *
 * Guards the middleware (middleware.ts) — a regression here means the
 * dashboard is publicly accessible, which would leak the UI shell.
 *
 * Skipped if the dev-auth-bypass flag is on (it deliberately makes the
 * dashboard reachable without auth, which is the opposite of what this
 * test guards).
 */

import { test, expect } from '@playwright/test'

test('GET /dashboard without a session lands on /auth', async ({ page, request }) => {
  // If dev-bypass is on, this whole assumption breaks — skip cleanly.
  if (process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true') {
    test.skip(true, 'Dev bypass active — this test only runs with real auth gating')
  }

  // Use request directly so we observe the redirect chain Server->Middleware
  // emits, without the browser following silently.
  const res = await request.get('/dashboard', { maxRedirects: 0 })
  // Expect 307 (Next.js middleware default) or 302/303 — anything in the 3xx
  // range that points at /auth is correct behavior.
  expect([302, 303, 307, 308]).toContain(res.status())
  const location = res.headers()['location'] || ''
  expect(location).toMatch(/\/auth/)
})
