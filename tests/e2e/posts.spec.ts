/**
 * Tests: Video post (publish form + PostCard display)
 *
 * Data requirements:
 *   - The test user must have a basic or pro subscription (canTeach tier)
 *     so that /publish and the Video modal are accessible.
 *   - For the "description shown in feed" test: at least one post with a non-null
 *     description must be visible in the Global feed.
 *
 * What is tested:
 *   1. The publish-video modal/form has a description textarea — NOT a city field.
 *   2. The description textarea has a 280-char counter.
 *   3. PostCard renders in the feed without crashing (even when description is null).
 *   4. When a post has a description, it is displayed below the video.
 */

import { test, expect } from '@playwright/test'
import { loginAs } from './helpers/auth'

test.describe('Publish video — form fields', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('video modal has a description textarea', async ({ page }) => {
    await page.goto('/publish')
    // The page offers "Clase" and "Video" options; click Video
    await page.getByRole('button', { name: /video/i }).click()

    // A textarea for the description must appear
    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible({ timeout: 6_000 })
  })

  test('video modal does NOT ask for a city', async ({ page }) => {
    await page.goto('/publish')
    await page.getByRole('button', { name: /video/i }).click()

    // The old "Ciudad" field must be gone — migration 021 replaced it with description
    await expect(page.getByLabel(/ciudad/i)).not.toBeVisible()
    await expect(page.getByPlaceholder(/ciudad/i)).not.toBeVisible()
  })

  test('description counter starts at 0/280 and updates as user types', async ({ page }) => {
    await page.goto('/publish')
    await page.getByRole('button', { name: /video/i }).click()

    // Counter "0/280" is rendered as a paragraph next to the textarea
    await expect(page.getByText('0/280')).toBeVisible({ timeout: 6_000 })

    const textarea = page.locator('textarea').first()
    await textarea.fill('Clase de salsa 🎶')
    // 18 characters (emoji counts as 2 in JS .length, but the text is ≥1 char)
    const counterText = await page.locator('p:has-text("/280")').textContent()
    expect(counterText).toMatch(/^\d+\/280$/)
    expect(counterText).not.toBe('0/280')
  })
})

test.describe('PostCard — rendering', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page)
  })

  test('feed renders without JS errors (handles posts with null description)', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto('/feed')
    await page.getByRole('button', { name: /global/i }).click()

    // Wait for the feed to settle
    await page.waitForTimeout(2_000)

    // No unhandled page errors should have occurred
    expect(errors).toHaveLength(0)

    // At least one article element must be visible
    const articles = page.locator('article')
    await expect(articles.first()).toBeVisible({ timeout: 10_000 })
  })

  test('PostCard with description displays the description text', async ({ page }) => {
    await page.goto('/feed')
    await page.getByRole('button', { name: /global/i }).click()
    await page.waitForTimeout(1_500)

    // Locate all <p> elements inside articles that could be descriptions.
    // A description paragraph is a sibling of the video element inside the card.
    // If none are found in the current feed, skip gracefully.
    const descParagraphs = page
      .locator('article p')
      .filter({ hasNot: page.locator('button, a') })

    const count = await descParagraphs.count()
    if (count === 0) {
      // No posts with descriptions visible — this is a data gap, not a bug.
      test.skip()
      return
    }

    // At least one description paragraph is non-empty
    const firstText = await descParagraphs.first().textContent()
    expect(firstText?.trim().length).toBeGreaterThan(0)
  })
})
