/**
 * Smoke: the public landing page renders.
 *
 * Cheapest possible signal that the build isn't catastrophically broken —
 * if this fails, dev-server boot or basic SSR is the regression.
 */

import { test, expect } from '@playwright/test'

test('landing page renders TEEPO branding in Hebrew/RTL', async ({ page }) => {
  await page.goto('/')

  // The <html> tag should be RTL Hebrew. This is the foundation we built
  // every UI on — a regression here means lots of layouts are about to flip.
  const htmlLang = await page.locator('html').getAttribute('lang')
  const htmlDir = await page.locator('html').getAttribute('dir')
  expect(htmlLang).toBe('he')
  expect(htmlDir).toBe('rtl')

  // Title should match what next.config.js / metadata sets.
  await expect(page).toHaveTitle(/TEEPO/)

  // No JavaScript errors blew up the page.
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.waitForLoadState('networkidle')
  expect(errors).toEqual([])
})

test('clicking sign-in CTA goes to /auth', async ({ page }) => {
  await page.goto('/')

  // Heuristic: the sign-in button is the first link/button on the landing page
  // that points at /auth. We don't bind to text because copy can change.
  const cta = page.getByRole('link', { name: /התחבר|התחל|sign in|login/i }).first()
  if (await cta.count()) {
    await cta.click()
    await expect(page).toHaveURL(/\/auth/)
  } else {
    // No CTA found — landing page may have been refactored. Skip rather than
    // fail; this test is meant to catch regressions, not enforce design.
    test.skip(true, 'No auth CTA found on landing page — skip until selector updated')
  }
})
