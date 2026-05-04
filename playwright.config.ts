import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright config — frontend E2E tests.
 *
 * Two test categories:
 *   e2e/smoke/*    — public surfaces (landing, /auth) that don't need a session
 *   e2e/auth/*     — flows behind Google OAuth, gated by env presence
 *
 * Auth tests are skipped when E2E_TEST_GOOGLE_EMAIL / E2E_TEST_GOOGLE_PASSWORD
 * aren't set, so the smoke tier runs cleanly in CI without leaking creds.
 *
 * Locally:  npm run e2e
 * CI:       nightly via .github/workflows/e2e.yml (smoke only by default)
 */

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['html'], ['github']] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'he-IL',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Auto-start the dev server when running locally — skip in CI where the
  // workflow already orchestrates it explicitly.
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
})
