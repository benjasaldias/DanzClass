/**
 * Tests: Class card navigation
 *
 * Data requirements (must hold for the test user):
 *   - At least one active class visible in the Global feed.
 *   - At least one class the user TEACHES (visible in /my-classes → "Clases que dicto").
 *
 * What is tested:
 *   1. ClassCard always shows "Ver clase" as CTA (not "Editar").
 *   2. "Ver clase" navigates to /class/[id].
 *   3. The class owner sees an "Editar" link on the class detail page.
 *   4. Clicking a class title in /my-classes → Teaching tab navigates to /class/[id].
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

test.describe('ClassCard — CTA and navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('ClassCard shows "Ver clase" button for every class', async ({ page }) => {
    await page.goto('/feed')
    // Switch to Global tab to maximise the chance of finding at least one class
    await page.getByRole('button', { name: /global/i }).click()

    // Wait until at least one article (ClassCard or PostCard) is visible
    const firstCard = page.locator('article').first()
    await expect(firstCard).toBeVisible({ timeout: 12_000 })

    // "Ver clase" must appear; it is the only CTA on every ClassCard regardless of ownership
    await expect(firstCard.getByRole('link', { name: /ver clase/i })).toBeVisible()
    // "Editar" must NOT be a CTA on ClassCard (it lives only on the detail page)
    await expect(firstCard.getByRole('link', { name: /^editar$/i })).not.toBeVisible()
  })

  test('"Ver clase" navigates to /class/[id]', async ({ page }) => {
    await page.goto('/feed')
    await page.getByRole('button', { name: /global/i }).click()

    const firstCard = page.locator('article').first()
    await expect(firstCard).toBeVisible({ timeout: 12_000 })

    await firstCard.getByRole('link', { name: /ver clase/i }).click()
    await expect(page).toHaveURL(/\/class\/[a-zA-Z0-9-]+$/, { timeout: 10_000 })
  })

  test('class owner sees "Editar" link on class detail page', async ({ page }) => {
    // Navigate to the teaching tab in /my-classes to find a class the user owns
    await page.goto('/my-classes')
    await page.getByRole('button', { name: /clases que dicto/i }).click()

    // The class title is rendered as a <Link href="/class/[id]"> inside the accordion
    const firstTitleLink = page.locator('a[href^="/class/"]').first()
    await expect(firstTitleLink).toBeVisible({ timeout: 8_000 })

    const href = await firstTitleLink.getAttribute('href')
    expect(href).toMatch(/^\/class\//)

    await page.goto(href!)
    // On the detail page the teacher should see an "Editar" pill/button
    await expect(page.getByRole('link', { name: /^editar$/i })).toBeVisible({ timeout: 8_000 })
  })

  test('clicking class title in /my-classes teaching tab navigates to /class/[id]', async ({ page }) => {
    await page.goto('/my-classes')
    await page.getByRole('button', { name: /clases que dicto/i }).click()

    // The class title Link has stopPropagation so clicking it should navigate
    // without toggling the parent accordion
    const titleLink = page.locator('a[href^="/class/"]').first()
    await expect(titleLink).toBeVisible({ timeout: 8_000 })

    await titleLink.click()
    await expect(page).toHaveURL(/\/class\/[a-zA-Z0-9-]+$/, { timeout: 10_000 })
  })
})
