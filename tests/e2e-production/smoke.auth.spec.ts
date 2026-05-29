/**
 * SMOKE — Authentication flow
 *
 * Safe for production: only tests the login page with valid credentials.
 * The "wrong password" case is intentionally omitted from the production suite
 * to avoid Supabase rate-limiting the test account.
 *
 * Env vars required:
 *   E2E_USER_EMAIL
 *   E2E_USER_PASSWORD
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

test.describe('Authentication', () => {
  test('valid credentials → redirects to /feed and shows the app shell', async ({ page }) => {
    await loginAs(page)

    // Confirm we landed somewhere inside the app (not back on login)
    await expect(page).not.toHaveURL(/auth\/login/)

    // The app shell (bottom nav or top bar) should be present
    // BottomNav has links to feed, explore, etc.
    const navOrTopBar = page.locator('nav, [role="navigation"]').first()
    await expect(navOrTopBar).toBeVisible({ timeout: 15_000 })
  })

  test('/feed is accessible after login', async ({ page }) => {
    await loginAs(page)
    // Navigate explicitly in case the post-login redirect went elsewhere
    await page.goto('/feed')
    await expect(page).not.toHaveURL(/auth\/login/)
    await expect(page).toHaveURL(/\/feed/, { timeout: 15_000 })
  })

  test('protected route /my-classes redirects to login when not authenticated', async ({
    page,
  }) => {
    // SAFE: just checks the redirect behaviour, no login involved
    await page.goto('/my-classes')
    await expect(page).toHaveURL(/auth\/login/, { timeout: 15_000 })
  })
})
