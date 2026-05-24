/**
 * SMOKE — Non-destructive feature checks
 *
 * Safe for production: all tests are READ-ONLY.
 * - Availability: opens the section and inspects the UI — does NOT click any
 *   grid cell or press "Guardar". No DB writes.
 * - Publish video: opens the modal and inspects the form — does NOT submit.
 *   No posts are created.
 * - Feed CTA: reads text from existing cards — no data changed.
 *
 * Env vars required:
 *   E2E_USER_EMAIL
 *   E2E_USER_PASSWORD
 *
 * Env vars optional:
 *   E2E_EXPECT_OWN_CLASS=true  — set only if the test user has at least
 *                                one class they teach visible in the Global feed.
 *                                Without this, the CTA check is skipped.
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

// ─── Availability ─────────────────────────────────────────────────────────────

test.describe('Availability — /agenda (read-only)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('"Mis horarios ocupados" section exists and is expandable', async ({ page }) => {
    const response = await page.goto('/agenda')
    if (response?.status() === 404) {
      test.skip()
      return
    }

    const toggle = page.getByRole('button', { name: /mis horarios ocupados/i })
    await expect(toggle).toBeVisible({ timeout: 15_000 })

    // Expand — READ-ONLY: we only look, we don't click any grid cell
    await toggle.click()

    // The 7×24 grid must appear
    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 10_000 })

    // Legend labels indicate the UI is fully rendered
    await expect(page.getByText('Sueño', { exact: true })).toBeVisible()
    await expect(page.getByText('Ocupado', { exact: true })).toBeVisible()
    await expect(page.getByText('Libre', { exact: true })).toBeVisible()

    // Two sleep-config <select> elements must exist
    const selects = page.locator('select')
    await expect(selects).toHaveCount(2, { timeout: 5_000 })

    // "Guardar" button exists — but we do NOT click it
    await expect(page.getByRole('button', { name: /guardar/i })).toBeVisible()
  })
})

// ─── Publish video form ───────────────────────────────────────────────────────

test.describe('Publish video — form structure (read-only)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('/publish → Video modal has description textarea, NO city field', async ({ page }) => {
    await page.goto('/publish')
    await expect(page).not.toHaveURL(/auth\/login/)

    // Click the Video option to open the modal
    await page.getByRole('button', { name: /video/i }).click()

    // Description textarea must be present — this replaced the old "Ciudad" field
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 10_000 })

    // "Ciudad" must NOT appear (migration 021 removed it)
    await expect(page.getByLabel(/ciudad/i)).not.toBeVisible()
    await expect(page.getByPlaceholder(/ciudad/i)).not.toBeVisible()

    // Character counter (0/280) must be visible
    await expect(page.getByText('0/280')).toBeVisible()

    // The submit button exists — but we do NOT click it
    const submitBtn = page.getByRole('button', { name: /publicar/i })
    await expect(submitBtn).toBeVisible()
  })
})

// ─── Feed — ClassCard CTA ─────────────────────────────────────────────────────

test.describe('Feed — ClassCard CTA (read-only)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('every visible ClassCard shows "Ver clase", never "Editar" as primary CTA', async ({
    page,
  }) => {
    await page.goto('/feed')
    await page.getByRole('button', { name: /global/i }).click()

    // Wait for at least one card
    const firstCard = page.locator('article').first()
    await expect(firstCard).toBeVisible({ timeout: 15_000 })

    // Inspect up to the first 5 cards that are ClassCards (have a price section)
    const cards = page.locator('article')
    const count = await cards.count()
    const limit = Math.min(count, 5)

    for (let i = 0; i < limit; i++) {
      const card = cards.nth(i)
      const hasVerClase = (await card.getByRole('link', { name: /ver clase/i }).count()) > 0
      const hasEditarAsCTA =
        (await card.getByRole('link', { name: /^editar$/i }).count()) > 0

      if (hasVerClase) {
        // "Editar" must never appear as a top-level CTA alongside "Ver clase"
        expect(
          hasEditarAsCTA,
          `Card ${i + 1}: found "Editar" as CTA — ClassCard should only show "Ver clase"`,
        ).toBe(false)
      }
      // If neither is present the card is a PostCard — that's fine, skip it
    }
  })

  test('own-class card shows "Ver clase" CTA (conditional — set E2E_EXPECT_OWN_CLASS=true)', async ({
    page,
  }) => {
    if (process.env.E2E_EXPECT_OWN_CLASS !== 'true') {
      test.skip()
      return
    }

    await page.goto('/feed')
    await page.getByRole('button', { name: /global/i }).click()
    await page.waitForTimeout(1_500)

    // Find a ClassCard whose "Ver clase" link leads to a class the user owns.
    // We detect ownership by navigating to the detail page and checking for "Editar".
    const classLinks = page.locator('article').getByRole('link', { name: /ver clase/i })
    const linkCount = await classLinks.count()

    if (linkCount === 0) {
      // No classes visible in the current feed slice — informative skip
      test.skip()
      return
    }

    let foundOwnClass = false
    for (let i = 0; i < Math.min(linkCount, 10); i++) {
      const href = await classLinks.nth(i).getAttribute('href')
      if (!href) continue

      // Open the detail in the same tab and check for the Editar link
      await page.goto(href)
      const isOwnClass = (await page.getByRole('link', { name: /^editar$/i }).count()) > 0

      if (isOwnClass) {
        foundOwnClass = true
        // Go back to the feed card and verify the CTA
        await page.goto('/feed')
        await page.getByRole('button', { name: /global/i }).click()
        const card = page.locator(`article:has(a[href="${href}"])`)
        await expect(card.getByRole('link', { name: /ver clase/i })).toBeVisible()
        await expect(card.getByRole('link', { name: /^editar$/i })).not.toBeVisible()
        break
      }

      await page.goto('/feed')
      await page.getByRole('button', { name: /global/i }).click()
      await page.waitForTimeout(500)
    }

    if (!foundOwnClass) {
      // Test user has no own classes in the current feed slice
      test.skip()
    }
  })
})
