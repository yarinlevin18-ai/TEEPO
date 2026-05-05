/**
 * E2E: Google OAuth round-trip — placeholder.
 *
 * This test is gated on real test credentials (E2E_TEST_GOOGLE_EMAIL +
 * E2E_TEST_GOOGLE_PASSWORD). When they're not set we skip — running it
 * against personal accounts is a privacy hazard and CI shouldn't try.
 *
 * To enable:
 *   1. Create a dedicated Google test account (NOT a personal one)
 *   2. Add to repo secrets:
 *      E2E_TEST_GOOGLE_EMAIL    — full address
 *      E2E_TEST_GOOGLE_PASSWORD — app password if 2FA, else regular pwd
 *   3. Reference them in .github/workflows/e2e.yml's env block
 *
 * Per spec (TEEPO_v2.1.docx Appendix C §5): "E2E: Playwright for OAuth
 * scenarios + main flow." This file is the OAuth half — see
 * course-import.spec.ts for the sync half.
 *
 * Why this is a placeholder rather than a real impl: Google's sign-in flow
 * actively detects automated browsers and shows captcha / "this browser
 * isn't supported" pages, which makes naive Playwright drives flaky.
 * The real impl uses one of:
 *   - Programmatic OAuth: skip the UI, mint a Supabase session via the
 *     auth admin API, drop the cookie, navigate to /dashboard.
 *   - Storage state: log in once in a setup project, save cookies, replay.
 *
 * Until we pick an approach + ship test creds, this stays as a skipped stub
 * so the spec exists and the file path is reserved.
 */

import { test, expect } from '@playwright/test'

const HAS_CREDS =
  !!process.env.E2E_TEST_GOOGLE_EMAIL &&
  !!process.env.E2E_TEST_GOOGLE_PASSWORD

test.describe('Google OAuth flow', () => {
  test.skip(
    !HAS_CREDS,
    'Set E2E_TEST_GOOGLE_EMAIL + E2E_TEST_GOOGLE_PASSWORD to enable — see file header.',
  )

  test('signs in with Google and lands on /dashboard', async ({ page }) => {
    test.fixme(true, 'Pending implementation — see file header for approach options')

    await page.goto('/auth')
    // ... actual flow goes here once we pick programmatic vs UI-driven
    await expect(page).toHaveURL(/\/dashboard/)
  })
})
