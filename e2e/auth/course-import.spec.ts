/**
 * E2E: First-time BGU course import — placeholder.
 *
 * Gated on test credentials. See google-oauth.spec.ts for the broader
 * "why this is a stub" rationale.
 *
 * What this should eventually verify:
 *   1. Logged-in user clicks "Connect Moodle" on /moodle
 *   2. Submits BGU username/password (E2E_TEST_BGU_USERNAME + _PASSWORD)
 *   3. Backend kicks off Selenium scrape (5-30s wait)
 *   4. Polling endpoint reports connected=true
 *   5. /courses page now shows ≥1 imported course with the v2.1 enrichment
 *      fields (lecturer_email, syllabus_url, teaching_assistants) populated
 *
 * Why this matters: it's the "first 60 seconds" UX. If it breaks, every
 * new user falls off — they can't even see their courses.
 *
 * Required test creds:
 *   E2E_TEST_BGU_USERNAME, E2E_TEST_BGU_PASSWORD
 *   (plus the Google creds from google-oauth.spec.ts to authenticate first)
 *
 * Backend dependency: a running Render instance (or local Flask) — these
 * tests can't run pure-frontend.
 */

import { test, expect } from '@playwright/test'

const HAS_CREDS =
  !!process.env.E2E_TEST_GOOGLE_EMAIL &&
  !!process.env.E2E_TEST_BGU_USERNAME &&
  !!process.env.E2E_TEST_BGU_PASSWORD

test.describe('BGU course import flow', () => {
  test.skip(
    !HAS_CREDS,
    'Needs E2E_TEST_GOOGLE_* + E2E_TEST_BGU_* credentials. See file header.',
  )

  test('imports BGU courses with v2.1 enrichment fields', async ({ page }) => {
    test.fixme(true, 'Pending — depends on google-oauth flow being implemented first')

    // Sign in (delegated to a fixture once google-oauth.spec.ts lands)
    await page.goto('/dashboard')

    // Connect Moodle
    await page.goto('/moodle')
    // ... fill form, wait for poll, verify courses appear

    await page.goto('/courses')
    const courseCards = page.locator('[data-testid="course-card"]')
    await expect(courseCards.first()).toBeVisible()
  })
})
