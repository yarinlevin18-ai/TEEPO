/**
 * Bypass-tier E2E: dashboard-side flows behind the dev auth bypass.
 *
 * These run ONLY when NEXT_PUBLIC_DEV_BYPASS_AUTH=true (the inverse of
 * the smoke tier's dashboard-redirect test). They verify the UI wiring —
 * pages render, navigation works, optimistic CRUD updates the DOM —
 * without needing Google credentials. Drive persistence is NOT covered
 * here (the fake token can't reach real Drive); that stays in the
 * credential-gated e2e/auth tier.
 *
 * Run locally:
 *   NEXT_PUBLIC_DEV_BYPASS_AUTH=true npm run dev   # or let webServer boot it
 *   npx playwright test e2e/bypass
 */

import { test, expect } from '@playwright/test'

const BYPASS_ON = process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true'

test.describe('dev-bypass dashboard flows', () => {
  test.skip(!BYPASS_ON, 'Set NEXT_PUBLIC_DEV_BYPASS_AUTH=true to run the bypass tier')

  test('dashboard renders the day board without JS errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/dashboard')
    // Greeting says hello to the fake user ("שלום Dev, ...")
    await expect(page.locator('h1, h2').filter({ hasText: 'שלום' }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('todos: quick-add optimistically renders the new todo', async ({ page }) => {
    await page.goto('/todos')
    const input = page.getByLabel('משימה חדשה')
    await expect(input).toBeVisible()
    const title = `e2e todo ${Date.now()}`
    await input.fill(title)
    await input.press('Enter')
    await expect(page.getByText(title)).toBeVisible()
  })

  test('todos: checking a todo moves it to the done section', async ({ page }) => {
    await page.goto('/todos')
    const input = page.getByLabel('משימה חדשה')
    const title = `e2e done ${Date.now()}`
    await input.fill(title)
    await input.press('Enter')
    const item = page.locator('.todos-v2-item').filter({ hasText: title })
    await expect(item).toBeVisible()
    await item.locator('.todos-v2-check').click()
    await expect(page.locator('.todos-v2-item.done').filter({ hasText: title })).toBeVisible()
  })

  test('courses: the add-course path exists (/courses → /courses/extract)', async ({ page }) => {
    await page.goto('/courses')
    const addLink = page.getByRole('link', { name: /הוסף קורס/ })
    // Empty state may route through /credits instead — accept either the
    // banner link or the empty-state CTA, but SOME add path must exist.
    const emptyCta = page.getByRole('link', { name: /הגדר תואר/ })
    await expect(addLink.or(emptyCta).first()).toBeVisible()
  })

  test('assignments page renders with its filter tabs', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/assignments')
    await expect(page.getByRole('heading', { name: /המטלות שלי/ }).first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('mobile: TopNav drawer opens and navigates', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/dashboard')
    await page.getByRole('button', { name: /פתח תפריט/ }).click()
    // The drawer exposes the main nav — click through to todos.
    await page.getByRole('link', { name: /משימות/ }).first().click()
    await expect(page).toHaveURL(/\/todos/)
  })
})
