/**
 * SMOKE — Public routes (no authentication required)
 *
 * Safe for production: these tests only load public pages and assert
 * on static content. Nothing is written to the database.
 *
 * Env vars used:
 *   E2E_PUBLIC_CLASS_ID  — optional UUID; if set, also checks /class/[id]
 */

import { test, expect } from '@playwright/test'

test.describe('Public routes', () => {
  test('/ — landing page loads with a call-to-action', async ({ page }) => {
    await page.goto('/')
    // The page should load without an error overlay
    await expect(page).not.toHaveURL(/error|500|404/)
    // There is some visible body content (heading or link)
    const body = page.locator('body')
    await expect(body).not.toBeEmpty()
    // At minimum a link to login or register must be present
    const hasAuthLink =
      (await page.getByRole('link', { name: /crear cuenta|iniciar sesión|entrar|login|register/i }).count()) > 0
    expect(hasAuthLink, 'Landing page should have a login or register CTA').toBe(true)
  })

  test('/terms — Terms of Use page loads with legal content', async ({ page }) => {
    await page.goto('/terms')
    await expect(page).not.toHaveURL(/error|500|404/)
    // The page must contain "Términos" or "Condiciones"
    await expect(
      page.getByText(/términos|condiciones de uso/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('/privacy — Privacy Policy page loads with legal content', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page).not.toHaveURL(/error|500|404/)
    // The page must contain "Privacidad" or "Datos"
    await expect(
      page.getByText(/política de privacidad|datos personales/i).first(),
    ).toBeVisible({ timeout: 15_000 })
  })

  test('/auth/login — login page renders the form', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /iniciar sesión/i })).toBeVisible()
  })

  test('/class/[id] — public class detail loads without login (conditional)', async ({ page }) => {
    const classId = process.env.E2E_PUBLIC_CLASS_ID
    if (!classId) {
      test.skip()
      return
    }

    await page.goto(`/class/${classId}`)
    // Should NOT redirect to login — /class/* is a public route
    await expect(page).not.toHaveURL(/auth\/login/)
    // The page must have some class-specific content
    await expect(
      page.getByRole('heading').first(),
    ).toBeVisible({ timeout: 15_000 })
    // "Inicia sesión para reservar" is the anonymous CTA — verify no crash
    await expect(page.locator('body')).not.toBeEmpty()
  })
})
