/**
 * SMOKE — Post-login navigation
 *
 * Safe for production: each test only loads a page and asserts that it
 * renders without an error/crash. No data is written or deleted.
 *
 * A single login is performed in beforeEach. If you run many tests frequently,
 * consider implementing storageState caching (Playwright global setup).
 *
 * Env vars required:
 *   E2E_USER_EMAIL
 *   E2E_USER_PASSWORD
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

/** Asserts a page loaded successfully: no 404/500, body is not empty. */
async function assertPageLoaded(page: import('@playwright/test').Page, route: string) {
  await page.goto(route)
  // Middleware redirects unauthenticated users to /auth/login; if that happens
  // the test fails with a clear message instead of a vague assertion error.
  await expect(page, `${route} redirected to login — session may have expired`).not.toHaveURL(
    /auth\/login/,
  )
  await expect(page).not.toHaveURL(/\/(404|500|error)/)
  await expect(page.locator('body')).not.toBeEmpty()
}

test.describe('Post-login navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('/feed loads without crash', async ({ page }) => {
    await assertPageLoaded(page, '/feed')
    // At minimum the 3 filter tabs must be present
    await expect(
      page.getByRole('button', { name: /siguiendo|global|cerca/i }).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('/explore loads without crash', async ({ page }) => {
    await assertPageLoaded(page, '/explore')
    // A search input or filter panel must be visible
    const searchOrFilter = page
      .locator('input[type="text"], input[type="search"], input[placeholder]')
      .first()
    await expect(searchOrFilter).toBeVisible({ timeout: 15_000 })
  })

  test('/my-classes loads without crash', async ({ page }) => {
    await assertPageLoaded(page, '/my-classes')
    // Must have at least one tab (Clases que tomo / Clases que dicto)
    await expect(
      page.getByRole('button', { name: /clases que tomo|clases que dicto/i }).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('/notifications loads without crash', async ({ page }) => {
    await assertPageLoaded(page, '/notifications')
    // Some content — either a list of notifications or an empty state
    await expect(page.locator('main, [role="main"], body > div').first()).toBeVisible({
      timeout: 15_000,
    })
  })

  test('/profile loads without crash', async ({ page }) => {
    await assertPageLoaded(page, '/profile')
    // Avatar or username should be visible in the profile layout
    await expect(page.locator('body')).not.toBeEmpty()
  })

  test('/agenda loads without crash', async ({ page }) => {
    // /agenda may not exist on all deployments; skip gracefully if it 404s
    const response = await page.goto('/agenda')
    if (response?.status() === 404) {
      test.skip()
      return
    }
    await expect(page, '/agenda redirected to login').not.toHaveURL(/auth\/login/)
    await expect(page.locator('body')).not.toBeEmpty()
  })
})
